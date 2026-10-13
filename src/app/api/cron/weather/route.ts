import { db, getSettings } from '@/lib/db';
import { draftMessage, fetchMichiganAlerts, pickAlerts } from '@/lib/nws';
import { sendText } from '@/lib/sendblue';

export const dynamic = 'force-dynamic';

// Runs every 30 minutes (vercel.json). Drafts an alert for each new shoreline warning and
// texts the team phone to review it. Nothing goes to subscribers without a person sending it.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return new Response('Forbidden', { status: 403 });
  const sql = db();
  const settings = await getSettings();
  let features;
  try { features = await fetchMichiganAlerts(); } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : 'NWS error' }, { status: 502 });
  }
  const found = pickAlerts(features);
  const created: string[] = [];
  for (const a of found) {
    const ins = await sql`insert into ww.alerts (type, message, source, nws_id, nws_event, nws_areas, nws_ends)
      values ('nws', ${draftMessage(a, settings.check_price)}, 'nws', ${a.id}, ${a.event}, ${a.counties.join(', ') + (a.counties.length > 1 ? ' counties' : ' County')}, ${a.ends})
      on conflict (nws_id) do nothing returning id`;
    if (ins.length) created.push(`${a.event} (${a.counties.join(', ')})`);
  }
  if (created.length && settings.team_alert_phone) {
    const site = (process.env.NEXT_PUBLIC_SITE_URL || settings.site_url).replace(/\/$/, '');
    await sendText(settings.team_alert_phone, `Winter Watch: ${created.join('; ')}. A storm alert is drafted. Review and send: ${site}/app/alerts`);
  }
  return Response.json({ ok: true, warnings: found.length, drafted: created });
}
