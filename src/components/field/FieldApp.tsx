'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { blankAnswers, missingFor, hasIssue, templateFor, KIND_LABEL, LOW_TEMP_F, type Answer, type Result, type VisitKind, type Template } from '@/lib/checklist';
import {
  allDrafts, compressPhoto, deletePhoto, getDraft, getPosition, kvGet, kvSet, photosFor, prune, putDraft, putPhoto, sync, uuid,
  type Draft, type Photo, type SyncResult,
} from './fieldStore';

type Visit = {
  id: string; code: string; kind: VisitKind; due_date: string; status: string; address: string; city: string; owner: string;
  access_notes: string | null; extra_items: string[]; last_note: string | null; last_date: string | null; has_phone: boolean;
};
type Home = { code: string; address: string; city: string; owner: string; access_notes: string | null; extra_items: string[] };
type Today = { me: { email: string; name: string | null }; visits: Visit[]; homes: Home[]; today: string; fetchedAt: string };

const fmtDay = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const fmtAgo = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} hr ago` : new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

function draftLabel(d: Draft | undefined): { text: string; tone: string } | null {
  if (!d) return null;
  if (d.state === 'draft') return { text: d.startedAt ? 'In progress' : 'Not started', tone: 'info' };
  if (d.state === 'queued') return { text: 'Done · waiting for signal', tone: 'warn' };
  if (d.state === 'error') return { text: 'Done · will retry sending', tone: 'warn' };
  if (d.report === 'waiting') return { text: 'Sent · owner report waiting for approval', tone: 'warn' };
  if (d.report === 'sent') return { text: 'Sent · owner texted', tone: 'good' };
  if (d.report === 'no_phone') return { text: 'Sent · no owner phone on file', tone: 'warn' };
  if (d.report === 'failed') return { text: 'Sent · owner text failed, office will resend', tone: 'warn' };
  return { text: 'Sent', tone: 'good' };
}

export function FieldApp() {
  const [data, setData] = useState<Today | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [online, setOnline] = useState(true);
  const [loading, setLoading] = useState(true);
  const [signIn, setSignIn] = useState(false);
  const [syncState, setSyncState] = useState<{ busy: boolean; last?: SyncResult; at?: string }>({ busy: false });
  const [view, setView] = useState<{ name: 'list' } | { name: 'homes' } | { name: 'visit'; id: string }>({ name: 'list' });

  const refreshDrafts = useCallback(async () => {
    const list = await allDrafts();
    setDrafts(Object.fromEntries(list.map((d) => [d.id, d])));
  }, []);

  const runSync = useCallback(async () => {
    setSyncState((s) => ({ ...s, busy: true }));
    const r = await sync(() => { void refreshDrafts(); });
    if (r.signIn) setSignIn(true);
    setSyncState({ busy: false, last: r, at: new Date().toISOString() });
    await refreshDrafts();
    return r;
  }, [refreshDrafts]);

  const load = useCallback(async () => {
    const cached = await kvGet<Today>('today');
    if (cached) setData(cached);
    await refreshDrafts();
    setLoading(false);
    if (!navigator.onLine) return;
    try {
      const r = await fetch('/api/field/today', { credentials: 'same-origin', cache: 'no-store' });
      if (r.status === 401) {
        if (!cached) { location.href = '/field/login'; return; }
        setSignIn(true);
        return;
      }
      if (r.ok) {
        const fresh = (await r.json()) as Today;
        setData(fresh);
        setSignIn(false);
        await kvSet('today', fresh);
      }
    } catch { /* offline or weak signal: keep the cached list */ }
  }, [refreshDrafts]);

  useEffect(() => {
    setOnline(navigator.onLine);
    void load().then(() => runSync()).then(() => prune());
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
    const on = () => { setOnline(true); void load(); void runSync(); };
    const off = () => setOnline(false);
    const vis = () => { if (document.visibilityState === 'visible') { void load(); void runSync(); } };
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    document.addEventListener('visibilitychange', vis);
    const t = setInterval(() => { if (navigator.onLine) void runSync(); }, 60000);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); document.removeEventListener('visibilitychange', vis); clearInterval(t); };
  }, [load, runSync]);

  const pending = Object.values(drafts).filter((d) => d.state === 'queued' || d.state === 'error').length;

  async function openVisit(v: { id: string; code: string; kind: VisitKind; address: string; city: string; owner: string; extra_items: string[] }) {
    let d = await getDraft(v.id);
    if (!d) {
      const t = templateFor(v.kind, v.extra_items);
      d = { id: v.id, code: v.code, kind: v.kind, address: v.address, city: v.city, owner: v.owner, extraItems: v.extra_items ?? [],
        startedAt: null, completedAt: null, lat: null, lng: null, answers: blankAnswers(t), notes: '', photoIds: [], state: 'draft', updatedAt: new Date().toISOString() };
      await putDraft(d);
      await refreshDrafts();
    }
    setView({ name: 'visit', id: v.id });
    window.scrollTo(0, 0);
  }

  if (loading) return <main className="fld"><p className="muted">Loading…</p></main>;

  if (view.name === 'visit') {
    const meta = data?.visits.find((v) => v.id === view.id);
    const home = data?.homes.find((h) => h.code === drafts[view.id]?.code);
    return (
      <VisitScreen
        id={view.id}
        access={meta?.access_notes ?? home?.access_notes ?? null}
        lastNote={meta?.last_note ?? null}
        lastDate={meta?.last_date ?? null}
        hasPhone={meta?.has_phone ?? true}
        onBack={async () => { await refreshDrafts(); setView({ name: 'list' }); window.scrollTo(0, 0); }}
        onFinished={async () => { await refreshDrafts(); void runSync(); }}
      />
    );
  }

  if (view.name === 'homes') {
    return (
      <main className="fld">
        <button className="fld-back" type="button" onClick={() => setView({ name: 'list' })}>← Visits</button>
        <h1>Visit another home</h1>
        <p className="muted">For a visit that is not on your list, like an extra check after a storm.</p>
        <ul className="fld-list">
          {(data?.homes ?? []).map((h) => (
            <li key={h.code} className="fld-card">
              <div className="fld-addr">{h.address}</div>
              <div className="muted">{h.city} · {h.owner}</div>
              <div className="fld-row">
                <button type="button" className="fld-btn" onClick={() => openVisit({ ...h, id: uuid(), kind: 'storm' })}>Storm check</button>
                <button type="button" className="fld-btn" onClick={() => openVisit({ ...h, id: uuid(), kind: 'extra' })}>Extra visit</button>
              </div>
            </li>
          ))}
          {!data?.homes.length && <li className="muted">No client homes yet.</li>}
        </ul>
      </main>
    );
  }

  const today = data?.today ?? new Date().toISOString().slice(0, 10);
  const open = (data?.visits ?? []).filter((v) => !drafts[v.id] || drafts[v.id].state === 'draft');
  const overdue = open.filter((v) => v.due_date < today);
  const todays = open.filter((v) => v.due_date === today);
  const later = open.filter((v) => v.due_date > today);
  const finished = Object.values(drafts).filter((d) => d.state !== 'draft').sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));
  const inProgressAdHoc = Object.values(drafts).filter((d) => d.state === 'draft' && d.startedAt && !data?.visits.some((v) => v.id === d.id));

  const card = (v: Visit) => {
    const d = drafts[v.id];
    const lab = draftLabel(d);
    return (
      <li key={v.id}>
        <button type="button" className="fld-card fld-tap" onClick={() => openVisit(v)}>
          <div className="fld-row between">
            <span className={`fld-kind k-${v.kind}`}>{KIND_LABEL[v.kind]}</span>
            {v.due_date !== today && <span className="muted small">{fmtDay(v.due_date)}</span>}
          </div>
          <div className="fld-addr">{v.address || v.code}</div>
          <div className="muted">{v.city}{v.owner ? ` · ${v.owner}` : ''}</div>
          {lab && <div className={`fld-state t-${lab.tone}`}>{lab.text}</div>}
        </button>
      </li>
    );
  };

  return (
    <main className="fld">
      <header className="fld-head">
        <div>
          <div className="fld-sub">MiCasa Winter Watch</div>
          <h1>Visits</h1>
        </div>
        <button type="button" className={`fld-sync ${!online ? 'off' : pending ? 'warn' : 'ok'}`} onClick={() => runSync()} disabled={syncState.busy}>
          {syncState.busy ? 'Sending…' : !online ? `Offline${pending ? ` · ${pending} waiting` : ''}` : pending ? `${pending} waiting · send now` : 'All sent'}
        </button>
      </header>

      {signIn && <div className="fld-banner warn"><span>Your sign-in expired. Your visits are saved on this phone.</span> <a href="/field/login">Sign in again</a></div>}
      {!online && <div className="fld-banner"><span>No signal. Keep working: visits save on this phone and send when you are back in service.</span></div>}
      {data && <p className="muted small">{data.me.name || data.me.email} · list updated {fmtAgo(data.fetchedAt)}</p>}

      {inProgressAdHoc.length > 0 && <section><h2>In progress</h2><ul className="fld-list">{inProgressAdHoc.map((d) => (
        <li key={d.id}><button type="button" className="fld-card fld-tap" onClick={() => setView({ name: 'visit', id: d.id })}>
          <span className={`fld-kind k-${d.kind}`}>{KIND_LABEL[d.kind]}</span><div className="fld-addr">{d.address}</div><div className="muted">{d.city}</div></button></li>
      ))}</ul></section>}

      {overdue.length > 0 && <section><h2 className="t-bad">Overdue</h2><ul className="fld-list">{overdue.map(card)}</ul></section>}
      <section>
        <h2>Today</h2>
        {todays.length ? <ul className="fld-list">{todays.map(card)}</ul> : <p className="muted">Nothing scheduled for today.</p>}
      </section>
      {later.length > 0 && <section><h2>Coming up</h2><ul className="fld-list">{later.map(card)}</ul></section>}

      <button type="button" className="fld-btn wide" onClick={() => setView({ name: 'homes' })}>Visit a home not on the list</button>

      {finished.length > 0 && (
        <section>
          <h2>Finished</h2>
          <ul className="fld-list">
            {finished.map((d) => {
              const lab = draftLabel(d)!;
              return (
                <li key={d.id} className="fld-card">
                  <div className="fld-row between"><span className={`fld-kind k-${d.kind}`}>{KIND_LABEL[d.kind]}</span><span className="muted small">{d.completedAt ? fmtAgo(d.completedAt) : ''}</span></div>
                  <div className="fld-addr">{d.address}</div>
                  <div className={`fld-state t-${lab.tone}`}>{lab.text}</div>
                  {d.error && <div className="small t-warn">{d.error}</div>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}

function VisitScreen({ id, access, lastNote, lastDate, hasPhone, onBack, onFinished }: {
  id: string; access: string | null; lastNote: string | null; lastDate: string | null; hasPhone: boolean;
  onBack: () => void; onFinished: () => void;
}) {
  const [d, setD] = useState<Draft | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [showMissing, setShowMissing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingSlot = useRef<{ key: string | null; label: string } | null>(null);

  const reload = useCallback(async () => {
    const x = await getDraft(id);
    if (x) setD(x);
    setPhotos((await photosFor(id)).sort((a, b) => a.takenAt.localeCompare(b.takenAt)));
  }, [id]);
  useEffect(() => { void reload(); }, [reload]);

  const tpl: Template | null = useMemo(() => (d ? templateFor(d.kind, d.extraItems) : null), [d?.kind, d?.extraItems]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(next: Draft) {
    setD(next);
    await putDraft(next);
  }

  async function start() {
    if (!d) return;
    setBusy('Starting…');
    const pos = await getPosition();
    await save({ ...d, startedAt: new Date().toISOString(), lat: pos?.lat ?? null, lng: pos?.lng ?? null });
    setBusy(null);
  }

  function setAnswer(key: string, patch: Partial<Answer>) {
    if (!d) return;
    const answers = d.answers.map((a) => (a.key === key ? { ...a, ...patch } : a));
    void save({ ...d, answers, startedAt: d.startedAt ?? new Date().toISOString() });
  }

  function takePhoto(key: string | null, label: string) {
    pendingSlot.current = { key, label };
    setErr('');
    fileRef.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !d) return;
    const slot = pendingSlot.current ?? { key: null, label: 'Extra photo' };
    setBusy('Saving photo…');
    try {
      const c = await compressPhoto(file);
      const p: Photo = {
        id: uuid(), visitId: d.id, code: d.code, kind: d.kind, label: slot.label, itemKey: slot.key,
        takenAt: new Date().toISOString(), width: c.width, height: c.height, bytes: c.blob.size,
        blob: c.blob, thumb: c.thumb, uploaded: false, registered: false,
      };
      await putPhoto(p);
      await save({ ...d, photoIds: [...d.photoIds, p.id], startedAt: d.startedAt ?? new Date().toISOString() });
      setPhotos((ps) => [...ps, p]);
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Could not save that photo. Try again.');
    }
    setBusy(null);
  }

  async function removePhoto(pid: string) {
    if (!d) return;
    await deletePhoto(pid);
    await save({ ...d, photoIds: d.photoIds.filter((x) => x !== pid) });
    setPhotos((ps) => ps.filter((p) => p.id !== pid));
  }

  async function finish() {
    if (!d || !tpl) return;
    const miss = missingFor(d.answers, tpl, photos.map((p) => p.itemKey ?? ''));
    if (miss.length) { setShowMissing(true); return; }
    setBusy('Finishing…');
    const pos = await getPosition();
    await save({ ...d, completedAt: new Date().toISOString(), lat: d.lat ?? pos?.lat ?? null, lng: d.lng ?? pos?.lng ?? null, state: 'queued' });
    setBusy(null);
    onFinished();
  }

  if (!d || !tpl) return <main className="fld"><p className="muted">Loading…</p></main>;

  const locked = d.state !== 'draft';
  const photoKeys = photos.map((p) => p.itemKey ?? '');
  const missing = missingFor(d.answers, tpl, photoKeys);
  const issue = hasIssue(d.answers);
  const sections = [...new Set(tpl.items.map((i) => i.section))];

  return (
    <main className="fld">
      <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
      <button className="fld-back" type="button" onClick={onBack}>← Visits</button>
      <div className="stack-s">
        <span className={`fld-kind k-${d.kind}`}>{KIND_LABEL[d.kind]}</span>
        <h1>{d.address}</h1>
        <p className="muted">{d.city}{d.owner ? ` · ${d.owner}` : ''}</p>
      </div>

      {d.kind === 'photo' && <div className="fld-banner"><span>Free photo for a new lead: outside only, no key. Take the photos, check the outside, finish. The owner gets the report by text.</span></div>}
      {access && <div className="fld-note"><b>Access</b><span>{access}</span></div>}
      {lastNote && <div className="fld-note"><b>Last visit{lastDate ? ` (${fmtDay(lastDate)})` : ''}</b><span>{lastNote}</span></div>}
      {!hasPhone && <div className="fld-banner warn"><span>No owner phone on file. The office will send this report.</span></div>}

      {locked ? (
        <div className="fld-done">
          <h2>{d.state === 'synced' ? 'Visit sent' : 'Visit saved on this phone'}</h2>
          <p>{draftLabel(d)?.text}</p>
          {d.error && <p className="t-warn">{d.error}</p>}
        </div>
      ) : !d.startedAt ? (
        <button type="button" className="fld-btn primary wide big" onClick={start} disabled={!!busy}>{busy ?? 'Start visit'}</button>
      ) : null}

      {(d.startedAt || locked) && (
        <>
          <section>
            <h2>Photos</h2>
            <div className="fld-photos">
              {tpl.photos.map((slot) => {
                const p = photos.find((x) => x.itemKey === slot.key);
                return (
                  <div key={slot.key} className={`fld-slot ${p ? 'has' : ''}`}>
                    {p ? (
                      <>
                        <img src={p.thumb} alt={slot.label} />
                        {!locked && <button type="button" className="fld-x" aria-label={`Remove ${slot.label} photo`} onClick={() => removePhoto(p.id)}>×</button>}
                      </>
                    ) : (
                      <button type="button" className="fld-take" onClick={() => takePhoto(slot.key, slot.label)} disabled={locked || !!busy}>
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
                      </button>
                    )}
                    <span>{slot.label}</span>
                  </div>
                );
              })}
              {photos.filter((p) => !tpl.photos.some((s) => s.key === p.itemKey)).map((p) => (
                <div key={p.id} className="fld-slot has">
                  <img src={p.thumb} alt={p.label} />
                  {!locked && <button type="button" className="fld-x" aria-label="Remove photo" onClick={() => removePhoto(p.id)}>×</button>}
                  <span>{p.label}</span>
                </div>
              ))}
            </div>
            {!locked && <button type="button" className="fld-btn" onClick={() => takePhoto(null, 'Extra photo')} disabled={!!busy}>+ Add another photo</button>}
          </section>

          {sections.map((sec) => (
            <section key={sec}>
              <h2>{sec}</h2>
              <ul className="fld-items">
                {tpl.items.filter((i) => i.section === sec).map((item) => {
                  const a = d.answers.find((x) => x.key === item.key)!;
                  if (!a) return null;
                  const low = item.kind === 'temp' && a.value != null && a.value < LOW_TEMP_F;
                  return (
                    <li key={item.key} className={`fld-item ${a.result === 'issue' || low ? 'is-issue' : ''}`}>
                      <div className="fld-item-label">{item.label}</div>
                      {item.kind === 'temp' ? (
                        <div className="fld-row">
                          <label className="fld-temp">
                            <input type="number" inputMode="numeric" min={-20} max={99} value={a.value ?? ''} disabled={locked}
                              aria-label="Thermostat reading in degrees Fahrenheit"
                              onChange={(e) => setAnswer(item.key, { value: e.target.value === '' ? null : Number(e.target.value), result: e.target.value === '' ? null : (Number(e.target.value) < LOW_TEMP_F ? 'issue' : 'ok') })} />
                            <span>°F</span>
                          </label>
                          {low && <span className="small t-bad">Below {LOW_TEMP_F}°F. Flagged.</span>}
                        </div>
                      ) : (
                        <div className="fld-seg" role="group" aria-label={item.label}>
                          {(['ok', 'issue', 'na'] as Result[]).map((r) => (
                            <button key={r} type="button" disabled={locked} aria-pressed={a.result === r} className={`seg-${r} ${a.result === r ? 'on' : ''}`}
                              onClick={() => setAnswer(item.key, { result: r })}>
                              {r === 'ok' ? 'OK' : r === 'issue' ? 'Issue' : 'N/A'}
                            </button>
                          ))}
                        </div>
                      )}
                      {(a.result === 'issue' || low) && (
                        <div className="fld-issue">
                          <label className="fld-field">What did you find?
                            <textarea rows={2} value={a.note ?? ''} disabled={locked} onChange={(e) => setAnswer(item.key, { note: e.target.value })} placeholder="Water under the kitchen sink, about a cup" />
                          </label>
                          {!locked && <button type="button" className="fld-btn" onClick={() => takePhoto(item.key + '_issue', item.label)}>+ Photo of this</button>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          <section>
            <h2>Notes</h2>
            <label className="fld-field">Anything the owner or the next visit should know
              <textarea rows={3} value={d.notes} disabled={locked} onChange={(e) => void save({ ...d, notes: e.target.value })} placeholder="Shoveled the back steps. Thermostat set to 55." />
            </label>
          </section>

          {!locked && (
            <section className="fld-finish">
              {err && <p className="t-bad">{err}</p>}
              {showMissing && missing.length > 0 && <p className="t-bad">Still needed: {missing.join('; ')}.</p>}
              <p className="muted small">{issue
                ? 'Issue found: this goes to the office first. The owner hears once it is approved.'
                : 'All clear: the owner gets the photo report by text automatically.'}</p>
              <button type="button" className={`fld-btn primary wide big ${missing.length ? 'dim' : ''}`} onClick={finish} disabled={!!busy}>{busy ?? 'Finish visit'}</button>
            </section>
          )}
        </>
      )}
    </main>
  );
}
