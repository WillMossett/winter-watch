import Link from 'next/link';
import { db, getSettings } from '@/lib/db';
import { sendblueConfigured } from '@/lib/sendblue';
import { fmtDate, fmtDateTime, prettyPhone, smsSegments } from '@/lib/text';
import { cancelAlert, saveAlertDraft, sendAlert, setCheckStatus, setSubscriberStatus } from '../actions';

export const metadata = { title: 'Storm alerts' };
export const maxDuration = 300;

const TEMPLATES: Record<string, [string, string]> = {
  freeze: ['Hard freeze', 'MiCasa Storm Alert: Hard freeze tonight on the Lake Huron shore, low near [TEMP] degrees. If your heat fails, pipes can freeze within hours. Want us to check your home tomorrow? Reply CHECK ($65, no contract). Reply STOP to opt out.'],
  ice: ['Ice storm', 'MiCasa Storm Alert: Ice storm warning for [COUNTY] County [DAY]. Power outages are likely along the shore. Want us to check your home once it passes? Reply CHECK ($65, no contract). Reply STOP to opt out.'],
  wind: ['High wind', 'MiCasa Storm Alert: High wind warning for the shoreline [DAY], gusts to [MPH] mph. Watch for roof, tree and power damage. Want a check after it passes? Reply CHECK ($65). Reply STOP to opt out.'],
  outage: ['Power outage', 'MiCasa Storm Alert: Widespread power outages reported near [TOWN]. Without power, heat stops and pipes can freeze. Want us to check your home today? Reply CHECK ($65). Reply STOP to opt out.'],
};

export default async function Alerts({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string; failed?: string; t?: string }> }) {
  const sp = await searchParams;
  const sql = db();
  const [settings, drafts, history, subs, checks] = await Promise.all([
    getSettings(),
    sql<{ id: string; type: string; message: string; source: string; nws_event: string | null; nws_areas: string | null; nws_ends: string | null; created_at: string }[]>`select * from ww.alerts where status = 'draft' order by created_at desc`,
    sql<{ id: string; type: string; message: string; source: string; sent_at: string; recipients: number; delivered: number; failed: number; approved_by: string | null; status: string }[]>`select * from ww.alerts where status in ('sent','sending') order by sent_at desc nulls first limit 30`,
    sql<{ id: string; phone: string; status: string; consent_at: string; consent_method: string; code: string | null; owner: string | null; prop_city: string | null }[]>`
      select s.*, h.owner, h.prop_city from ww.subscribers s left join ww.households h on h.code = s.code order by s.status, s.created_at desc`,
    sql<{ id: string; phone: string; status: string; requested_at: string; code: string | null; owner: string | null; prop_address: string | null; prop_city: string | null }[]>`
      select c.*, h.owner, h.prop_address, h.prop_city from ww.check_requests c left join ww.households h on h.code = c.code
      where c.status in ('new','scheduled') or c.requested_at > now() - interval '14 days' order by c.requested_at desc`,
  ]);
  const active = subs.filter((s) => s.status === 'active').length;
  const connected = sendblueConfigured();
  const tKey = sp.t && TEMPLATES[sp.t] ? sp.t : 'freeze';
  const price = Math.round(settings.check_price);
  const tmpl = TEMPLATES[tKey][1].replaceAll('$65', `$${price}`);

  const sendForm = (id: string, message: string) => (
    <form action={sendAlert.bind(null, id)} className="stack" style={{ gap: 10 }}>
      <label className="f">Message<textarea name="message" defaultValue={message} /></label>
      <p className="small muted">{smsSegments(message).chars} characters · goes to {active} active subscriber{active === 1 ? '' : 's'}.</p>
      <div className="row" style={{ alignItems: 'end' }}>
        <label className="f" style={{ width: 160 }}>Type SEND to confirm<input type="text" name="confirm" autoComplete="off" /></label>
        <button className="btn primary" type="submit" disabled={!connected || !settings.alerts_enabled}>Send to {active}</button>
      </div>
    </form>
  );

  return (
    <>
      {sp.error && <div className="banner bad"><span>{sp.error}</span></div>}
      {sp.sent && <div className="banner good"><span><strong>Alert sent.</strong> {sp.sent} texts accepted{Number(sp.failed) ? `, ${sp.failed} failed (see history)` : ''}.</span></div>}
      {!connected ? (
        <div className="banner"><span><strong>Texting is not connected yet.</strong> Alerts can be drafted now. Sending starts once the Sendblue keys are added to the app.</span></div>
      ) : !settings.alerts_enabled ? (
        <div className="banner"><span><strong>Texting is connected but switched off.</strong> Send yourself a test from Settings, then switch it on.</span><Link className="btn" href="/app/settings">Open Settings</Link></div>
      ) : null}

      <section className="kpis">
        <div className="kpi lead"><span className="k">Active subscribers</span><span className="v">{active}</span><span className="s">with recorded consent</span></div>
        <div className="kpi"><span className="k">Stopped</span><span className="v">{subs.length - active}</span><span className="s">never texted again</span></div>
        <div className="kpi"><span className="k">Check requests</span><span className="v">{checks.filter((c) => c.status === 'new').length}</span><span className="s">waiting to be scheduled</span></div>
        <div className="kpi"><span className="k">Alerts sent</span><span className="v">{history.filter((h) => h.status === 'sent').length}</span><span className="s">this season</span></div>
      </section>

      {drafts.map((a) => (
        <section className="panel" key={a.id} style={{ borderColor: 'var(--warn)' }}>
          <div className="panel-head"><h2>{a.source === 'nws' ? `Draft from the Weather Service: ${a.nws_event}` : 'Draft alert'}</h2><form action={cancelAlert.bind(null, a.id)}><button className="btn quiet" type="submit">Discard</button></form></div>
          {a.source === 'nws' && <p className="small muted">{a.nws_areas}{a.nws_ends ? ` · until ${fmtDateTime(a.nws_ends)}` : ''} · drafted {fmtDateTime(a.created_at)}. Check the wording, then send.</p>}
          {sendForm(a.id, a.message)}
        </section>
      ))}

      <section className="panel">
        <div className="panel-head"><h2>Write an alert</h2><p>Weather Service warnings for Sanilac, Huron and St. Clair are drafted for you automatically.</p></div>
        <div className="row">{Object.entries(TEMPLATES).map(([k, [label]]) => <Link key={k} href={`/app/alerts?t=${k}`} className={'btn' + (k === tKey ? ' primary' : '')}>{label}</Link>)}</div>
        <form action={saveAlertDraft} className="stack" style={{ gap: 10 }} key={tKey}>
          <input type="hidden" name="type" value={tKey} />
          <label className="f">Message<textarea name="message" defaultValue={tmpl} /></label>
          <p className="small muted">Replace the words in [brackets]. Saving creates a draft above that you can send.</p>
          <div><button className="btn" type="submit">Save as draft</button></div>
        </form>
      </section>

      <section className="panel" id="checks">
        <div className="panel-head"><h2>Storm check requests</h2><p>People who replied CHECK.</p></div>
        {checks.length ? (
          <div className="table-wrap"><table><thead><tr><th>Requested</th><th>Who</th><th>Home</th><th>Phone</th><th>Status</th><th></th></tr></thead>
            <tbody>{checks.map((c) => (
              <tr key={c.id}><td>{fmtDateTime(c.requested_at)}</td><td>{c.code ? <Link className="rowlink" href={`/app/households/${c.code}`}>{c.owner}</Link> : 'Not on list'}</td><td>{c.prop_address ? `${c.prop_address}, ${c.prop_city}` : '—'}</td><td className="mono small">{prettyPhone(c.phone)}</td>
                <td><span className={`chip ${c.status === 'new' ? 'st-walkthrough' : c.status === 'done' ? 'ok' : ''}`}>{c.status === 'new' ? 'New' : c.status === 'scheduled' ? 'Scheduled' : c.status === 'done' ? 'Done' : 'Cancelled'}</span></td>
                <td><div className="row">{c.status === 'new' && <form action={setCheckStatus.bind(null, c.id, 'scheduled')}><button className="btn" type="submit">Scheduled</button></form>}{c.status !== 'done' && c.status !== 'cancelled' && <form action={setCheckStatus.bind(null, c.id, 'done')}><button className="btn" type="submit">Done</button></form>}</div></td></tr>
            ))}</tbody></table></div>
        ) : <div className="empty">No requests yet. They arrive when a subscriber replies CHECK to an alert.</div>}
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Subscribers</h2></div>
        {subs.length ? (
          <div className="table-wrap"><table><thead><tr><th>Phone</th><th>Owner</th><th>Town</th><th>Consent</th><th>Status</th><th></th></tr></thead>
            <tbody>{subs.map((s) => (
              <tr key={s.id}><td className="mono small">{prettyPhone(s.phone)}</td><td>{s.code ? <Link className="rowlink" href={`/app/households/${s.code}`}>{s.owner}</Link> : '—'}</td><td>{s.prop_city ?? '—'}</td>
                <td className="small">{s.consent_method} · {fmtDate(s.consent_at)}</td>
                <td><span className={`chip ${s.status === 'active' ? 'ok' : 'no'}`}>{s.status === 'active' ? 'Active' : 'Stopped'}</span></td>
                <td>{s.status === 'active' ? <form action={setSubscriberStatus.bind(null, s.id, false)}><button className="btn quiet" type="submit">Stop texts</button></form> : null}</td></tr>
            ))}</tbody></table></div>
        ) : <div className="empty"><strong>No subscribers yet</strong><span>People join from their scan page, by texting STORM, or when you record their agreement on a call.</span></div>}
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Sent alerts</h2></div>
        {history.length ? (
          <div className="table-wrap"><table><thead><tr><th>Sent</th><th className="r">Recipients</th><th className="r">Accepted</th><th className="r">Failed</th><th>Message</th><th>By</th></tr></thead>
            <tbody>{history.map((a) => <tr key={a.id}><td>{a.status === 'sending' ? 'Sending…' : fmtDateTime(a.sent_at)}</td><td className="r">{a.recipients}</td><td className="r">{a.delivered}</td><td className="r">{a.failed}</td><td>{a.message}</td><td className="small">{a.approved_by ?? '—'}</td></tr>)}</tbody></table></div>
        ) : <div className="empty">Alerts you send will show here.</div>}
      </section>
    </>
  );
}
