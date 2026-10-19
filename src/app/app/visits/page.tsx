import Link from 'next/link';
import { requireMember } from '@/lib/auth';
import { db } from '@/lib/db';
import { ensureVisits } from '@/lib/visits';
import { KIND_LABEL, type VisitKind } from '@/lib/checklist';
import { fmtDate, fmtDateTime } from '@/lib/text';
import { ReportChip } from './shared';

export const metadata = { title: 'Visits' };
export const dynamic = 'force-dynamic';

type Row = {
  id: string; code: string; kind: VisitKind; due_date: string; status: string; tech_email: string | null;
  completed_at: string | null; completed_by: string | null; has_issue: boolean; report_status: string;
  report_error: string | null; address: string; city: string; owner: string; photos: number;
};


export default async function VisitsPage() {
  await requireMember();
  await ensureVisits(7);
  const sql = db();
  const today = `(now() at time zone 'America/Detroit')::date`;
  const rows = await sql<Row[]>`
    select v.id, v.code, v.kind, v.due_date::text, v.status, v.tech_email, v.completed_at, v.completed_by, v.has_issue,
      v.report_status, v.report_error, coalesce(h.prop_address,'') as address, coalesce(h.prop_city,'') as city, coalesce(h.owner,'') as owner,
      (select count(*)::int from ww.visit_photos p where p.visit_id = v.id) as photos
    from ww.visits v join ww.households h on h.code = v.code
    where (v.status = 'scheduled' and v.due_date <= ${sql.unsafe(today)} + 7)
       or (v.status = 'done' and (v.completed_at > now() - interval '8 days' or v.report_status in ('waiting','failed','no_phone')))
       or (v.status = 'missed' and v.due_date > ${sql.unsafe(today)} - 14)
    order by v.due_date, h.prop_city, h.prop_address`;
  const [{ d: todayStr }] = await sql<{ d: string }[]>`select ${sql.unsafe(today)}::text as d`;
  const [{ n: planCount }] = await sql<{ n: number }[]>`select count(*)::int as n from ww.service_plans where active`;

  const waiting = rows.filter((r) => r.status === 'done' && r.report_status === 'waiting');
  const problems = rows.filter((r) => r.status === 'done' && ['failed', 'no_phone'].includes(r.report_status));
  const due = rows.filter((r) => r.status === 'scheduled' && r.due_date <= todayStr);
  const upcoming = rows.filter((r) => r.status === 'scheduled' && r.due_date > todayStr);
  const done = rows.filter((r) => r.status === 'done' && !['waiting', 'failed', 'no_phone'].includes(r.report_status))
    .sort((a, b) => String(b.completed_at).localeCompare(String(a.completed_at)));
  const missed = rows.filter((r) => r.status === 'missed');

  const home = (r: Row) => (
    <><Link href={`/app/visits/${r.id}`}><strong>{r.address || r.code}</strong></Link><br /><span className="muted small">{r.city} · {r.owner}</span></>
  );
  const tech = (e: string | null) => (e ? e.split('@')[0] : <span className="muted">Anyone</span>);

  return (
    <>
      <div className="panel-head">
        <h1>Visits</h1>
        <p>{planCount} active plan{planCount === 1 ? '' : 's'} · techs work from <span className="mono">/field</span> on their phones</p>
      </div>

      {waiting.length > 0 && (
        <section className="panel" style={{ borderColor: 'var(--bad)' }}>
          <h2>Waiting for your OK ({waiting.length})</h2>
          <p className="small muted">A tech flagged something. The owner has not been told yet. Open it, write the note they will read, then send.</p>
          <Table rows={waiting} cols={['Home', 'Visit', 'Done', 'Photos', '']} render={(r) => [home(r), KIND_LABEL[r.kind], `${fmtDateTime(r.completed_at)} · ${tech(r.completed_by)}`, r.photos, <Link key="o" className="btn primary" href={`/app/visits/${r.id}`}>Review</Link>]} />
        </section>
      )}

      {problems.length > 0 && (
        <section className="panel">
          <h2>Report did not go out ({problems.length})</h2>
          <Table rows={problems} cols={['Home', 'Visit', 'Problem', '']} render={(r) => [home(r), KIND_LABEL[r.kind], r.report_status === 'no_phone' ? 'No owner phone on file' : (r.report_error ?? 'Text failed'), <Link key="o" className="btn" href={`/app/visits/${r.id}`}>Fix and send</Link>]} />
        </section>
      )}

      <section className="panel">
        <h2>Today and overdue ({due.length})</h2>
        {due.length ? (
          <Table rows={due} cols={['Home', 'Visit', 'Due', 'Tech']} render={(r) => [home(r), KIND_LABEL[r.kind], r.due_date < todayStr ? <span key="d" className="chip no">{fmtDate(r.due_date)}</span> : 'Today', tech(r.tech_email)]} />
        ) : <p className="muted">Nothing due today.</p>}
      </section>

      <section className="panel">
        <h2>Coming up this week ({upcoming.length})</h2>
        {upcoming.length ? (
          <Table rows={upcoming} cols={['Home', 'Visit', 'Due', 'Tech']} render={(r) => [home(r), KIND_LABEL[r.kind], fmtDate(r.due_date), tech(r.tech_email)]} />
        ) : <p className="muted">{planCount ? 'Nothing else this week.' : 'No plans yet. Open a client household and set up their plan to start weekly visits.'}</p>}
      </section>

      <section className="panel">
        <h2>Done this week ({done.length})</h2>
        {done.length ? (
          <Table rows={done} cols={['Home', 'Visit', 'Done', 'Result', 'Report']} render={(r) => [home(r), KIND_LABEL[r.kind], `${fmtDateTime(r.completed_at)} · ${tech(r.completed_by)}`, r.has_issue ? <span key="i" className="chip no">Issue</span> : <span key="i" className="chip ok">All clear</span>, <ReportChip key="r" s={r.report_status} />]} />
        ) : <p className="muted">No finished visits in the last week.</p>}
      </section>

      {missed.length > 0 && (
        <section className="panel">
          <h2>Missed ({missed.length})</h2>
          <p className="small muted">Weekly visits more than 2 days late. The owner was not texted.</p>
          <Table rows={missed} cols={['Home', 'Was due', 'Tech']} render={(r) => [home(r), fmtDate(r.due_date), tech(r.tech_email)]} />
        </section>
      )}
    </>
  );
}

function Table({ rows, cols, render }: { rows: Row[]; cols: string[]; render: (r: Row) => React.ReactNode[] }) {
  return (
    <div className="table-wrap"><table>
      <thead><tr>{cols.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
      <tbody>{rows.map((r) => <tr key={r.id}>{render(r).map((c, i) => <td key={i}>{c}</td>)}</tr>)}</tbody>
    </table></div>
  );
}
