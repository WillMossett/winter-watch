import Link from 'next/link';
import { searchHouseholds, towns } from '@/lib/queries';
import { STAGE_LABEL } from '@/lib/leads';
import { addContact } from '../actions';

export const metadata = { title: 'Households' };
const PAGE = 50;

export default async function Households({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.page ?? 0) || 0);
  const [{ total, rows }, tw] = await Promise.all([
    searchHouseholds({ q: sp.q, town: sp.town, status: sp.status, page, pageSize: PAGE }),
    towns(),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const qs = (p: number) => '?' + new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.town ? { town: sp.town } : {}), ...(sp.status ? { status: sp.status } : {}), page: String(p) }).toString();
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Households</h2>
        <div className="row">
          <Link className="btn primary" href="/app/households/import">Import list</Link>
          <form action={addContact}><button className="btn" type="submit">Add a contact</button></form>
          <a className="btn" href="/app/export">Export all</a>
        </div>
      </div>
      <form className="fields" method="get">
        <label className="f">Search<input type="search" name="q" defaultValue={sp.q ?? ''} placeholder="Code, owner or address" /></label>
        <label className="f">Town<select name="town" defaultValue={sp.town ?? ''}><option value="">All towns</option>{tw.map((t) => <option key={t.town} value={t.town}>{t.town} ({t.n})</option>)}</select></label>
        <label className="f">Show<select name="status" defaultValue={sp.status ?? ''}><option value="">Everyone</option><option value="mailable">Can be mailed</option><option value="notmailed">Not mailed yet</option><option value="lead">Responded</option><option value="excluded">Excluded</option></select></label>
        <div style={{ display: 'flex', alignItems: 'end' }}><button className="btn" type="submit">Filter</button></div>
      </form>
      {total === 0 ? (
        <div className="empty"><strong>{sp.q || sp.town || sp.status ? 'No households match these filters' : 'No households yet'}</strong><span>Import your PropStream CSV to build the mailing list.</span></div>
      ) : (
        <>
          <div className="table-wrap"><table>
            <thead><tr><th>Code</th><th>Owner</th><th>Property</th><th>Town</th><th>Mailing address</th><th>Status</th></tr></thead>
            <tbody>{rows.map((h) => (
              <tr key={h.code}>
                <td><Link className="code" href={`/app/households/${h.code}`}>{h.code}</Link></td>
                <td><Link className="rowlink" href={`/app/households/${h.code}`}>{h.owner}</Link></td>
                <td>{h.prop_address ?? '—'}</td><td>{h.prop_city ?? '—'}</td>
                <td>{[h.mail_city, h.mail_state].filter(Boolean).join(', ') || '—'}</td>
                <td>{h.stage ? <span className={`chip st-${h.stage}`}>{STAGE_LABEL[h.stage]}</span> : h.excluded ? <span className="chip">Excluded</span> : h.times_mailed ? <span className="chip">Mailed {h.times_mailed}×</span> : <span className="chip">Not mailed</span>}</td>
              </tr>))}</tbody>
          </table></div>
          <div className="pager"><span>{total.toLocaleString()} households · page {page + 1} of {pages}</span>
            <span className="row">{page > 0 ? <Link className="btn" href={qs(page - 1)}>Previous</Link> : <span className="btn" aria-disabled="true" style={{ opacity: .5 }}>Previous</span>}
              {page < pages - 1 ? <Link className="btn" href={qs(page + 1)}>Next</Link> : <span className="btn" aria-disabled="true" style={{ opacity: .5 }}>Next</span>}</span></div>
        </>
      )}
    </section>
  );
}
