'use server';
import { supabaseServer } from '@/lib/auth';
import { db } from '@/lib/db';
import { sendText } from '@/lib/sendblue';
import { hasServiceKey, supabaseAdmin } from '@/lib/supabaseAdmin';
import { toE164 } from '@/lib/text';

// Techs sign in with a 6-digit code texted to the mobile number on their team profile.
// (A sign-in link would open in Safari, not in the installed home-screen app, which keeps
// its own separate sign-in on iPhone.) The code is a Supabase one-time password made with
// the service key, so the session is a normal Supabase sign-in.

type R = { ok: boolean; error?: string };
const SAME = 'If that number is on the Winter Watch team, a code is on its way.';

async function techFor(raw: string) {
  const phone = toE164(raw);
  if (!phone) return null;
  const [m] = await db()<{ email: string; phone: string; code_sent_at: Date | null }[]>`
    select email, phone, code_sent_at from ww.team_members where phone = ${phone}`;
  return m ?? null;
}

export async function sendCode(rawPhone: string): Promise<R & { note?: string }> {
  if (!toE164(rawPhone)) return { ok: false, error: 'Enter your 10-digit mobile number.' };
  if (!hasServiceKey()) return { ok: false, error: 'Sign-in is not set up yet. Ask Will.' };
  const m = await techFor(rawPhone);
  // Same answer whether or not the number is on the team, so this page does not reveal who is.
  if (!m) return { ok: true, note: SAME };
  if (m.code_sent_at && Date.now() - new Date(m.code_sent_at).getTime() < 45_000) return { ok: true, note: 'A code was just sent. Give it a minute.' };
  await db()`update ww.team_members set code_sent_at = now() where email = ${m.email}`;

  const admin = supabaseAdmin();
  let link = await admin.auth.admin.generateLink({ type: 'magiclink', email: m.email });
  if (link.error && /not.*found|no user/i.test(link.error.message)) {
    await admin.auth.admin.createUser({ email: m.email, email_confirm: true });
    link = await admin.auth.admin.generateLink({ type: 'magiclink', email: m.email });
  }
  const otp = link.data?.properties?.email_otp;
  if (link.error || !otp) return { ok: false, error: 'The code could not be made. Try again in a minute.' };

  const r = await sendText(m.phone, `${otp} is your MiCasa Winter Watch sign-in code. It expires in an hour.`, undefined, { preReplyOverride: true });
  if (!r.ok) return { ok: false, error: 'The text did not go through. Text anything to the Winter Watch number once, then try again.' };
  return { ok: true, note: SAME };
}

export async function verifyCode(rawPhone: string, code: string): Promise<R> {
  const c = String(code ?? '').replace(/\D/g, '');
  if (c.length !== 6) return { ok: false, error: 'Enter the 6-digit code from the text.' };
  const m = await techFor(rawPhone);
  if (!m) return { ok: false, error: 'That code did not work. Request a new one.' };
  const sb = await supabaseServer();
  const { error } = await sb.auth.verifyOtp({ email: m.email, token: c, type: 'email' });
  if (error) return { ok: false, error: 'That code did not work. Request a new one.' };
  return { ok: true };
}
