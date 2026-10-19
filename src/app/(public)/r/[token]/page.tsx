import { notFound } from 'next/navigation';
import { visitByToken } from '@/lib/report';
import { VisitReport } from '@/components/VisitReport';
import { getSettings } from '@/lib/db';
import { prettyPhone } from '@/lib/text';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Visit report', robots: { index: false, follow: false }, referrer: 'no-referrer' as const };

// The page the owner opens from the report text. Only exists once the report is cleared to send.
export default async function ReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(token)) notFound();
  const d = await visitByToken(token);
  if (!d || !['approved', 'sent', 'failed', 'no_phone'].includes(d.v.report_status)) notFound();
  const settings = await getSettings();
  const from = process.env.SENDBLUE_FROM_NUMBER;
  return (
    <main className="pub">
      <div className="pub-head"><div><div className="sub">MiCasa Stays</div><div className="name">Winter Watch</div></div></div>
      <VisitReport v={d.v} photos={d.photos} />
      <div className="foot">
        <span>Questions about your home? {from ? <>Text us at <a href={`sms:${from}`}>{prettyPhone(from)}</a>.</> : 'Reply to the text this came from.'}</span>
        <span>Photo links on this page expire after a few hours. Open the link from your text again to see them.</span>
        {settings.site_url && <span>MiCasa Stays · Port Sanilac, Michigan</span>}
      </div>
    </main>
  );
}
