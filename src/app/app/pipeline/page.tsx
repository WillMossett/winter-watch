import Link from 'next/link';
import { pipeline } from '@/lib/queries';
import { EVENT_LABEL, STAGES } from '@/lib/leads';
import { fmtDate, money, todayDetroit } from '@/lib/text';

export const metadata = { title: 'Pipeline' };

export default async function Pipeline() {
  const leads = await pipeline();
  const today = todayDetroit();
  return (
    <section className="panel">
      <div className="panel-head"><h2>Pipeline</h2><p>Every household that has responded. Open a card to change its stage or log a call.</p></div>
      {!leads.length ? (
        <div className="empty"><strong>No responses yet</strong><span>Scans and web form replies land here on their own. Log phone calls from the Responses tab.</span><Link className="btn" href="/app/responses">Open Responses</Link></div>
      ) : (
        <div className="board-wrap"><div className="board">
          {STAGES.map(([id, label]) => {
            const cards = leads.filter((l) => l.stage === id);
            return (
              <div className="col" key={id}>
                <div className="col-h"><span>{label}</span><span className={`chip st-${id}`}>{cards.length}</span></div>
                {cards.length ? cards.map((l) => (
                  <Link className="card" key={l.code} href={`/app/households/${l.code}`}>
                    <span className="t">{l.owner}</span>
                    <span className="m"><span className="code">{l.code}</span>{l.prop_city}</span>
                    {id === 'client' && l.tier && <span className="m">{l.tier} · {money(l.annual_value)}/yr</span>}
                    {l.follow_up && id !== 'client' && id !== 'lost' && <span className={'m' + (l.follow_up <= today ? ' due' : '')}>Follow up {fmtDate(l.follow_up)}</span>}
                    {l.last_type && <span className="m">Last: {EVENT_LABEL[l.last_type] ?? l.last_type} · {fmtDate(l.last_at)}</span>}
                  </Link>
                )) : <span className="muted small" style={{ padding: 4 }}>None</span>}
              </div>
            );
          })}
        </div></div>
      )}
    </section>
  );
}
