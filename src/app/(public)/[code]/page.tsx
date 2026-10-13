import { headers } from 'next/headers';
import { db, getSettings } from '@/lib/db';
import { isCode, normalizeCode } from '@/lib/text';
import { recordResponse } from '@/lib/leads';
import { PublicPage } from '@/components/PublicPage';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Winter Watch by MiCasa Stays' };

const BOT = /bot|crawl|spider|preview|facebookexternalhit|slurp|whatsapp|telegram|discord|slack|linkedin|embedly|curl|wget|python|headless/i;

export default async function ScanPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ thanks?: string; error?: string }> }) {
  const { code: raw } = await params;
  const sp = await searchParams;
  const code = normalizeCode(decodeURIComponent(raw));
  const settings = await getSettings();
  let known = false;
  if (isCode(code)) {
    const sql = db();
    known = (await sql`select 1 from ww.households where code = ${code}`).length > 0;
    const ua = (await headers()).get('user-agent') ?? '';
    // Log the scan once per half hour per code, and never for link-preview bots.
    if (known && !sp.thanks && !sp.error && ua && !BOT.test(ua)) {
      const recent = await sql`select 1 from ww.events where code = ${code} and type = 'scan' and at > now() - interval '30 minutes'`;
      if (!recent.length) await recordResponse({ code, type: 'scan', note: 'Opened their scan page', meta: { ua: ua.slice(0, 200) } });
    }
  }
  return <PublicPage code={isCode(code) ? code : null} known={known} settings={settings} thanks={Boolean(sp.thanks)} error={sp.error} />;
}
