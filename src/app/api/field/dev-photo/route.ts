import { localRead, localSignatureOk, localWrite } from '@/lib/storage';

export const dynamic = 'force-dynamic';

// Local testing only (no Supabase service key): stands in for Supabase Storage's signed upload and download links.
export async function PUT(req: Request) {
  const u = new URL(req.url);
  const p = u.searchParams.get('path') ?? '';
  if (!localSignatureOk(p, u.searchParams.get('sig'))) return new Response('Forbidden', { status: 403 });
  const form = await req.formData().catch(() => null);
  const file = form ? [...form.values()].find((v) => typeof v !== 'string') as Blob | undefined : undefined;
  if (!file) return new Response('No file', { status: 400 });
  await localWrite(p, new Uint8Array(await file.arrayBuffer()));
  return Response.json({ Key: p });
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const p = u.searchParams.get('path') ?? '';
  if (!localSignatureOk(p, u.searchParams.get('sig'))) return new Response('Forbidden', { status: 403 });
  try {
    return new Response(new Uint8Array(await localRead(p)), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=3600' } });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
