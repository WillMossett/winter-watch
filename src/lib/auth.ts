import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from './db';

export type Member = { email: string; name: string | null; role: 'owner' | 'member' | 'tech' };

export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() { return store.getAll(); },
      setAll(list) {
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* called from a server component */ }
      },
    },
  });
}

// Emails in OWNER_EMAILS are always allowed in and become owners on first sign-in.
function ownerEmails(): string[] {
  return String(process.env.OWNER_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export async function isAllowedEmail(email: string): Promise<boolean> {
  const e = email.trim().toLowerCase();
  if (ownerEmails().includes(e)) return true;
  const rows = await db()`select 1 from ww.team_members where email = ${e}`;
  return rows.length > 0;
}

export async function currentMember(): Promise<Member | null> {
  let email: string | null = null;
  if (process.env.DEV_LOGIN_EMAIL && process.env.NODE_ENV !== 'production') {
    email = process.env.DEV_LOGIN_EMAIL.toLowerCase();
  } else {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
    const sb = await supabaseServer();
    const { data } = await sb.auth.getUser();
    email = data.user?.email?.toLowerCase() ?? null;
  }
  if (!email) return null;
  const sql = db();
  if (ownerEmails().includes(email)) {
    await sql`insert into ww.team_members (email, role) values (${email}, 'owner') on conflict (email) do update set role = 'owner'`;
  }
  const rows = await sql<Member[]>`select email, name, role from ww.team_members where email = ${email}`;
  return rows[0] ?? null;
}

// Office pages: owners and members. Techs only use the field app.
export async function requireMember(): Promise<Member> {
  const m = await currentMember();
  if (!m) redirect('/login');
  if (m.role === 'tech') redirect('/field');
  return m;
}

export async function requireOwner(): Promise<Member> {
  const m = await requireMember();
  if (m.role !== 'owner') throw new Error('Only an owner can do that.');
  return m;
}
