import { db } from '@/lib/db';
import { photoExists } from '@/lib/storage';
import { registerPhoto } from '@/lib/visits';
import { fieldMember, UUID_RE } from '../_auth';

export const dynamic = 'force-dynamic';

// After the upload, the phone records the photo against the visit. Retrying is harmless.
export async function POST(req: Request) {
  const me = await fieldMember();
  if (me instanceof Response) return me;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const visitId = String(b.visitId ?? ''), id = String(b.photoId ?? ''), path = String(b.path ?? '');
  if (!UUID_RE.test(visitId) || !UUID_RE.test(id)) return Response.json({ error: 'bad request' }, { status: 400 });
  const [v] = await db()`select code from ww.visits where id = ${visitId}`;
  if (!v || path !== `${v.code}/${visitId}/${id}.jpg`) return Response.json({ error: 'bad path' }, { status: 400 });
  if (!(await photoExists(path))) return Response.json({ error: 'not uploaded' }, { status: 409 });
  const num = (x: unknown) => (typeof x === 'number' && isFinite(x) ? Math.round(x) : null);
  await registerPhoto({
    id, visitId, path,
    label: b.label ? String(b.label).slice(0, 120) : null,
    itemKey: b.itemKey ? String(b.itemKey).slice(0, 40) : null,
    takenAt: typeof b.takenAt === 'string' ? b.takenAt : null,
    width: num(b.width), height: num(b.height), bytes: num(b.bytes),
  });
  return Response.json({ ok: true });
}
