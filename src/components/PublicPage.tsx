import { Logo } from './Logo';
import { ALERT_CONSENT_TEXT } from '@/lib/consent';
import { submitInterest } from '@/app/(public)/actions';
import type { Settings } from '@/lib/db';
import { prettyPhone } from '@/lib/text';
import { PLANS, FOUNDING } from '@/lib/plans';

const Check = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);

export function PublicPage({ code, known, settings, thanks, error }: { code: string | null; known: boolean; settings: Settings; thanks: boolean; error?: string }) {
  const textLine = process.env.SENDBLUE_FROM_NUMBER ? prettyPhone(process.env.SENDBLUE_FROM_NUMBER) : null;
  const textWord = `STORM${code && known ? ' ' + code : ''}`;
  return (
    <main className="pub">
      <div className="pub-head"><Logo size={36} /><div><div className="sub">MiCasa Stays</div><div className="name">Winter Watch</div></div></div>
      <div className="stack" style={{ gap: 12 }}>
        <h1>Who&apos;s checking on your cottage this winter?</h1>
        <p className="lede">An ice storm knocks out the power and the furnace doesn&apos;t relight. A pipe in an outside wall splits at five below. In an empty home it can run for weeks. MiCasa Stays already looks after more than 100 homes along the Lake Huron shore, and this winter we&apos;re opening Winter Watch to {FOUNDING.homes} seasonal homes, so you can open your cottage in spring exactly how you left it.</p>
      </div>
      <section className="fo" aria-label={`The Founding ${FOUNDING.homes}`}>
        <div className="fo-bar"><b>THE FOUNDING {FOUNDING.homes}</b><span>Only {FOUNDING.homes} homes this winter · Bonuses end {FOUNDING.deadline}</span></div>
        <div className="fo-grid">
          <div className="fo-plan">
            <div className="k">Winter Watch Standard</div>
            <div className="p">${FOUNDING.rate}<small>/mo founding rate</small></div>
            <div className="s">Homes after the first {FOUNDING.homes} pay ${FOUNDING.regular}/mo. Yours stays ${FOUNDING.rate} for life. November through April, month to month.</div>
            <ul className="points">
              <li><Check /><span>A visit every week: heat, water, leaks, roof, doors</span></li>
              <li><Check /><span>Photo report the same day, every visit</span></li>
              <li><Check /><span>Storm checks after big weather, included</span></li>
              <li><Check /><span>A local team on call, so you never drive up</span></li>
            </ul>
          </div>
          <div className="fo-bon">
            <div className="k">Founding bonuses, free</div>
            <table><tbody>
              {FOUNDING.bonuses.map((b) => (
                <tr key={b.name}><td>{b.name}{'note' in b && <div className="sub">{b.note}</div>}</td><td className="v">${b.value}</td></tr>
              ))}
              <tr className="tot"><td>Total bonus value</td><td className="v">${FOUNDING.bonuses.reduce((a, b) => a + b.value, 0).toLocaleString()}</td></tr>
            </tbody></table>
          </div>
        </div>
        <div className="fo-g"><strong>Every visit, or it&apos;s free.</strong> Miss a scheduled visit and that month costs you nothing. <strong>Not happy in the first 30 days?</strong> Every dollar back. After that, cancel any month.</div>
      </section>
      <p className="others">Other plans: {PLANS.filter((p) => p.name !== 'Standard').map((p) => `${p.name} $${p.winter}/mo (${p.blurb.toLowerCase()})`).join(' · ')}. Snow clearing and other add-ons priced separately.</p>

      <div id="form" />
      {thanks ? (
        <section className="panel" style={{ borderColor: 'var(--good)' }}>
          <h2>Thank you. We&apos;ll be in touch.</h2>
          <p>Someone from MiCasa Stays will reach out within one business day and we&apos;ll get a photo of your place to you this week. If you signed up for storm alerts, you&apos;ll get a text confirming it.</p>
        </section>
      ) : (
        <form action={submitInterest} className="panel">
          <h2>Step one is free: a photo of your place this week</h2>
          <p className="small muted" style={{ margin: 0 }}>We walk the outside, check the roof, gutters and doors, and text you what we see. No key, nothing to sign. You&apos;ll know exactly what you&apos;re getting before you spend a dollar.</p>
          {textLine && <p style={{ margin: 0 }}>Fastest way: text <strong>{textWord}</strong> to <strong>{textLine}</strong>. Or fill this in.</p>}
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
          <label className="check"><input type="checkbox" name="walkthrough" defaultChecked /> Send me a free photo of my place this week</label>
          <label className="check"><input type="checkbox" name="alerts" /> <span>Not ready yet? Text me free storm alerts<br /><span className="consent">{ALERT_CONSENT_TEXT}</span></span></label>
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
