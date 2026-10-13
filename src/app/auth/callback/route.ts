import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const site = (process.env.NEXT_PUBLIC_SITE_URL || url.origin).replace(/\/$/, '');
  if (code) {
    const sb = await supabaseServer();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${site}/app`);
  }
  return NextResponse.redirect(`${site}/login?error=${encodeURIComponent('That sign-in link has expired or was already used. Request a new one.')}`);
}
