import { Logo } from '@/components/Logo';
import { sendLoginLink } from './actions';

export const metadata = { title: 'Team sign-in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="wrap" style={{ maxWidth: 440, paddingBlock: '64px' }}>
      <div className="panel">
        <div className="row"><Logo /><div><div className="small muted" style={{ letterSpacing: '.12em', textTransform: 'uppercase', fontWeight: 600 }}>MiCasa Stays</div><h1 style={{ fontSize: 22 }}>Winter Watch team</h1></div></div>
        {sp.sent ? (
          <div className="banner good"><span>Check your email for a sign-in link. It works once and expires in an hour.</span></div>
        ) : (
          <form action={sendLoginLink} className="stack" style={{ gap: 12 }}>
            {sp.error && <div className="banner bad"><span>{sp.error}</span></div>}
            <label className="f">Work email<input type="email" name="email" required autoComplete="email" /></label>
            <button className="btn primary" type="submit">Email me a sign-in link</button>
            <p className="small muted">Only people on the Winter Watch team can sign in. Ask an owner to add you.</p>
          </form>
        )}
      </div>
    </main>
  );
}
