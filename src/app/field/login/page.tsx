'use client';
import { useState } from 'react';
import { sendCode, verifyCode } from './actions';

export default function FieldLogin() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function onEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg('');
    const r = await sendCode(email);
    setBusy(false);
    if (!r.ok) return setMsg(r.error ?? 'Try again.');
    setStep('code');
  }
  async function onCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg('');
    const r = await verifyCode(email, code);
    setBusy(false);
    if (!r.ok) return setMsg(r.error ?? 'Try again.');
    location.href = '/field';
  }

  return (
    <main className="fld">
      <div className="fld-sub">MiCasa Winter Watch</div>
      <h1>Sign in</h1>
      {step === 'email' ? (
        <form onSubmit={onEmail} className="fld-form">
          <label className="fld-field">Work email
            <input type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button className="fld-btn primary wide big" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Email me a code'}</button>
          <p className="muted small">Only people on the Winter Watch team can sign in. Ask Will to add you.</p>
        </form>
      ) : (
        <form onSubmit={onCode} className="fld-form">
          <p>We emailed a 6-digit code to <b>{email}</b>. It can take a minute.</p>
          <label className="fld-field">Code
            <input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={8} required value={code} onChange={(e) => setCode(e.target.value)} className="fld-code" />
          </label>
          <button className="fld-btn primary wide big" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Sign in'}</button>
          <button className="fld-btn wide" type="button" onClick={() => { setStep('email'); setCode(''); }}>Use a different email</button>
        </form>
      )}
      {msg && <p className="t-bad">{msg}</p>}
    </main>
  );
}
