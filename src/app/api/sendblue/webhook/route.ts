import { db, getSettings } from '@/lib/db';
import { toE164 } from '@/lib/text';
import { classifyInbound, extractCode, REPLIES } from '@/lib/keywords';
import { recordResponse } from '@/lib/leads';
import { createPhotoVisit, createStormVisit } from '@/lib/visits';
import { sendText } from '@/lib/sendblue';
import { upsertSubscriber } from '@/lib/subscribers';

export const dynamic = 'force-dynamic';

// Sendblue posts here for incoming texts (kind=receive) and delivery updates (kind=status).
// The URL carries a secret token; anything without it is refused.
export async function POST(req: Request) {
  const url = new URL(req.url);
  const token = process.env.SENDBLUE_WEBHOOK_TOKEN;
  if (!token || url.searchParams.get('token') !== token) return new Response('Forbidden', { status: 403 });
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return new Response('Bad JSON', { status: 400 }); }
  const sql = db();
  const handle = body.message_handle ? String(body.message_handle) : null;

  // Delivery status for a text we sent
  if (body.is_outbound === true || url.searchParams.get('kind') === 'status') {
    if (handle) {
      const status = String(body.status ?? '');
      await sql`update ww.alert_deliveries set status = ${status}, error = ${body.error_message ? String(body.error_message) : null} where provider_id = ${handle}`;
    }
    return Response.json({ ok: true });
  }

  const phone = toE164(String(body.number ?? body.from_number ?? ''));
  if (!phone) return Response.json({ ok: true, ignored: 'no number' });
  const content = String(body.content ?? '');
  // Sendblue can deliver the same message more than once; the unique handle stops double handling.
  if (handle) {
    const ins = await sql`insert into ww.inbound_messages (phone, content, provider_id, raw) values (${phone}, ${content}, ${handle}, ${sql.json(body as never)}) on conflict (provider_id) do nothing returning id`;
    if (!ins.length) return Response.json({ ok: true, duplicate: true });
  } else {
    await sql`insert into ww.inbound_messages (phone, content, raw) values (${phone}, ${content}, ${sql.json(body as never)})`;
  }

  const settings = await getSettings();
  // "STORM WW-7K2M" from a letter: pull out the code so the reply is credited to that household and mailing.
  const found = extractCode(content, settings.code_prefix);
  const known = found.code ? (await sql`select 1 from ww.households where code = ${found.code}`).length > 0 : false;
  const letterCode = known ? found.code : null;
  let kind = classifyInbound(letterCode ? found.rest : content);
  // Any text carrying a letter code is a reply to the mailing (unless it is STOP, CHECK or HELP).
  const wantsAlerts = letterCode ? /\b(STORM|START|JOIN|YES|ALERTS?|SUBSCRIBE)\b/i.test(found.rest) : false;
  if (letterCode && kind === 'other') kind = 'start';
  const [sub] = await sql<{ id: string; code: string | null; status: string }[]>`select id, code, status from ww.subscribers where phone = ${phone}`;
  const reply = async (text: string) => { if (settings.alerts_enabled || kind === 'stop') await sendText(phone, text); };

  // A reply that carries a letter code is a response to the mailing: log it and flag the free photo visit.
  if (letterCode && kind === 'start') {
    const subscribe = wantsAlerts; // "STORM WW-7K2M" subscribes; a bare code only asks for the photo
    await recordResponse({ code: letterCode, type: 'text', mailingId: 'auto', stageIfNew: 'responded',
      note: `Texted "${content.trim().slice(0, 60)}". Wants the free photo this week${subscribe ? ' and storm alerts' : ''}. Phone ${phone}`,
      meta: { phone, photo: true } });
    await sql`update ww.leads set follow_up = coalesce(follow_up, current_date), updated_at = now() where code = ${letterCode}`;
    await createPhotoVisit(letterCode, phone, 'text');
    if (subscribe) {
      await upsertSubscriber({ phone, code: letterCode, email: null, name: null, method: 'Text keyword', consentText: `Texted "${content.trim().slice(0, 40)}" to the MiCasa Stays number`, ip: null, promote: false });
    }
    await sql`update ww.inbound_messages set handled_as = ${'start'} where provider_id = ${handle}`;
    await reply(subscribe ? REPLIES.photoAndAlerts : REPLIES.photoOnly);
    return Response.json({ ok: true, handled: 'start', code: letterCode });
  }

  if (kind === 'stop') {
    if (sub) {
      await sql`update ww.subscribers set status = 'stopped', stopped_at = now(), updated_at = now() where id = ${sub.id}`;
      if (sub.code) await sql`insert into ww.events (code, type, note) values (${sub.code}, 'alerts', 'Texted STOP. Unsubscribed from storm alerts.')`;
    }
    await reply(REPLIES.stopped);
  } else if (kind === 'start') {
    await upsertSubscriber({ phone, code: sub?.code ?? null, email: null, name: null, method: 'Text keyword', consentText: `Texted "${content.trim().slice(0, 40)}" to the MiCasa Stays number`, ip: null, promote: true });
    await reply(REPLIES.started);
  } else if (kind === 'check') {
    const [last] = await sql<{ id: string }[]>`select id from ww.alerts where status = 'sent' order by sent_at desc limit 1`;
    await sql`insert into ww.check_requests (subscriber_id, code, phone, alert_id) values (${sub?.id ?? null}, ${sub?.code ?? null}, ${phone}, ${last?.id ?? null})`;
    if (sub?.code) await sql`insert into ww.events (code, type, note) values (${sub.code}, 'check', 'Replied CHECK: wants a storm check')`;
    if (sub?.code) await createStormVisit(sub.code, phone);
    await reply(REPLIES.check(settings.check_price));
  } else if (kind === 'help') {
    await reply(REPLIES.help);
  } else if (sub?.code) {
    await sql`insert into ww.events (code, type, note) values (${sub.code}, 'text', ${'Texted: ' + content.slice(0, 500)})`;
  }
  await sql`update ww.inbound_messages set handled_as = ${kind} where provider_id = ${handle}`;
  return Response.json({ ok: true, handled: kind });
}
