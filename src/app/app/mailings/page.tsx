import Link from 'next/link';
import { mailingsWithStats } from '@/lib/queries';
import { fmtDate, money, pct, todayDetroit } from '@/lib/text';
import { deleteMailing, markMailed } from '../actions';

export const metadata = { title: 'Mailings' };

export default async function Mailings({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const sp = await searchParams;
  const list = await mailingsWithStats();
  return (
    <section className="panel">
      <div className="panel-head"><h2>Mailings</h2><Link className="btn primary" href="/app/mailings/new">New mailing</Link></div>
      {sp.created && <div className="banner good"><span>Mailing created. Download the print file for your printer, then mark it mailed once it goes out.</span></div>}
      {!list.length ? (
        <div className="empty"><strong>No mailings yet</strong><span>Create one to get a print file with every household&apos;s code, link and address.</span></div>
      ) : list.map((m) => {
        const sent = m.status === 'sent';
        return (
          <article key={m.id} className="panel" style={{ background: 'var(--surface-2)' }}>
            <div className="row between">
              <div className="row"><h3>{m.name}</h3><span className="chip">{m.kind === 'postcard' ? 'Postcard' : 'Letter'}</span><span className={`chip ${sent ? 'ok' : 'st-walkthrough'}`}>{sent ? 'Mailed ' + fmtDate(m.sent_date) : 'Draft'}</span></div>
              <div className="row">
                <a className="btn" href={`/app/mailings/${m.id}/print`}>Download print file</a>
                {!sent && (
                  <>
                    <form action={markMailed.bind(null, m.id)} className="row"><input type="date" name="sent_date" defaultValue={m.planned_date ?? todayDetroit()} aria-label="Date mailed" style={{ width: 'auto' }} /><button className="btn primary" type="submit">Mark as mailed</button></form>
                    <form action={deleteMailing.bind(null, m.id)}><button className="btn danger" type="submit">Delete draft</button></form>
                  </>
                )}
              </div>
            </div>
            <div className="kpis">
              <div><div className="small muted">PIECES</div><strong className="num">{m.pieces}</strong></div>
              <div><div className="small muted">COST</div><strong className="num">{money(m.cost)}</strong></div>
              <div><div className="small muted">RESPONSES</div><strong className="num">{m.responses}</strong> <span className="small muted">{sent ? pct(m.responses, m.pieces) : ''}</span></div>
              <div><div className="small muted">ALERT SIGN-UPS</div><strong className="num">{m.subs}</strong></div>
              <div><div className="small muted">WALKTHROUGHS</div><strong className="num">{m.walkthroughs}</strong></div>
              <div><div className="small muted">CLIENTS</div><strong className="num">{m.clients}</strong> <span className="small muted">{m.clients ? money(m.client_value) + '/yr' : ''}</span></div>
              <div><div className="small muted">COST / CLIENT</div><strong className="num">{m.clients ? money(m.cost / m.clients) : '—'}</strong></div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
