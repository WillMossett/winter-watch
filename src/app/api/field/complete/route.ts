import { completeVisit } from '@/lib/visits';
import { fieldMember, UUID_RE } from '../_auth';
import type { Answer, VisitKind } from '@/lib/checklist';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const KINDS = ['weekly', 'storm', 'photo', 'walkthrough', 'extra'];

export async function POST(req: Request) {
  const me = await fieldMember();
  if (me instanceof Response) return me;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const visitId = String(b.visitId ?? '');
  if (!UUID_RE.test(visitId) || !b.code || !Array.isArray(b.checklist)) return Response.json({ error: 'bad request' }, { status: 400 });
  const num = (x: unknown) => (typeof x === 'number' && isFinite(x) ? x : null);
  const checklist = (b.checklist as Answer[]).slice(0, 80).map((a) => ({
    key: String(a.key).slice(0, 40), label: String(a.label).slice(0, 120), section: String(a.section).slice(0, 40), kind: a.kind === 'temp' ? 'temp' as const : 'check' as const,
    result: (['ok', 'issue', 'na'].includes(String(a.result)) ? a.result : null) as Answer['result'],
    note: a.note ? String(a.note).slice(0, 500) : '', value: num(a.value),
  }));
  try {
    const r = await completeVisit({
      visitId, code: String(b.code), kind: (KINDS.includes(String(b.kind)) ? b.kind : 'extra') as VisitKind,
      startedAt: typeof b.startedAt === 'string' ? b.startedAt : null,
      completedAt: typeof b.completedAt === 'string' ? b.completedAt : new Date().toISOString(),
      lat: num(b.lat), lng: num(b.lng), checklist, notes: String(b.notes ?? '').slice(0, 2000),
      photoIds: Array.isArray(b.photoIds) ? (b.photoIds as unknown[]).map(String).filter((x) => UUID_RE.test(x)) : [],
    }, me.email);
    return Response.json(r, { status: r.reportStatus === 'photos_missing' ? 409 : 200 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 400 });
  }
}
