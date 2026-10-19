import { db } from '@/lib/db';
import { uploadTarget } from '@/lib/storage';
import { ensureVisitRow } from '@/lib/visits';
import { fieldMember, UUID_RE } from '../_auth';
import type { VisitKind } from '@/lib/checklist';

export const dynamic = 'force-dynamic';

// The phone asks where to send one photo. Photos go straight to storage, not through this server.
export async function POST(req: Request) {
  const me = await fieldMember();
  if (me instanceof Response) return me;
  const b = (await req.json().catch(() => ({}))) as { visitId?: string; photoId?: string; code?: string; kind?: VisitKind };
  if (!b.visitId || !b.photoId || !UUID_RE.test(b.visitId) || !UUID_RE.test(b.photoId) || !b.code) return Response.json({ error: 'bad request' }, { status: 400 });
  try {
    await ensureVisitRow(b.visitId, b.code, b.kind ?? 'extra', me.email);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'bad visit' }, { status: 400 });
  }
  const [v] = await db()`select code from ww.visits where id = ${b.visitId}`;
  const path = `${v.code}/${b.visitId}/${b.photoId}.jpg`;
  const t = await uploadTarget(path);
  return Response.json({ ...t, path });
}
