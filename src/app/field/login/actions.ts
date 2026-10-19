'use server';
import { isAllowedEmail, supabaseServer } from '@/lib/auth';

// Techs sign in with a 6-digit code typed into the app. (A sign-in link would open in Safari,
// not in the installed home-screen app, which keeps its own separate sign-in on iPhone.)
export async function sendCode(email: string): Promise<{ ok: boolean; error?: string }> {
  const e = String(email ?? '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return { ok: false, error: 'Enter a valid email address.' };
  // Same answer whether or not the email is on the team, so this page does not reveal who is.
  if (await isAllowedEmail(e)) {
    const sb = await supabaseServer();
    const { error } = await sb.auth.signInWithOtp({ email: e, options: { shouldCreateUser: true } });
    if (error) return { ok: false, error: 'The code could not be sent. Wait a minute and try again.' };
  }
  return { ok: true };
}

export async function verifyCode(email: string, code: string): Promise<{ ok: boolean; error?: string }> {
  const e = String(email ?? '').trim().toLowerCase();
  const c = String(code ?? '').replace(/\D/g, '');
  if (c.length < 6) return { ok: false, error: 'Enter the code from the email.' };
  if (!(await isAllowedEmail(e))) return { ok: false, error: 'That code did not work. Request a new one.' };
  const sb = await supabaseServer();
  const { error } = await sb.auth.verifyOtp({ email: e, token: c, type: 'email' });
  if (error) return { ok: false, error: 'That code did not work. Request a new one.' };
  return { ok: true };
}
