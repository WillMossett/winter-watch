'use client';
import { useState } from 'react';
import { sendCode, verifyCode } from './actions';

export default function FieldLogin() {
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function onPhone(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg('');
    const r = await sendCode(phone);
    setBusy(false);
    if (!r.ok) return setMsg(r.error ?? 'Try again.');
    setNote(r.note ?? '');
    setStep('code');
  }
  async function onCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg('');
    const r = await verifyCode(phone, code);
    setBusy(false);
    if (!r.ok) return setMsg(r.error ?? 'Try again.');
    location.href = '/field';
  }

  return (
    <main className="fld">
      <div className="fld-sub">MiCasa Winter Watch</div>
      <h1>Sign in</h1>
      {step === 'phone' ? (
        <form onSubmit={onPhone} className="fld-form">
          <label className="fld-field">Your mobile number
            <input type="tel" autoComplete="tel" inputMode="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(810) 555-0100" />
          </label>
          <button className="fld-btn primary wide big" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Text me a code'}</button>
          <p className="muted small">Use the number Will has on the team list. First time? Text anything to the Winter Watch number once so it can text you back.</p>
        </form>
      ) : (
        <form onSubmit={onCode} className="fld-form">
          <p>{note || 'A code is on its way.'} It usually arrives within a few seconds.</p>
          <label className="fld-field">6-digit code
            <input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value)} className="fld-code" autoFocus />
          </label>
          <button className="fld-btn primary wide big" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Sign in'}</button>
          <button className="fld-btn wide" type="button" onClick={() => { setStep('phone'); setCode(''); setMsg(''); }}>Send a new code</button>
        </form>
      )}
      {msg && <p className="t-bad">{msg}</p>}
    </main>
  );
}
