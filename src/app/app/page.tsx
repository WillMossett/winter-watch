import Link from 'next/link';
import { dashboard, followUpsDue, mailingsWithStats, townStats } from '@/lib/queries';
import { db } from '@/lib/db';
import { STAGE_LABEL } from '@/lib/leads';
import { fmtDate, money, pct, todayDetroit } from '@/lib/text';

export const metadata = { title: 'Dashboard' };

export default async function Dashboard() {
  const [d, mailings, towns, due, drafts, checks] = await Promise.all([
    dashboard(), mailingsWithStats(), townStats(), followUpsDue(todayDetroit()),
    db()<{ id: string; nws_event: string | null; nws_areas: string | null }[]>`select id, nws_event, nws_areas from ww.alerts where status = 'draft' order by created_at desc`,
    db()<{ n: number }[]>`select count(*)::int as n from ww.check_requests where status = 'new'`,
  ]);
  const steps: [string, number][] = [['Households mailed', d.reached], ['Responded', d.mail], ['Walkthrough', d.mail_walk], ['Client', d.mail_clients]];
  const top = Math.max(1, steps[0][1]);
  return (
    <>
      {drafts.map((a) => (
        <div key={a.id} className="banner"><span><strong>{a.nws_event ?? 'Storm alert'} drafted</strong>{a.nws_areas ? ` for ${a.nws_areas}` : ''}. Review it and send it to subscribers.</span><Link className="btn primary" href="/app/alerts">Review alert</Link></div>
      ))}
      {checks[0]?.n ? <div className="banner info"><span><strong>{checks[0].n} storm check request{checks[0].n > 1 ? 's' : ''}</strong> waiting to be scheduled.</span><Link className="btn" href="/app/alerts#checks">Open requests</Link></div> : null}
      {!d.households && (
        <section className="panel">
          <div className="panel-head"><h2>Get the first mailing out</h2><p>Three steps before anything goes to print.</p></div>
          <div className="grid2">
            <div className="stack" style={{ gap: 8 }}><span className="mono small" style={{ color: 'var(--accent)' }}>STEP 1</span><h3>Import your list</h3><p className="muted small">Import the PropStream CSV. Every household gets its own response code, and its own scan page.</p><div><Link className="btn primary" href="/app/households/import">Import list</Link></div></div>
            <div className="stack" style={{ gap: 8 }}><span className="mono small" style={{ color: 'var(--accent)' }}>STEP 2</span><h3>Add MiCasa owners</h3><p className="muted small">List current MiCasa owners in Settings so they never get the cold letter.</p><div><Link className="btn" href="/app/settings">Open Settings</Link></div></div>
          </div>
        </section>
      )}
      <section className="kpis">
        <div className="kpi"><span className="k">Households on list</span><span className="v">{d.households.toLocaleString()}</span><span className="s">{d.mailable.toLocaleString()} can be mailed</span></div>
        <div className="kpi"><span className="k">Pieces mailed</span><span className="v">{d.pieces.toLocaleString()}</span><span className="s">{d.reached.toLocaleString()} households reached</span></div>
        <div className="kpi lead"><span className="k">Response rate</span><span className="v">{pct(d.mail, d.reached)}</span><span className="s">{d.mail} from mail · {d.scans} scanned a code</span></div>
        <div className="kpi"><span className="k">Storm alert subscribers</span><span className="v">{d.subs}</span><span className="s">active, with consent</span></div>
        <div className="kpi"><span className="k">Walkthroughs</span><span className="v">{d.walk}</span><span className="s">booked or done</span></div>
        <div className="kpi lead"><span className="k">Clients signed</span><span className="v">{d.clients}</span><span className="s">{money(d.value)} a year</span></div>
        <div className="kpi"><span className="k">Mail spend</span><span className="v">{money(d.spend)}</span><span className="s">mailings marked as sent</span></div>
        <div className="kpi"><span className="k">Cost per response</span><span className="v">{d.mail ? money(d.spend / d.mail) : '—'}</span><span className="s">mail responses only</span></div>
        <div className="kpi"><span className="k">Cost per client</span><span className="v">{d.mail_clients ? money(d.spend / d.mail_clients) : '—'}</span><span className="s">{d.mail_clients ? money(d.mail_value) + ' a year from mail' : 'no mail clients yet'}</span></div>
      </section>
      <section className="panel">
        <div className="panel-head"><h2>Mail funnel</h2><p>Households reached by mail and how far they got.</p></div>
        <div className="funnel">
          {steps.map(([label, v], i) => (
            <div className="fstep" key={label}><span>{label}</span><div className="fbar"><i style={{ width: `${v ? Math.max(2, (v / top) * 100) : 0}%`, opacity: i === 3 ? 1 : 1 - i * 0.16 }} /></div><span className="n">{v.toLocaleString()}{i ? <span className="muted small"> {pct(v, steps[i - 1][1])}</span> : null}</span></div>
          ))}
        </div>
      </section>
      <div className="grid2">
        <section className="panel">
          <div className="panel-head"><h2>By mailing</h2></div>
          {mailings.length ? (
            <div className="table-wrap"><table><thead><tr><th>Mailing</th><th className="r">Pieces</th><th className="r">Cost</th><th className="r">Responses</th><th className="r">Clients</th><th className="r">Cost / client</th></tr></thead>
              <tbody>{mailings.map((m) => (
                <tr key={m.id}><td>{m.name}{m.status !== 'sent' && <> <span className="chip">Draft</span></>}</td><td className="r">{m.pieces}</td><td className="r">{money(m.cost)}</td><td className="r">{m.responses} <span className="muted small">{m.status === 'sent' ? pct(m.responses, m.pieces) : ''}</span></td><td className="r">{m.clients}</td><td className="r">{m.clients ? money(m.cost / m.clients) : '—'}</td></tr>
              ))}</tbody></table></div>
          ) : <div className="empty">No mailings yet.</div>}
        </section>
        <section className="panel">
          <div className="panel-head"><h2>By town</h2></div>
          {towns.length ? (
            <div className="table-wrap"><table><thead><tr><th>Town</th><th className="r">Households</th><th className="r">Mailed</th><th className="r">Responses</th><th className="r">Rate</th><th className="r">Clients</th></tr></thead>
              <tbody>{towns.map((t) => <tr key={t.town}><td>{t.town}</td><td className="r">{t.households}</td><td className="r">{t.mailed}</td><td className="r">{t.responses}</td><td className="r">{pct(t.responses, t.mailed)}</td><td className="r">{t.clients}</td></tr>)}</tbody></table></div>
          ) : <div className="empty">Towns appear once your list is imported.</div>}
        </section>
      </div>
      <section className="panel">
        <div className="panel-head"><h2>Follow-ups due</h2><p>{due.length ? `${due.length} due today or overdue` : 'Nothing due.'}</p></div>
        {due.length > 0 && (
          <div className="table-wrap"><table><thead><tr><th>Due</th><th>Owner</th><th>Town</th><th>Stage</th><th>Assigned</th></tr></thead>
            <tbody>{due.map((x) => <tr key={x.code}><td className="due">{fmtDate(x.follow_up)}</td><td><Link className="rowlink" href={`/app/households/${x.code}`}>{x.owner}</Link></td><td>{x.prop_city}</td><td><span className={`chip st-${x.stage}`}>{STAGE_LABEL[x.stage]}</span></td><td>{x.assignee ?? '—'}</td></tr>)}</tbody></table></div>
        )}
      </section>
    </>
  );
}
