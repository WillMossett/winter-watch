'use server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { db, getSettings } from '@/lib/db';
import { isCode, normalizeCode, randomCode, toE164 } from '@/lib/text';
import { recordResponse } from '@/lib/leads';
import { upsertSubscriber } from '@/lib/subscribers';
import { ALERT_CONSENT_TEXT } from '@/lib/consent';
import { sendText } from '@/lib/sendblue';
import { REPLIES } from '@/lib/keywords';

async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || 'unknown';
}

// At most `max` hits per key in the last hour.
async function allowed(key: string, max: number): Promise<boolean> {
  const sql = db();
  await sql`delete from ww.rate_hits where at < now() - interval '1 day'`;
  const [r] = await sql<{ n: number }[]>`select count(*)::int as n from ww.rate_hits where key = ${key} and at > now() - interval '1 hour'`;
  if (r.n >= max) return false;
  await sql`insert into ww.rate_hits (key) values (${key})`;
  return true;
}

export async function submitInterest(form: FormData) {
  const raw = String(form.get('code') ?? '');
  const typed = String(form.get('typed_code') ?? '');
  const code = normalizeCode(raw || typed);
  const back = isCode(code) ? `/${code}` : '/';
  const fail = (msg: string) => redirect(`${back}?error=${encodeURIComponent(msg)}#form`);
  if (String(form.get('website') ?? '')) redirect(`${back}?thanks=1`); // honeypot: bots fill hidden fields
  const ip = await clientIp();
  if (!(await allowed('form:' + ip, 8))) fail('Too many tries from this connection. Please call or email us instead.');

  const name = String(form.get('name') ?? '').trim().slice(0, 120);
  const email = String(form.get('email') ?? '').trim().slice(0, 160);
  const phoneRaw = String(form.get('phone') ?? '').trim();
  const phone = phoneRaw ? toE164(phoneRaw) : null;
  const message = String(form.get('message') ?? '').trim().slice(0, 2000);
  const wantsWalkthrough = form.get('walkthrough') === 'on';
  const wantsAlerts = form.get('alerts') === 'on';
  if (!name) fail('Please add your name.');
  if (phoneRaw && !phone) fail('That phone number does not look right. Use a 10-digit US number.');
  if (!phone && !email) fail('Please add a phone number or an email so we can reach you.');
  if (wantsAlerts && !phone) fail('Add a mobile number to get storm alerts by text.');
  if (!wantsWalkthrough && !wantsAlerts && !message) fail('Choose what you would like, or leave us a message.');

  const sql = db();
  const settings = await getSettings();
  const known = isCode(code) ? (await sql`select 1 from ww.households where code = ${code}`).length > 0 : false;
  const wants = [wantsWalkthrough && 'free walkthrough', wantsAlerts && 'storm alerts'].filter(Boolean).join(' and ');
  const note = [`${name} asked for ${wants || 'information'}`, phone && `phone ${phone}`, email && `email ${email}`, message && `“${message}”`].filter(Boolean).join(' · ');

  let householdCode: string | null = null;
  if (known) {
    householdCode = code;
    await recordResponse({ code, type: 'form', note, stageIfNew: wantsAlerts && !wantsWalkthrough && !message ? 'alerts' : 'responded', meta: { ip, walkthrough: wantsWalkthrough } });
    if (wantsWalkthrough) await sql`update ww.leads set follow_up = coalesce(follow_up, current_date) where code = ${code}`;
  } else {
    // No valid code: start a hand-entered contact so nobody is lost.
    let newCode = randomCode(settings.code_prefix);
    for (let i = 0; i < 20 && (await sql`select 1 from ww.households where code = ${newCode}`).length; i++) newCode = randomCode(settings.code_prefix);
    await sql`insert into ww.households (code, owner, first_name, source, manual) values (${newCode}, ${name}, ${name.split(' ')[0]}, ${'Web form' + (typed ? ' (typed code ' + typed.slice(0, 12) + ')' : '')}, true) `;
    householdCode = newCode;
    await recordResponse({ code: newCode, type: 'form', note, mailingId: null, meta: { ip, typedCode: typed || null } });
    if (wantsWalkthrough) await sql`update ww.leads set follow_up = current_date where code = ${newCode}`;
  }

  if (wantsAlerts && phone) {
    await upsertSubscriber({ phone, code: householdCode, email: email || null, name, method: 'Web form', consentText: ALERT_CONSENT_TEXT, ip, promote: !wantsWalkthrough && !message });
    if (settings.alerts_enabled) await sendText(phone, REPLIES.started);
  }
  redirect(`${back}?thanks=1#form`);
}
