import { Fragment } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { householdDetail } from '@/lib/queries';
import { getSettings } from '@/lib/db';
import { EVENT_LABEL, RESPONSE_TYPES, STAGES, STAGE_LABEL, TIERS } from '@/lib/leads';
import { fmtDate, fmtDateTime, money, prettyPhone, todayDetroit } from '@/lib/text';
import { assignToMe, logActivity, saveHousehold, saveLead, setExcluded } from '../../actions';
import { addVisit, savePlan } from '../../visits/actions';
import { db } from '@/lib/db';
import { KIND_LABEL, type VisitKind } from '@/lib/checklist';
import { ReportChip } from '../../visits/shared';

export const metadata = { title: 'Household' };

const EDIT: [string, string][] = [['owner', 'Owner name'], ['owner2', 'Second owner'], ['first_name', 'First name for greeting'], ['prop_address', 'Property street address'], ['prop_city', 'Property city'], ['prop_state', 'Property state'], ['prop_zip', 'Property ZIP'], ['mail_address', 'Mailing street address'], ['mail_city', 'Mailing city'], ['mail_state', 'Mailing state'], ['mail_zip', 'Mailing ZIP']];

export default async function HouseholdPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ edit?: string; error?: string; saved?: string; plan?: string }> }) {
  const { code } = await params;
  const sp = await searchParams;
  const [d, settings] = await Promise.all([householdDetail(decodeURIComponent(code)), getSettings()]);
  if (!d) notFound();
  const { h, lead, events, mailings, subs } = d;
  const sql = db();
  const [[plan], visits, team] = await Promise.all([
    sql`select tier, interval_days, start_date::text, end_date::text, active, owner_phone, owner_email, tech_email, access_notes, extra_items from ww.service_plans where code = ${h.code}`,
    sql<{ id: string; kind: VisitKind; due_date: string; status: string; has_issue: boolean; report_status: string }[]>`
      select id, kind, due_date::text, status, has_issue, report_status from ww.visits where code = ${h.code}
      order by due_date desc, created_at desc limit 12`,
    sql<{ email: string; name: string | null }[]>`select email, name from ww.team_members order by role, name nulls last, email`,
  ]);
  const showPlan = Boolean(plan) || lead?.stage === 'client' || sp.plan === '1';
  const firstPhone = plan?.owner_phone ?? subs.find((x) => x.status === 'active')?.phone ?? '';
  const link = `${settings.site_url.replace(/\/$/, '')}/${h.code}`;
  const qr = await QRCode.toString(link, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  const sentMailings = mailings.filter((m) => m.status === 'sent');
  const today = todayDetroit();
  const details: [string, string | null][] = [['Property type', h.prop_type], ['Beds / baths', [h.beds, h.baths].filter(Boolean).join(' / ') || null], ['Square feet', h.sqft], ['Year built', h.year_built], ['Estimated value', h.est_value && !isNaN(Number(String(h.est_value).replace(/[$,]/g, ''))) ? money(String(h.est_value).replace(/[$,]/g, '')) : h.est_value], ['Last sale', h.last_sale], ['Owner type', h.owner_type], ['Parcel', h.apn], ['Source', h.source]];

  const logForm = (
    <form action={logActivity.bind(null, h.code)} className="stack" style={{ gap: 12 }}>
      <div className="fields">
        <label className="f">What happened<select name="type" defaultValue="call">{RESPONSE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}{lead && <option value="note">Note only</option>}</select></label>
        <label className="f">Date<input type="date" name="date" defaultValue={today} /></label>
        <label className="f">From which mailing<select name="mailing" defaultValue="auto"><option value="auto">Most recent mailing</option><option value="none">Not from a mailing</option>{sentMailings.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
      </div>
      <label className="f">Note<textarea name="note" placeholder="What they asked about, home details, next step" /></label>
      <label className="check"><input type="checkbox" name="alerts" /> They want storm alerts and agreed to receive texts</label>
      <div className="fields"><label className="f">Mobile number<input type="tel" name="phone" /></label><label className="f">Email<input type="email" name="email" /></label></div>
      <div className="row"><button className="btn primary" type="submit">{lead ? 'Add to activity' : 'Log response'}</button></div>
    </form>
  );

  return (
    <>
      <div className="row between">
        <div className="stack" style={{ gap: 6 }}>
          <div className="row"><span className="code">{h.code}</span>{lead ? <span className={`chip st-${lead.stage}`}>{STAGE_LABEL[lead.stage]}</span> : h.excluded ? <span className="chip">Excluded</span> : null}</div>
          <h1>{h.owner}</h1>{h.owner2 && <p className="muted">{h.owner2}</p>}
        </div>
        <div className="row"><Link className="btn" href={`/app/households/${h.code}?edit=1`}>Edit details</Link><Link className="btn quiet" href="/app/households">All households</Link></div>
      </div>
      {sp.error && <div className="banner bad"><span>{sp.error}</span></div>}
      <div className="split">
        <div className="stack">
          <section className="panel">
            {sp.edit ? (
              <form action={saveHousehold.bind(null, h.code)} className="stack" style={{ gap: 12 }}>
                <h2>Edit details</h2>
                <div className="fields">{EDIT.map(([k, l]) => <label key={k} className="f">{l}<input type="text" name={k} defaultValue={(h as Record<string, unknown>)[k] as string ?? ''} required={k === 'owner'} /></label>)}</div>
                <div className="row"><button className="btn primary" type="submit">Save details</button><Link className="btn" href={`/app/households/${h.code}`}>Cancel</Link></div>
              </form>
            ) : (
              <dl className="dl">
                <dt>Property</dt><dd>{h.prop_address ?? '—'}<br />{[h.prop_city, h.prop_state].filter(Boolean).join(', ')} {h.prop_zip}</dd>
                <dt>Mailing address</dt><dd>{h.mail_address ?? '—'}<br />{[h.mail_city, h.mail_state].filter(Boolean).join(', ')} {h.mail_zip}</dd>
                {details.filter(([, v]) => v).map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}
                <dt>Mailed</dt><dd>{sentMailings.length ? sentMailings.map((m) => <div key={m.id}>{m.name} · {fmtDate(m.sent_date)}</div>) : 'Not yet'}{mailings.filter((m) => m.status !== 'sent').map((m) => <div key={m.id} className="muted">In draft: {m.name}</div>)}</dd>
              </dl>
            )}
          </section>
          {lead ? (
            <section className="panel">
              <h2>Lead</h2>
              <form action={saveLead.bind(null, h.code)} className="stack" style={{ gap: 12 }}>
                <div className="fields">
                  <label className="f">Stage<select name="stage" defaultValue={lead.stage}>{STAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
                  <label className="f">Plan<select name="tier" defaultValue={lead.tier ?? ''}><option value="">Not chosen</option>{TIERS.map((t) => <option key={t} value={t}>{t} · {money(settings.tier_values[t])}/yr</option>)}</select></label>
                  <label className="f">Annual value ($)<input type="number" name="annual_value" min="0" step="1" defaultValue={lead.annual_value || ''} placeholder="Filled from plan" /></label>
                  <label className="f">Follow up on<input type="date" name="follow_up" defaultValue={lead.follow_up ?? ''} /></label>
                </div>
                <div className="row"><button className="btn primary" type="submit">Save</button></div>
              </form>
              <div className="row small">Assigned to <strong>{lead.assignee ?? 'nobody'}</strong><form action={assignToMe.bind(null, h.code)}><button className="btn quiet" type="submit">Assign to me</button></form></div>
              <p className="small muted">First response {fmtDateTime(lead.first_response_at)} by {EVENT_LABEL[lead.first_response_type] ?? lead.first_response_type}.</p>
            </section>
          ) : null}
          <section className="panel">
            <h2>{lead ? 'Log activity' : 'Log a response'}</h2>
            {!lead && <p className="small muted">Use this when they call, email or stop by. Scans and web form replies are logged automatically.</p>}
            {logForm}
          </section>
          <section className="panel">
            <h2>Activity</h2>
            {events.length ? (
              <ul className="timeline">{events.map((e) => (
                <li key={e.id}><span className="muted small">{fmtDateTime(e.at)}</span><span><strong>{EVENT_LABEL[e.type] ?? e.type}</strong>{e.mailing_name && <span className="muted small"> · {e.mailing_name}</span>}{e.note && <><br />{e.note}</>}{e.by_email && <><br /><span className="muted small">{e.by_email}</span></>}</span></li>
              ))}</ul>
            ) : <p className="muted">No activity yet.</p>}
          </section>
        </div>
        <div className="stack">
          <section className="panel">
            <h2>Response code</h2>
            <div className="qr" dangerouslySetInnerHTML={{ __html: qr }} />
            <span className="linkbox">{link}</span>
            <p className="small muted">This is the page their QR code opens. Scans show up in Activity on their own.</p>
          </section>
          <section className="panel" id="plan">
            <h2>Winter Watch plan</h2>
            {sp.saved === 'plan' && <div className="banner good"><span>Plan saved. Visits for the next week are on the schedule.</span></div>}
            {showPlan ? (
              <form action={savePlan.bind(null, h.code)} className="stack" style={{ gap: 12 }}>
                <div className="fields">
                  <label className="f">Plan<select name="tier" defaultValue={plan?.tier ?? lead?.tier ?? 'Standard'}>{TIERS.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
                  <label className="f">Visits<select name="interval_days" defaultValue={String(plan?.interval_days ?? 7)}><option value="7">Every week</option><option value="14">Every 2 weeks</option></select></label>
                  <label className="f">First visit<input type="date" name="start_date" defaultValue={plan?.start_date ?? today} required /></label>
                  <label className="f">Last visit (optional)<input type="date" name="end_date" defaultValue={plan?.end_date ?? ''} /></label>
                </div>
                <div className="fields">
                  <label className="f">Owner mobile for reports<input type="tel" name="owner_phone" defaultValue={firstPhone ? prettyPhone(firstPhone) : ''} placeholder="Texts the visit report" /></label>
                  <label className="f">Owner email<input type="email" name="owner_email" defaultValue={plan?.owner_email ?? ''} /></label>
                  <label className="f">Usual tech<select name="tech_email" defaultValue={plan?.tech_email ?? ''}><option value="">Anyone on the team</option>{team.map((t) => <option key={t.email} value={t.email}>{t.name ?? t.email}</option>)}</select></label>
                </div>
                <label className="f">Access notes (shown to the tech)<textarea name="access_notes" defaultValue={plan?.access_notes ?? ''} placeholder="Lockbox on side door, code 1234. Water shutoff in basement by the furnace." /></label>
                <label className="f">Extra checks for this home, one per line<textarea name="extra_items" defaultValue={((plan?.extra_items as string[] | undefined) ?? []).join('\n')} placeholder={'Check the boathouse door\nRun the upstairs shower'} /></label>
                <label className="check"><input type="checkbox" name="active" defaultChecked={plan ? plan.active : true} /> Active. Uncheck to stop scheduling visits.</label>
                <div className="row"><button className="btn primary" type="submit">{plan ? 'Save plan' : 'Start plan'}</button></div>
              </form>
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                <p className="small muted">Set up a plan when they sign up. Weekly visits then show on the field app and reports text the owner on their own.</p>
                <div><Link className="btn" href={`/app/households/${h.code}?plan=1#plan`}>Set up plan</Link></div>
              </div>
            )}
          </section>
          <section className="panel">
            <h2>Visits</h2>
            {visits.length ? (
              <ul className="timeline">{visits.map((x) => (
                <li key={x.id}><span className="muted small">{fmtDate(x.due_date)}</span><span><Link href={`/app/visits/${x.id}`}><strong>{KIND_LABEL[x.kind]}</strong></Link> · {x.status === 'done' ? <>{x.has_issue ? 'Issue' : 'All clear'} <ReportChip s={x.report_status} /></> : x.status === 'scheduled' ? 'Scheduled' : x.status === 'missed' ? 'Missed' : 'Cancelled'}</span></li>
              ))}</ul>
            ) : <p className="muted small">No visits yet.</p>}
            <form action={addVisit.bind(null, h.code)} className="row">
              <select name="kind" defaultValue="extra" aria-label="Visit type">{(['extra', 'storm', 'photo', 'walkthrough'] as VisitKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select>
              <input type="date" name="due_date" defaultValue={today} aria-label="Due" />
              <button className="btn" type="submit">Add visit</button>
            </form>
          </section>
          <section className="panel">
            <h2>Storm alerts</h2>
            {subs.length ? subs.map((s) => (
              <div key={s.id} className="stack" style={{ gap: 4 }}>
                <div className="row"><span className="mono">{prettyPhone(s.phone)}</span><span className={`chip ${s.status === 'active' ? 'ok' : 'no'}`}>{s.status === 'active' ? 'Subscribed' : 'Stopped'}</span></div>
                <span className="small muted">Agreed {fmtDate(s.consent_at)} by {s.consent_method.toLowerCase()}</span>
              </div>
            )) : <p className="muted small">Not subscribed. Add them from Log activity when they agree on a call.</p>}
          </section>
          <section className="panel">
            <h2>Mailing list</h2>
            {h.excluded ? (
              <>
                <p>Excluded from mailings: <strong>{h.exclude_reason ?? 'No reason given'}</strong></p>
                <form action={setExcluded.bind(null, h.code, false)}><button className="btn" type="submit">Include in mailings again</button></form>
              </>
            ) : (
              <form action={setExcluded.bind(null, h.code, true)} className="stack" style={{ gap: 10 }}>
                <label className="f">Reason<select name="reason" defaultValue="Do not contact">{['Do not contact', 'MiCasa owner', 'Bad address', 'Duplicate', 'Other'].map((r) => <option key={r}>{r}</option>)}</select></label>
                <div><button className="btn danger" type="submit">Exclude from mailings</button></div>
              </form>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
