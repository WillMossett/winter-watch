'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireMember } from '@/lib/auth';
import { db } from '@/lib/db';
import { toE164 } from '@/lib/text';
import { approveReport, ensureVisits, holdReport } from '@/lib/visits';

const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

// Set up or change the service plan for a client home. Visits for the next week appear right away.
export async function savePlan(code: string, f: FormData) {
  await requireMember();
  const sql = db();
  const phoneRaw = s(f, 'owner_phone');
  const phone = phoneRaw ? toE164(phoneRaw) : null;
  if (phoneRaw && !phone) redirect(`/app/households/${code}?error=${encodeURIComponent('That owner phone does not look right. Use a 10-digit US number.')}#plan`);
  const start = s(f, 'start_date') || new Date().toISOString().slice(0, 10);
  const end = s(f, 'end_date') || null;
  const interval = s(f, 'interval_days') === '14' ? 14 : 7;
  const tech = s(f, 'tech_email') || null;
  const extra = s(f, 'extra_items').split(/\r?\n/).map((x) => x.trim()).filter(Boolean).slice(0, 20);
  await sql`insert into ww.service_plans (code, tier, interval_days, start_date, end_date, active, owner_phone, owner_email, tech_email, access_notes, extra_items)
    values (${code}, ${s(f, 'tier') || 'Standard'}, ${interval}, ${start}, ${end}, ${f.get('active') !== null}, ${phone}, ${s(f, 'owner_email') || null}, ${tech}, ${s(f, 'access_notes') || null}, ${sql.json(extra)})
    on conflict (code) do update set tier = excluded.tier, interval_days = excluded.interval_days, start_date = excluded.start_date,
      end_date = excluded.end_date, active = excluded.active, owner_phone = excluded.owner_phone, owner_email = excluded.owner_email,
      tech_email = excluded.tech_email, access_notes = excluded.access_notes, extra_items = excluded.extra_items, updated_at = now()`;
  // Scheduled visits pick up the new phone and tech; a deactivated plan drops its future visits.
  await sql`update ww.visits set send_to = ${phone}, tech_email = ${tech}, updated_at = now() where code = ${code} and kind = 'weekly' and status = 'scheduled'`;
  if (f.get('active') === null) await sql`update ww.visits set status = 'cancelled', updated_at = now() where code = ${code} and kind = 'weekly' and status = 'scheduled'`;
  else await sql`delete from ww.visits where code = ${code} and kind = 'weekly' and status = 'scheduled' and due_date >= current_date`;
  await ensureVisits(7);
  revalidatePath(`/app/households/${code}`);
  revalidatePath('/app/visits');
  redirect(`/app/households/${code}?saved=plan#plan`);
}

export async function addVisit(code: string, f: FormData) {
  await requireMember();
  const kind = ['storm', 'photo', 'walkthrough', 'extra'].includes(s(f, 'kind')) ? s(f, 'kind') : 'extra';
  const sql = db();
  const [plan] = await sql`select owner_phone from ww.service_plans where code = ${code}`;
  await sql`insert into ww.visits (code, kind, due_date, tech_email, send_to, source)
    values (${code}, ${kind}, ${s(f, 'due_date') || new Date().toISOString().slice(0, 10)}, ${s(f, 'tech_email') || null}, ${plan?.owner_phone ?? null}, 'manual')`;
  revalidatePath(`/app/households/${code}`);
  revalidatePath('/app/visits');
}

export async function approveVisit(id: string, f: FormData) {
  const me = await requireMember();
  const sql = db();
  const phoneRaw = s(f, 'send_to');
  if (phoneRaw) {
    const phone = toE164(phoneRaw);
    if (!phone) redirect(`/app/visits/${id}?error=${encodeURIComponent('That phone number does not look right.')}`);
    await sql`update ww.visits set send_to = ${phone} where id = ${id}`;
  }
  const r = await approveReport(id, s(f, 'report_note'), me.email);
  revalidatePath('/app/visits');
  redirect(`/app/visits/${id}?sent=${r}`);
}

export async function holdVisit(id: string) {
  const me = await requireMember();
  await holdReport(id, me.email);
  revalidatePath('/app/visits');
  redirect(`/app/visits/${id}?held=1`);
}

export async function setVisitStatus(id: string, status: 'cancelled' | 'missed' | 'scheduled') {
  await requireMember();
  await db()`update ww.visits set status = ${status}, updated_at = now() where id = ${id} and status <> 'done'`;
  revalidatePath('/app/visits');
  redirect(`/app/visits/${id}`);
}

export async function assignVisit(id: string, f: FormData) {
  await requireMember();
  await db()`update ww.visits set tech_email = ${s(f, 'tech_email') || null}, due_date = coalesce(${s(f, 'due_date') || null}::date, due_date), updated_at = now() where id = ${id} and status = 'scheduled'`;
  revalidatePath('/app/visits');
  redirect(`/app/visits/${id}`);
}
