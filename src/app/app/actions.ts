'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db, getSettings } from '@/lib/db';
import { requireMember, requireOwner } from '@/lib/auth';
import { addrKey, isCode, isEntity, normalizeCode, randomCode, titleCase, toE164 } from '@/lib/text';
import { recordResponse, setStage, STAGE_LABEL, TIERS, type Stage } from '@/lib/leads';
import { sendText, sendblueConfigured, sleep, webhookUrl } from '@/lib/sendblue';
import { upsertSubscriber } from '@/lib/subscribers';

const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

/* ---------------- Import ---------------- */
export type ImportRow = {
  code?: string; owner: string; owner2?: string; first_name?: string;
  prop_address: string; prop_city?: string; prop_state?: string; prop_zip?: string;
  mail_address: string; mail_city?: string; mail_state?: string; mail_zip?: string;
  apn?: string; owner_type?: string; prop_type?: string; beds?: string; baths?: string; sqft?: string;
  year_built?: string; est_value?: string; last_sale?: string;
};
export type ImportResult = { added: number; dupes: number; excluded: number; skipped: number; keptCodes: number; error?: string };

export async function importHouseholds(rows: ImportRow[], source: string): Promise<ImportResult> {
  await requireMember();
  const sql = db();
  const settings = await getSettings();
  if (!Array.isArray(rows) || rows.length > 2000) return { added: 0, dupes: 0, excluded: 0, skipped: 0, keptCodes: 0, error: 'Send at most 2,000 rows at a time.' };
  const excl = new Set((await sql<{ addr_key: string }[]>`select addr_key from ww.exclusions`).map((r) => r.addr_key.split('|')[0]));
  const existingKeys = new Set((await sql<{ addr_key: string }[]>`select addr_key from ww.households where addr_key is not null`).map((r) => r.addr_key));
  const taken = new Set((await sql<{ code: string }[]>`select code from ww.households`).map((r) => r.code));
  let dupes = 0, excluded = 0, skipped = 0, keptCodes = 0;
  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];
  for (const r of rows) {
    if (!r.prop_address || !r.mail_address) { skipped++; continue; }
    const key = addrKey(r.prop_address, r.prop_zip);
    if (seen.has(key) || existingKeys.has(key)) { dupes++; continue; }
    seen.add(key);
    let code = r.code ? normalizeCode(r.code) : '';
    if (code && isCode(code) && !taken.has(code)) keptCodes++;
    else { do { code = randomCode(settings.code_prefix); } while (taken.has(code)); }
    taken.add(code);
    const owner = titleCase(r.owner) || 'Current Owner';
    const isExcluded = excl.has(key.split('|')[0]);
    if (isExcluded) excluded++;
    out.push({
      code, owner, owner2: titleCase(r.owner2) || null,
      first_name: r.first_name ? titleCase(r.first_name) : isEntity(owner) ? null : owner.split(' ')[0] || null,
      prop_address: titleCase(r.prop_address), prop_city: titleCase(r.prop_city) || null, prop_state: (r.prop_state || '').toUpperCase() || null, prop_zip: r.prop_zip || null,
      mail_address: titleCase(r.mail_address), mail_city: titleCase(r.mail_city) || null, mail_state: (r.mail_state || '').toUpperCase() || null, mail_zip: r.mail_zip || null,
      apn: r.apn || null, owner_type: r.owner_type || (isEntity(owner) ? 'Entity' : null), prop_type: r.prop_type || null,
      beds: r.beds || null, baths: r.baths || null, sqft: r.sqft || null, year_built: r.year_built || null, est_value: r.est_value || null, last_sale: r.last_sale || null,
      source: source.slice(0, 120) || 'Import', addr_key: key, excluded: isExcluded, exclude_reason: isExcluded ? 'MiCasa owner' : null,
    });
  }
  for (let i = 0; i < out.length; i += 500) {
    const chunk = out.slice(i, i + 500);
    await sql`insert into ww.households ${sql(chunk)} on conflict do nothing`;
  }
  revalidatePath('/app', 'layout');
  return { added: out.length, dupes, excluded, skipped, keptCodes };
}

/* ---------------- Households ---------------- */
export async function addContact() {
  const me = await requireMember();
  const sql = db();
  const settings = await getSettings();
  let code = randomCode(settings.code_prefix);
  for (let i = 0; i < 20; i++) { const x = await sql`select 1 from ww.households where code = ${code}`; if (!x.length) break; code = randomCode(settings.code_prefix); }
  await sql`insert into ww.households (code, owner, source, manual) values (${code}, 'New contact', ${'Added by ' + me.email}, true)`;
  redirect(`/app/households/${code}?edit=1`);
}

export async function saveHousehold(code: string, f: FormData) {
  const me = await requireMember();
  const owner = s(f, 'owner');
  if (!owner) return;
  const prop = s(f, 'prop_address'), zip = s(f, 'prop_zip');
  const sql = db();
  await sql`update ww.households set owner = ${owner}, owner2 = ${s(f, 'owner2') || null}, first_name = ${s(f, 'first_name') || null},
    prop_address = ${prop || null}, prop_city = ${s(f, 'prop_city') || null}, prop_state = ${s(f, 'prop_state').toUpperCase() || null}, prop_zip = ${zip || null},
    mail_address = ${s(f, 'mail_address') || null}, mail_city = ${s(f, 'mail_city') || null}, mail_state = ${s(f, 'mail_state').toUpperCase() || null}, mail_zip = ${s(f, 'mail_zip') || null},
    addr_key = ${prop ? addrKey(prop, zip) : null}, updated_at = now() where code = ${code}`;
  await sql`insert into ww.events (code, type, note, by_email) values (${code}, 'edit', 'Contact details updated', ${me.email})`;
  revalidatePath(`/app/households/${code}`);
  redirect(`/app/households/${code}`);
}

export async function setExcluded(code: string, excluded: boolean, f?: FormData) {
  const me = await requireMember();
  const reason = f ? s(f, 'reason') || 'Do not contact' : null;
  await db()`update ww.households set excluded = ${excluded}, exclude_reason = ${excluded ? reason : null}, updated_at = now() where code = ${code}`;
  await db()`insert into ww.events (code, type, note, by_email) values (${code}, 'note', ${excluded ? 'Excluded from mailings: ' + reason : 'Back on the mailing list'}, ${me.email})`;
  revalidatePath(`/app/households/${code}`);
}

/* ---------------- Responses and leads ---------------- */
export async function logActivity(code: string, f: FormData) {
  const me = await requireMember();
  const type = s(f, 'type') || 'call';
  const date = s(f, 'date');
  const note = s(f, 'note');
  const mailing = s(f, 'mailing');
  if (type === 'note' && !note) return;
  const at = date && date !== new Date().toISOString().slice(0, 10) ? new Date(date + 'T16:00:00Z') : new Date();
  if (type === 'note') {
    await db()`insert into ww.events (code, type, note, by_email) values (${code}, 'note', ${note}, ${me.email})`;
  } else {
    await recordResponse({ code, type, at, note, by: me.email, mailingId: mailing === 'auto' || !mailing ? 'auto' : mailing === 'none' ? null : mailing });
  }
  const phone = toE164(s(f, 'phone'));
  if (f.get('alerts') === 'on' && phone) {
    await upsertSubscriber({ phone, code, email: s(f, 'email') || null, name: null, method: type === 'call' ? 'Phone call (verbal)' : 'In person', consentText: 'Verbal agreement recorded by ' + me.email, ip: null, by: me.email });
  }
  revalidatePath(`/app/households/${code}`);
}

export async function saveLead(code: string, f: FormData) {
  const me = await requireMember();
  const settings = await getSettings();
  const stage = s(f, 'stage') as Stage;
  if (!(stage in STAGE_LABEL)) return;
  const tier = s(f, 'tier');
  if (tier && !(TIERS as readonly string[]).includes(tier)) return;
  let value = Number(s(f, 'annual_value')) || 0;
  if (tier && !value) value = Number(settings.tier_values[tier] ?? 0);
  if (stage === 'client' && !tier) redirect(`/app/households/${code}?error=${encodeURIComponent('Choose their plan before marking them a client.')}`);
  const follow = s(f, 'follow_up') || null;
  await db()`update ww.leads set tier = ${tier || null}, annual_value = ${value}, follow_up = ${follow}, updated_at = now() where code = ${code}`;
  await setStage(code, stage, me.email, { tier, value });
  revalidatePath(`/app/households/${code}`);
}

export async function assignToMe(code: string) {
  const me = await requireMember();
  await db()`update ww.leads set assignee = ${me.email}, updated_at = now() where code = ${code}`;
  revalidatePath(`/app/households/${code}`);
}

/* ---------------- Subscribers ---------------- */
export async function setSubscriberStatus(id: string, active: boolean) {
  await requireMember();
  await db()`update ww.subscribers set status = ${active ? 'active' : 'stopped'}, stopped_at = ${active ? null : new Date()}, updated_at = now() where id = ${id}`;
  revalidatePath('/app/alerts');
}

/* ---------------- Mailings ---------------- */
export async function createMailing(f: FormData) {
  const me = await requireMember();
  const sql = db();
  const name = s(f, 'name');
  const kind = s(f, 'kind') === 'postcard' ? 'postcard' : 'letter';
  const audience = s(f, 'audience') || 'all';
  const towns = f.getAll('towns').map(String);
  const cost = Number(s(f, 'cost')) || 0;
  const extra = Number(s(f, 'extra')) || 0;
  if (!name) redirect('/app/mailings/new?error=' + encodeURIComponent('Give the mailing a name.'));
  const townFilter = towns.length ? sql`and coalesce(nullif(h.prop_city,''),'Unknown') in ${sql(towns)}` : sql`and false`;
  const sentBefore = sql`exists (select 1 from ww.mailing_recipients r join ww.mailings m on m.id=r.mailing_id where r.code=h.code and m.status='sent')`;
  const codes = await sql<{ code: string }[]>`
    select h.code from ww.households h left join ww.leads l on l.code = h.code
    where not h.excluded and coalesce(l.stage,'') not in ('client','lost') and h.mail_address is not null ${townFilter}
    ${audience === 'new' ? sql`and not ${sentBefore}` : sql``}
    ${audience === 'noresp' ? sql`and ${sentBefore} and l.code is null` : sql``}`;
  if (!codes.length) redirect('/app/mailings/new?error=' + encodeURIComponent('No households match. Change who gets it or the towns.'));
  const [m] = await sql<{ id: string }[]>`insert into ww.mailings (name, kind, planned_date, cost_per_piece, extra_cost, audience, towns, created_by)
    values (${name}, ${kind}, ${s(f, 'planned_date') || null}, ${cost}, ${extra}, ${audience}, ${towns}, ${me.email}) returning id`;
  const recips = codes.map((c) => ({ mailing_id: m.id, code: c.code }));
  for (let i = 0; i < recips.length; i += 1000) await sql`insert into ww.mailing_recipients ${sql(recips.slice(i, i + 1000))}`;
  revalidatePath('/app/mailings');
  redirect('/app/mailings?created=' + m.id);
}

export async function markMailed(id: string, f: FormData) {
  await requireMember();
  const date = s(f, 'sent_date') || new Date().toISOString().slice(0, 10);
  await db()`update ww.mailings set status = 'sent', sent_date = ${date} where id = ${id} and status = 'draft'`;
  revalidatePath('/app', 'layout');
}

export async function deleteMailing(id: string) {
  await requireMember();
  await db()`delete from ww.mailings where id = ${id} and status = 'draft'`;
  revalidatePath('/app/mailings');
}

/* ---------------- Storm alerts ---------------- */
export async function saveAlertDraft(f: FormData) {
  const me = await requireMember();
  const id = s(f, 'id');
  const message = s(f, 'message');
  const type = s(f, 'type') || 'custom';
  if (!message) return;
  if (id) await db()`update ww.alerts set message = ${message}, type = ${type} where id = ${id} and status = 'draft'`;
  else await db()`insert into ww.alerts (type, message, source, approved_by) values (${type}, ${message}, 'manual', ${me.email})`;
  revalidatePath('/app/alerts');
}

export async function cancelAlert(id: string) {
  await requireMember();
  await db()`update ww.alerts set status = 'cancelled' where id = ${id} and status = 'draft'`;
  revalidatePath('/app', 'layout');
}

export async function sendAlert(id: string, f: FormData) {
  const me = await requireMember();
  const sql = db();
  const settings = await getSettings();
  const back = (msg: string) => redirect('/app/alerts?error=' + encodeURIComponent(msg));
  if (!sendblueConfigured()) back('Texting is not connected yet. Add the Sendblue keys first.');
  if (!settings.alerts_enabled) back('Texting is switched off. Turn it on in Settings when you are ready to send.');
  if (s(f, 'confirm') !== 'SEND') back('Type SEND in the box to confirm.');
  const message = s(f, 'message');
  if (!message) back('The message is empty.');
  if (/\[[A-Z ]+\]/.test(message)) back('Replace the words in [brackets] before sending.');
  // Claim the alert so two people cannot send it twice.
  const claimed = await sql`update ww.alerts set status = 'sending', message = ${message}, approved_by = ${me.email} where id = ${id} and status = 'draft' returning id`;
  if (!claimed.length) back('This alert was already sent or cancelled.');
  const subs = await sql<{ id: string; phone: string }[]>`select id, phone from ww.subscribers where status = 'active'`;
  await sql`update ww.alerts set recipients = ${subs.length} where id = ${id}`;
  let delivered = 0, failed = 0;
  for (const sub of subs) {
    const r = await sendText(sub.phone, message, webhookUrl('status'));
    if (r.ok) delivered++; else failed++;
    await sql`insert into ww.alert_deliveries (alert_id, subscriber_id, phone, status, provider_id, error, sent_at)
      values (${id}, ${sub.id}, ${sub.phone}, ${r.ok ? r.status ?? 'QUEUED' : 'ERROR'}, ${r.handle ?? null}, ${r.error ?? null}, now())
      on conflict do nothing`;
    await sleep(250);
  }
  await sql`update ww.alerts set status = 'sent', sent_at = now(), delivered = ${delivered}, failed = ${failed} where id = ${id}`;
  revalidatePath('/app', 'layout');
  redirect(`/app/alerts?sent=${delivered}&failed=${failed}`);
}

export async function sendTestText(f: FormData) {
  await requireMember();
  const phone = toE164(s(f, 'phone'));
  if (!phone) redirect('/app/settings?error=' + encodeURIComponent('Enter a valid US mobile number.'));
  const r = await sendText(phone, 'MiCasa Stays Winter Watch: test message. Texting is connected.');
  redirect('/app/settings?' + (r.ok ? 'tested=1' : 'error=' + encodeURIComponent('Test text failed: ' + (r.error ?? 'unknown error'))));
}

export async function setCheckStatus(id: string, status: string) {
  await requireMember();
  if (!['new', 'scheduled', 'done', 'cancelled'].includes(status)) return;
  await db()`update ww.check_requests set status = ${status} where id = ${id}`;
  revalidatePath('/app', 'layout');
}

/* ---------------- Settings ---------------- */
export async function saveSettings(f: FormData) {
  await requireOwner();
  const tv: Record<string, number> = {};
  for (const t of TIERS) tv[t] = Number(s(f, 'tier_' + t)) || 0;
  const site = s(f, 'site_url').replace(/\/$/, '');
  const alertPhone = s(f, 'team_alert_phone') ? toE164(s(f, 'team_alert_phone')) : null;
  await db()`update ww.settings set
    code_prefix = ${(s(f, 'code_prefix') || 'WW').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'WW'},
    site_url = ${site || 'https://watch.micasastays.com'}, print_url = ${s(f, 'print_url') || 'watch.micasastays.com'},
    cost_letter = ${Number(s(f, 'cost_letter')) || 0}, cost_postcard = ${Number(s(f, 'cost_postcard')) || 0},
    check_price = ${Number(s(f, 'check_price')) || 65}, tier_values = ${db().json(tv)},
    team_alert_phone = ${alertPhone}, alerts_enabled = ${f.get('alerts_enabled') === 'on'}, updated_at = now() where id = 1`;
  revalidatePath('/app', 'layout');
  redirect('/app/settings?saved=1');
}

export async function saveExclusions(f: FormData) {
  await requireMember();
  const sql = db();
  const lines = s(f, 'exclusions').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  await sql.begin(async (tx) => {
    await tx`delete from ww.exclusions`;
    const rows = [...new Map(lines.map((a) => [addrKey(a).split('|')[0] + '|', { addr_key: addrKey(a).split('|')[0] + '|', address: a }])).values()];
    if (rows.length) await tx`insert into ww.exclusions ${tx(rows)}`;
  });
  // Mark matching households on the list
  const keys = lines.map((a) => addrKey(a).split('|')[0]);
  let marked = 0;
  if (keys.length) {
    const r = await sql`update ww.households set excluded = true, exclude_reason = 'MiCasa owner', updated_at = now()
      where not excluded and split_part(addr_key, '|', 1) in ${sql(keys)} returning code`;
    marked = r.length;
  }
  revalidatePath('/app', 'layout');
  redirect('/app/settings?excluded=' + marked);
}

export async function addTeamMember(f: FormData) {
  await requireOwner();
  const email = s(f, 'email').toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) redirect('/app/settings?error=' + encodeURIComponent('Enter a valid email address.'));
  await db()`insert into ww.team_members (email, name, role) values (${email}, ${s(f, 'name') || null}, ${s(f, 'role') === 'owner' ? 'owner' : 'member'})
    on conflict (email) do update set name = excluded.name, role = excluded.role`;
  revalidatePath('/app/settings');
}

export async function removeTeamMember(email: string) {
  const me = await requireOwner();
  if (email === me.email) return;
  await db()`delete from ww.team_members where email = ${email}`;
  revalidatePath('/app/settings');
}

