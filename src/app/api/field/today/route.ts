import { fieldData } from '@/lib/visits';
import { fieldMember } from '../_auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const me = await fieldMember();
  if (me instanceof Response) return me;
  const data = await fieldData(me.email);
  return Response.json({ me: { email: me.email, name: me.name, role: me.role }, ...data, fetchedAt: new Date().toISOString() }, { headers: { 'cache-control': 'no-store' } });
}
