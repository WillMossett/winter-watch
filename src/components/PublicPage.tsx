import { Logo } from './Logo';
import { ALERT_CONSENT_TEXT } from '@/lib/consent';
import { submitInterest } from '@/app/(public)/actions';
import type { Settings } from '@/lib/db';
import { PLANS } from '@/lib/plans';

const Check = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);

export function PublicPage({ code, known, settings, thanks, error }: { code: string | null; known: boolean; settings: Settings; thanks: boolean; error?: string }) {
  return (
    <main className="pub">
      <div className="pub-head"><Logo size={36} /><div><div className="sub">MiCasa Stays</div><div className="name">Winter Watch</div></div></div>
      <div className="stack" style={{ gap: 12 }}>
        <h1>Who&apos;s checking on your cottage this winter?</h1>
        <p className="lede">We visit seasonal homes on the Lake Huron shoreline on a set schedule and send you a photo report the same day. If the heat fails or a pipe lets go, we catch it in days, not in April.</p>
      </div>
      <ul className="points">
        <li><Check /><span><strong>Weekly visits, Nov through April.</strong> Heat, water, roof, doors, signs of entry, checked against a list built for your home.</span></li>
        <li><Check /><span><strong>Same-day photo reports.</strong> A dated record of regular checks, the kind your insurance company expects for a home left empty.</span></li>
        <li><Check /><span><strong>Local and on call.</strong> A team based in Port Sanilac that knows these homes, with storm checks after big weather.</span></li>
      </ul>
      <div className="plans">
        {PLANS.map((p) => (
          <div key={p.name} className={'plan' + ('recommended' in p ? ' rec' : '')}><div className="n">{p.name}</div><div className="p">${p.winter}<span className="small muted">/mo</span></div><div className="small muted">{p.blurb}</div></div>
        ))}
      </div>
      <p className="small muted">Winter rates, November through April. On a 12-month plan, summer is on-call service from $49/mo. Every plan starts with a free walkthrough.</p>

      <div id="form" />
      {thanks ? (
        <section className="panel" style={{ borderColor: 'var(--good)' }}>
          <h2>Thank you. We&apos;ll be in touch.</h2>
          <p>Someone from MiCasa Stays will reach out within one business day. If you signed up for storm alerts, you&apos;ll get a text confirming it.</p>
        </section>
      ) : (
        <form action={submitInterest} className="panel">
          <h2>Book a free walkthrough or get storm alerts</h2>
          {error && <div className="banner bad"><span>{error}</span></div>}
          {code && known ? <input type="hidden" name="code" value={code} /> : (
            <label className="f">Code from your letter (if you have one)<input type="text" name="typed_code" defaultValue={code ?? ''} placeholder="WW-A7K2" autoCapitalize="characters" /></label>
          )}
          <div style={{ position: 'absolute', left: '-9999px' }} aria-hidden="true"><label>Website<input type="text" name="website" tabIndex={-1} autoComplete="off" /></label></div>
          <label className="f">Your name<input type="text" name="name" required autoComplete="name" /></label>
          <div className="fields">
            <label className="f">Mobile number<input type="tel" name="phone" autoComplete="tel" inputMode="tel" /></label>
            <label className="f">Email<input type="email" name="email" autoComplete="email" /></label>
          </div>
          <label className="check"><input type="checkbox" name="walkthrough" defaultChecked /> Book a free walkthrough of my home</label>
          <label className="check"><input type="checkbox" name="alerts" /> <span>Text me free storm alerts<br /><span className="consent">{ALERT_CONSENT_TEXT}</span></span></label>
          <label className="f">Anything we should know? (optional)<textarea name="message" placeholder="When you close the cottage, whether the water stays on, questions" /></label>
          <div><button className="btn primary" type="submit">Send</button></div>
          {code && known && <span className="yourcode">Your code <span className="code">{code}</span></span>}
        </form>
      )}
      <div className="foot">
        <span>MiCasa Stays · Port Sanilac, Michigan · info@micasastays.com</span>
        <span>Winter Watch is a visual inspection service, not repairs or a licensed home inspection.</span>
      </div>
    </main>
  );
}
