import 'server-only';
import { randomBytes } from 'node:crypto';
import { db, getSettings } from './db';
import { sendText } from './sendblue';
import { prettyPhone, toE164 } from './text';
import { templateFor, hasIssue, issuesSummary, KIND_LABEL, type Answer, type VisitKind } from './checklist';

const TODAY = `(now() at time zone 'America/Detroit')::date`;

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://watch.micasastays.com').replace(/\/$/, '');
}

function token(): string {
  return randomBytes(16).toString('base64url');
}

// Make the next week of visits for every active plan, and mark weekly visits more than 2 days late as missed.
export async function ensureVisits(daysAhead = 7) {
  const sql = db();
  await sql.unsafe(`
    insert into ww.visits (code, kind, due_date, tech_email, send_to, source)
    select p.code, 'weekly', d::date, p.tech_email, p.owner_phone, 'plan'
    from ww.service_plans p
    cross join lateral generate_series(greatest(p.start_date, ${TODAY}), ${TODAY} + ${Number(daysAhead)}, interval '1 day') d
    where p.active
      and (p.end_date is null or d::date <= p.end_date)
      and ((d::date - p.start_date) % p.interval_days) = 0
    on conflict (code, due_date) where kind = 'weekly' do nothing`);
  await sql.unsafe(`update ww.visits set status = 'missed', updated_at = now()
    where kind = 'weekly' and status = 'scheduled' and due_date < ${TODAY} - 2`);
}

// A free-photo visit for a new lead (from a text or the web form). One open photo visit per home.
export async function createPhotoVisit(code: string, phone: string | null, source: 'text' | 'form') {
  const sql = db();
  const open = await sql`select id from ww.visits where code = ${code} and kind = 'photo' and status = 'scheduled'`;
  if (open.length) {
    if (phone) await sql`update ww.visits set send_to = coalesce(send_to, ${phone}) where id = ${open[0].id}`;
    return open[0].id as string;
  }
  const [v] = await sql`insert into ww.visits (code, kind, due_date, send_to, source)
    values (${code}, 'photo', ${sql.unsafe(TODAY)}, ${phone}, ${source}) returning id`;
  return v.id as string;
}

// A storm check after a subscriber or client replies CHECK.
export async function createStormVisit(code: string, phone: string | null) {
  const sql = db();
  const open = await sql`select id from ww.visits where code = ${code} and kind = 'storm' and status = 'scheduled'`;
  if (open.length) return open[0].id as string;
  const [plan] = await sql`select tech_email, owner_phone from ww.service_plans where code = ${code}`;
  const [v] = await sql`insert into ww.visits (code, kind, due_date, tech_email, send_to, source)
    values (${code}, 'storm', ${sql.unsafe(TODAY)}, ${plan?.tech_email ?? null}, ${plan?.owner_phone ?? phone}, 'check') returning id`;
  return v.id as string;
}

export type FieldVisit = {
  id: string; code: string; kind: VisitKind; due_date: string; status: string; tech_email: string | null;
  address: string; city: string; owner: string; access_notes: string | null; extra_items: string[];
  last_note: string | null; last_date: string | null; has_phone: boolean;
};

// Everything the phone needs to work offline for the next week.
export async function fieldData(email: string) {
  await ensureVisits(7);
  const sql = db();
  const visits = await sql<FieldVisit[]>`
    select v.id, v.code, v.kind, v.due_date::text, v.status, v.tech_email,
      coalesce(h.prop_address, '') as address, coalesce(h.prop_city, '') as city, coalesce(h.owner, '') as owner,
      p.access_notes, coalesce(p.extra_items, '[]'::jsonb) as extra_items,
      (coalesce(v.send_to, p.owner_phone) is not null) as has_phone,
      last.notes as last_note, last.d as last_date
    from ww.visits v
    join ww.households h on h.code = v.code
    left join ww.service_plans p on p.code = v.code
    left join lateral (select x.notes, (x.completed_at at time zone 'America/Detroit')::date::text as d from ww.visits x
      where x.code = v.code and x.status = 'done' order by x.completed_at desc limit 1) last on true
    where v.status = 'scheduled'
      and v.due_date <= ${sql.unsafe(TODAY)} + 6
      and (v.tech_email is null or v.tech_email = ${email})
    order by v.due_date, h.prop_city, h.prop_address`;
  const homes = await sql<{ code: string; address: string; city: string; owner: string; access_notes: string | null; extra_items: string[] }[]>`
    select p.code, coalesce(h.prop_address,'') as address, coalesce(h.prop_city,'') as city, coalesce(h.owner,'') as owner,
      p.access_notes, p.extra_items
    from ww.service_plans p join ww.households h on h.code = p.code
    where p.active order by h.prop_city, h.prop_address`;
  return { visits, homes, today: (await sql<{ d: string }[]>`select ${sql.unsafe(TODAY)}::text as d`)[0].d };
}

// The phone made up its own id for a visit it started on the spot (no scheduled visit). Create the row once.
export async function ensureVisitRow(visitId: string, code: string, kind: VisitKind, email: string) {
  const sql = db();
  const existing = await sql`select id, code from ww.visits where id = ${visitId}`;
  if (existing.length) {
    if (existing[0].code !== code) throw new Error('That visit belongs to a different home.');
    return;
  }
  const home = await sql`select 1 from ww.households where code = ${code}`;
  if (!home.length) throw new Error('Unknown home.');
  const [plan] = await sql`select owner_phone from ww.service_plans where code = ${code}`;
  await sql`insert into ww.visits (id, code, kind, due_date, tech_email, send_to, source)
    values (${visitId}, ${code}, ${kind === 'weekly' ? 'extra' : kind}, ${sql.unsafe(TODAY)}, ${email}, ${plan?.owner_phone ?? null}, 'field')
    on conflict (id) do nothing`;
}

export async function registerPhoto(p: { id: string; visitId: string; path: string; label: string | null; itemKey: string | null; takenAt: string | null; width: number | null; height: number | null; bytes: number | null }) {
  const sql = db();
  await sql`insert into ww.visit_photos (id, visit_id, path, label, item_key, taken_at, width, height, bytes)
    values (${p.id}, ${p.visitId}, ${p.path}, ${p.label}, ${p.itemKey}, ${p.takenAt}, ${p.width}, ${p.height}, ${p.bytes})
    on conflict (id) do nothing`;
}

export type CompleteInput = {
  visitId: string; code: string; kind: VisitKind; startedAt: string | null; completedAt: string;
  lat: number | null; lng: number | null; checklist: Answer[]; notes: string; photoIds: string[];
};

// A finished visit from the phone. Safe to call twice (a retry after a dropped connection does nothing new).
export async function completeVisit(input: CompleteInput, email: string): Promise<{ reportStatus: string; missingPhotos: number }> {
  const sql = db();
  await ensureVisitRow(input.visitId, input.code, input.kind, email);
  const have = await sql<{ id: string }[]>`select id from ww.visit_photos where visit_id = ${input.visitId}`;
  const haveSet = new Set(have.map((r) => r.id));
  const missing = input.photoIds.filter((id) => !haveSet.has(id)).length;
  if (missing) return { reportStatus: 'photos_missing', missingPhotos: missing };

  const [cur] = await sql`select status, report_status from ww.visits where id = ${input.visitId}`;
  if (cur?.status === 'done') return { reportStatus: cur.report_status, missingPhotos: 0 };

  const issue = hasIssue(input.checklist);
  await sql`update ww.visits set status = 'done', started_at = ${input.startedAt}, completed_at = ${input.completedAt},
      completed_by = ${email}, tech_email = coalesce(tech_email, ${email}), lat = ${input.lat}, lng = ${input.lng},
      checklist = ${sql.json(input.checklist as never)}, notes = ${input.notes || null}, has_issue = ${issue},
      report_token = coalesce(report_token, ${token()}), report_status = ${issue ? 'waiting' : 'approved'}, updated_at = now()
    where id = ${input.visitId}`;
  await sql`insert into ww.events (code, type, note, by_email, meta)
    values (${input.code}, 'visit', ${`${KIND_LABEL[input.kind] ?? 'Visit'} done${issue ? ': issue flagged' : ', all clear'}`}, ${email}, ${sql.json({ visit: input.visitId } as never)})`;

  if (issue) {
    await alertManager(input.visitId);
    return { reportStatus: 'waiting', missingPhotos: 0 };
  }
  const r = await sendReport(input.visitId);
  return { reportStatus: r, missingPhotos: 0 };
}

async function alertManager(visitId: string) {
  const sql = db();
  const settings = await getSettings();
  if (!settings.team_alert_phone) return;
  const [v] = await sql`select v.checklist, v.completed_by, h.prop_address, h.prop_city from ww.visits v join ww.households h on h.code = v.code where v.id = ${visitId}`;
  const issues = issuesSummary(v.checklist as Answer[]).slice(0, 2).join('; ');
  await sendText(settings.team_alert_phone,
    `Winter Watch: issue at ${v.prop_address}, ${v.prop_city} (${v.completed_by}). ${issues}. Review before the owner is told: ${siteUrl()}/app/visits/${visitId}`);
}

function dayLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Detroit' });
}

// Text the owner a link to the report. All-clear reports go automatically; issue reports only after approval.
export async function sendReport(visitId: string): Promise<string> {
  const sql = db();
  const [v] = await sql`
    select v.id, v.kind, v.code, v.report_token, v.report_status, v.report_note, v.has_issue, v.completed_at,
      coalesce(v.send_to, p.owner_phone) as phone, h.prop_address, h.prop_city
    from ww.visits v join ww.households h on h.code = v.code left join ww.service_plans p on p.code = v.code
    where v.id = ${visitId}`;
  if (!v) return 'none';
  if (v.report_status === 'sent') return 'sent';
  const phone = v.phone ? toE164(String(v.phone)) : null;
  if (!phone) {
    await sql`update ww.visits set report_status = 'no_phone', updated_at = now() where id = ${visitId}`;
    return 'no_phone';
  }
  const link = `${siteUrl()}/r/${v.report_token}`;
  const when = dayLabel(new Date(v.completed_at));
  const where = v.prop_address || 'your home';
  let text: string;
  if (v.kind === 'photo') {
    text = `MiCasa Winter Watch: Here is your free photo check of ${where} (${when}). ${v.has_issue && v.report_note ? v.report_note + ' ' : 'Everything looked good from outside. '}Photos: ${link} Want us checking on it every week this winter? Just reply here.`;
  } else if (v.has_issue) {
    text = `MiCasa Winter Watch: We checked ${where} today (${when}) and found something you should know about. ${v.report_note ? v.report_note + ' ' : ''}Photos and details: ${link} Reply here or call us with any questions.`;
  } else {
    text = `MiCasa Winter Watch: We checked ${where} today (${when}). All clear. Photos and checklist: ${link}`;
  }
  const r = await sendText(phone, text, undefined, { preReplyOverride: true });
  await sql`update ww.visits set report_status = ${r.ok ? 'sent' : 'failed'}, report_sent_at = ${r.ok ? new Date() : null},
      report_error = ${r.ok ? null : (r.error ?? 'Send failed').slice(0, 300)}, updated_at = now() where id = ${visitId}`;
  if (r.ok) await sql`insert into ww.events (code, type, note) values (${v.code}, 'text', ${'Visit report texted to ' + prettyPhone(phone)})`;
  return r.ok ? 'sent' : 'failed';
}

// Office: approve a flagged report (with the note the owner will read) and send it.
export async function approveReport(visitId: string, note: string, by: string): Promise<string> {
  const sql = db();
  await sql`update ww.visits set report_note = ${note.trim().slice(0, 400) || null}, approved_by = ${by}, report_status = 'approved', updated_at = now()
    where id = ${visitId} and status = 'done' and report_status in ('waiting','held','failed','approved','no_phone')`;
  return sendReport(visitId);
}

export async function holdReport(visitId: string, by: string) {
  await db()`update ww.visits set report_status = 'held', approved_by = ${by}, updated_at = now() where id = ${visitId} and report_status <> 'sent'`;
}

export function templateForVisit(kind: VisitKind, extra: unknown) {
  return templateFor(kind, Array.isArray(extra) ? (extra as string[]) : []);
}
