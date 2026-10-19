import 'server-only';
import { currentMember, type Member } from '@/lib/auth';

// Field API calls answer 401 (not a redirect) so the phone can keep its unsent work and ask the tech to sign in.
export async function fieldMember(): Promise<Member | Response> {
  const m = await currentMember();
  if (!m) return Response.json({ error: 'signin' }, { status: 401 });
  return m;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
