import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireMember } from '@/lib/auth';
import { db } from '@/lib/db';
import { visitById } from '@/lib/report';
import { issuesSummary, KIND_LABEL, type Answer } from '@/lib/checklist';
import { siteUrl } from '@/lib/visits';
import { fmtDate, fmtDateTime, prettyPhone } from '@/lib/text';
import { VisitReport } from '@/components/VisitReport';
import { approveVisit, assignVisit, holdVisit, setVisitStatus } from '../actions';
import { ReportChip } from '../shared';

export const metadata = { title: 'Visit' };
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function VisitPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sent?: string; held?: string; error?: string }> }) {
  await requireMember();
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID.test(id)) notFound();
  const d = await visitById(id);
  if (!d) notFound();
  const { v, photos } = d;
  const techs = await db()<{ email: string; name: string | null }[]>`select email, name from ww.team_members order by role, name nulls last, email`;
  const phone = v.send_to ?? v.owner_phone;
  const suggested = v.report_note ?? (v.has_issue ? issuesSummary((v.checklist ?? []) as Answer[]).join('. ') : '');
  const canSend = v.status === 'done' && v.report_status !== 'sent';
  const reportLink = v.report_token ? `${siteUrl()}/r/${v.report_token}` : null;

  return (
    <>
      <div className="row between">
        <div className="stack" style={{ gap: 6 }}>
          <div className="row"><Link className="code" href={`/app/households/${v.code}`}>{v.code}</Link><span className="chip">{KIND_LABEL[v.kind]}</span>
            {v.status === 'done' ? <ReportChip s={v.report_status} /> : <span className={`chip ${v.status === 'missed' ? 'no' : ''}`}>{v.status === 'scheduled' ? `Due ${fmtDate(v.due_date)}` : v.status === 'missed' ? 'Missed' : 'Cancelled'}</span>}
          </div>
          <h1>{v.address || v.code}</h1>
          <p className="muted">{v.city} · {v.owner}</p>
        </div>
        <Link className="btn quiet" href="/app/visits">All visits</Link>
      </div>

      {sp.error && <div className="banner bad"><span>{sp.error}</span></div>}
      {sp.sent === 'sent' && <div className="banner good"><span>Report texted to {prettyPhone(phone)}.</span></div>}
      {sp.sent && sp.sent !== 'sent' && <div className="banner bad"><span>{sp.sent === 'no_phone' ? 'There is no owner phone for this home. Add one below and send again.' : `The text did not go out${v.report_error ? `: ${v.report_error}` : ''}. Check texting is on in Settings, then try again.`}</span></div>}
      {sp.held && <div className="banner info"><span>Held. The owner will not be texted unless you send it later.</span></div>}

      <div className="split">
        <div className="stack">
          {v.status === 'done' ? (
            <section className="panel"><VisitReport v={v} photos={photos} showOfficeNotes /></section>
          ) : (
            <section className="panel">
              <h2>Not done yet</h2>
              <p className="muted">{v.status === 'scheduled' ? 'This visit shows on the field app. The report appears here once the tech finishes and the phone syncs.' : 'This visit was not done.'}</p>
            </section>
          )}
        </div>

        <div className="stack">
          {canSend && (
            <section className="panel" style={v.report_status === 'waiting' ? { borderColor: 'var(--bad)' } : undefined}>
              <h2>{v.report_status === 'waiting' ? 'Approve and text the owner' : 'Text the report'}</h2>
              {v.report_status === 'waiting' && <p className="small muted">The tech flagged an issue. Write what the owner should know and what happens next. It goes at the top of the text and the report page.</p>}
              <form action={approveVisit.bind(null, v.id)} className="stack" style={{ gap: 12 }}>
                <label className="f">Note to the owner<textarea name="report_note" defaultValue={suggested} maxLength={400} placeholder="Example: Small drip under the kitchen sink. We shut the valve and put a bucket down. Want us to call a plumber?" /></label>
                <label className="f">Send to{phone ? '' : ' (no phone on file)'}<input type="tel" name="send_to" defaultValue={phone ? prettyPhone(phone) : ''} placeholder="(810) 555-0100" required={!phone} /></label>
                <div className="row">
                  <button className="btn primary" type="submit">Approve and text</button>
                </div>
              </form>
              {v.report_status !== 'held' && <form action={holdVisit.bind(null, v.id)}><button className="btn quiet" type="submit">Hold, I will call them instead</button></form>}
            </section>
          )}

          {v.status === 'done' && (
            <section className="panel">
              <h2>Report</h2>
              <dl className="dl">
                <dt>Status</dt><dd><ReportChip s={v.report_status} /></dd>
                {v.report_sent_at && <><dt>Texted</dt><dd>{fmtDateTime(v.report_sent_at)} to {prettyPhone(phone)}</dd></>}
                {v.approved_by && <><dt>Reviewed by</dt><dd>{v.approved_by}</dd></>}
                <dt>Done by</dt><dd>{v.completed_by ?? '—'}<br /><span className="muted small">{fmtDateTime(v.started_at)} to {fmtDateTime(v.completed_at)}</span></dd>
                {reportLink && <><dt>Owner link</dt><dd>{['sent', 'approved', 'failed', 'no_phone'].includes(v.report_status) ? <a href={reportLink} target="_blank" rel="noreferrer">Open their page</a> : <span className="muted small">Opens once approved</span>}</dd></>}
              </dl>
            </section>
          )}

          {v.status === 'scheduled' && (
            <section className="panel">
              <h2>Assign</h2>
              <form action={assignVisit.bind(null, v.id)} className="stack" style={{ gap: 12 }}>
                <label className="f">Tech<select name="tech_email" defaultValue={v.tech_email ?? ''}><option value="">Anyone on the team</option>{techs.map((t) => <option key={t.email} value={t.email}>{t.name ?? t.email}</option>)}</select></label>
                <label className="f">Due<input type="date" name="due_date" defaultValue={v.due_date} /></label>
                <div><button className="btn" type="submit">Save</button></div>
              </form>
              <form action={setVisitStatus.bind(null, v.id, 'cancelled')}><button className="btn quiet" type="submit">Cancel this visit</button></form>
            </section>
          )}
          {(v.status === 'missed' || v.status === 'cancelled') && (
            <section className="panel">
              <form action={setVisitStatus.bind(null, v.id, 'scheduled')}><button className="btn" type="submit">Put back on the schedule</button></form>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
