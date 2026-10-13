import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { AppNav } from '@/components/AppNav';
import { requireMember } from '@/lib/auth';
import { db } from '@/lib/db';
import { signOut } from '../login/actions';

export const dynamic = 'force-dynamic';

export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMember();
  const sql = db();
  const [drafts, checks] = await Promise.all([
    sql<{ n: number }[]>`select count(*)::int as n from ww.alerts where status = 'draft'`,
    sql<{ n: number }[]>`select count(*)::int as n from ww.check_requests where status = 'new'`,
  ]);
  const badge = (drafts[0]?.n ?? 0) + (checks[0]?.n ?? 0);
  return (
    <>
      <header className="top">
        <div className="wrap">
          <div className="row between">
            <Link href="/app" className="brand"><Logo /><div><div className="sub">MiCasa Stays</div><div className="name">Winter Watch</div></div></Link>
            <form action={signOut} className="row small muted"><span>{me.name || me.email}</span><button className="btn quiet" type="submit">Sign out</button></form>
          </div>
          <AppNav badges={{ '/app/alerts': badge }} />
        </div>
      </header>
      <main className="app wrap stack">{children}</main>
    </>
  );
}
