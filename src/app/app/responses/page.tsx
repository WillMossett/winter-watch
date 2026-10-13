import Link from 'next/link';
import { recentResponses, searchHouseholds } from '@/lib/queries';
import { EVENT_LABEL, STAGE_LABEL } from '@/lib/leads';
import { fmtDateTime, normalizeCode } from '@/lib/text';
import { addContact } from '../actions';

export const metadata = { title: 'Responses' };

export default async function Responses({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? '').trim();
  const lookup = q.length >= 2 ? await searchHouseholds({ q: /^[A-Za-z0-9]{1,4}-?[A-Za-z0-9]{4}$/.test(q) ? normalizeCode(q) : q, page: 0, pageSize: 12 }) : null;
  const recent = await recentResponses(60);
  return (
    <>
      <section className="panel">
        <div className="panel-head"><h2>Log a call or visit</h2><p>Ask for the code printed on their letter, or search by name or address.</p></div>
        <form method="get" className="row" style={{ alignItems: 'end' }}>
          <label className="f" style={{ flex: '1 1 260px' }}>Code, name or address<input type="search" name="q" defaultValue={q} placeholder="WW-A7K2" autoComplete="off" autoFocus /></label>
          <button className="btn primary" type="submit">Find</button>
        </form>
        {lookup && (lookup.rows.length ? (
          <div className="table-wrap"><table><tbody>{lookup.rows.map((h) => (
            <tr key={h.code}><td><Link className="code" href={`/app/households/${h.code}`}>{h.code}</Link></td><td><Link className="rowlink" href={`/app/households/${h.code}`}>{h.owner}</Link></td><td>{h.prop_address}, {h.prop_city}</td><td>{h.stage ? <span className={`chip st-${h.stage}`}>{STAGE_LABEL[h.stage]}</span> : <span className="chip">No response yet</span>}</td></tr>
          ))}</tbody></table></div>
        ) : (
          <div className="empty">No household matches “{q}”. If they are not on your list, add them as a contact.<form action={addContact}><button className="btn" type="submit">Add a contact</button></form></div>
        ))}
      </section>
      <section className="panel">
        <div className="panel-head"><h2>Recent responses</h2><p>Scans and web form replies are logged on their own.</p></div>
        {recent.length ? (
          <div className="table-wrap"><table><thead><tr><th>When</th><th>Owner</th><th>Code</th><th>How</th><th>Mailing</th><th>Note</th></tr></thead>
            <tbody>{recent.map((e, i) => (
              <tr key={i}><td>{fmtDateTime(e.at)}</td><td><Link className="rowlink" href={`/app/households/${e.code}`}>{e.owner}</Link></td><td><span className="code">{e.code}</span></td><td>{EVENT_LABEL[e.type] ?? e.type}</td><td>{e.mailing_name ?? '—'}</td><td>{e.note ?? ''}</td></tr>
            ))}</tbody></table></div>
        ) : <div className="empty">Responses will show here as they come in.</div>}
      </section>
    </>
  );
}
