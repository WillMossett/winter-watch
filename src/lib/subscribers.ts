import 'server-only';
import { db } from './db';

// Adds or re-activates a storm alert subscriber and records how they agreed.
export async function upsertSubscriber(o: { phone: string; code: string | null; email: string | null; name: string | null; method: string; consentText: string; ip: string | null; by?: string | null; promote?: boolean }) {
  const sql = db();
  const rows = await sql<{ id: string }[]>`
    insert into ww.subscribers (phone, code, email, name, status, consent_at, consent_method, consent_text, consent_ip)
    values (${o.phone}, ${o.code}, ${o.email}, ${o.name}, 'active', now(), ${o.method}, ${o.consentText}, ${o.ip})
    on conflict (phone) do update set status = 'active', stopped_at = null, consent_at = now(), consent_method = excluded.consent_method,
      consent_text = excluded.consent_text, consent_ip = excluded.consent_ip,
      code = coalesce(ww.subscribers.code, excluded.code), email = coalesce(excluded.email, ww.subscribers.email), name = coalesce(excluded.name, ww.subscribers.name), updated_at = now()
    returning id`;
  if (o.code) {
    await sql`insert into ww.events (code, type, note, by_email) values (${o.code}, 'alerts', ${'Subscribed to storm alerts (' + o.method + ')'}, ${o.by ?? null})`;
    if (o.promote) await sql`update ww.leads set stage = 'alerts', reached = reached || ${sql.json({ alerts: new Date().toISOString().slice(0, 10) })} where code = ${o.code} and stage = 'responded' and not exists (select 1 from ww.events e where e.code = ${o.code} and e.type in ('call','email','inperson','referral'))`;
  }
  return rows[0]?.id;
}
