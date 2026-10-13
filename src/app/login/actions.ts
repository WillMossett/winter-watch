'use server';
import { redirect } from 'next/navigation';
import { isAllowedEmail, supabaseServer } from '@/lib/auth';

export async function sendLoginLink(form: FormData) {
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) redirect('/login?error=' + encodeURIComponent('Enter a valid email address.'));
  // Same response whether or not the email is on the team, so the page does not reveal who is.
  if (await isAllowedEmail(email)) {
    const sb = await supabaseServer();
    const site = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: `${site}/auth/callback`, shouldCreateUser: true } });
    if (error) redirect('/login?error=' + encodeURIComponent('The sign-in email could not be sent. Try again in a minute.'));
  }
  redirect('/login?sent=1');
}

export async function signOut() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const sb = await supabaseServer();
    await sb.auth.signOut();
  }
  redirect('/login');
}
