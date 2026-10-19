import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasServiceKey, supabaseAdmin } from './supabaseAdmin';
import { createHmac } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Visit photos live in a private Supabase Storage bucket. Phones upload straight to Storage with a
// one-time signed URL (so big photos never pass through our server), and pages show them with
// short-lived signed links. Without a service key (local testing) photos go to a folder on disk.

export const BUCKET = 'visit-photos';
const LOCAL_DIR = path.join(process.cwd(), '.data', 'photos');

let bucketReady = false;

export function storageMode(): 'supabase' | 'local' {
  return hasServiceKey() ? 'supabase' : 'local';
}

function client(): SupabaseClient {
  return supabaseAdmin();
}

async function ensureBucket() {
  if (bucketReady) return;
  const sb = client();
  const { data } = await sb.storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await sb.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 8 * 1024 * 1024, allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'] });
    if (error && !/already exists/i.test(error.message)) throw new Error('Could not create the photo bucket: ' + error.message);
  }
  bucketReady = true;
}

function sign(p: string): string {
  const key = process.env.CRON_SECRET || process.env.SENDBLUE_WEBHOOK_TOKEN || 'local-dev-only';
  return createHmac('sha256', key).update(p).digest('hex').slice(0, 32);
}

export function safePath(p: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9/_.-]{0,200}$/.test(p) && !p.includes('..');
}

// Where the phone should PUT the photo. The phone sends the photo as multipart form data, same as supabase-js.
export async function uploadTarget(p: string): Promise<{ url: string; mode: 'supabase' | 'local' }> {
  if (!safePath(p)) throw new Error('Bad photo path');
  if (storageMode() === 'local') return { url: `/api/field/dev-photo?path=${encodeURIComponent(p)}&sig=${sign(p)}`, mode: 'local' };
  await ensureBucket();
  const { data, error } = await client().storage.from(BUCKET).createSignedUploadUrl(p, { upsert: true });
  if (error || !data) throw new Error('Could not prepare the upload: ' + (error?.message ?? 'unknown'));
  return { url: data.signedUrl, mode: 'supabase' };
}

// Links to show photos, valid for a few hours.
export async function viewUrls(paths: string[], seconds = 6 * 3600): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!paths.length) return out;
  if (storageMode() === 'local') {
    for (const p of paths) out[p] = `/api/field/dev-photo?path=${encodeURIComponent(p)}&sig=${sign(p)}`;
    return out;
  }
  const { data } = await client().storage.from(BUCKET).createSignedUrls(paths, seconds);
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}

export async function photoExists(p: string): Promise<boolean> {
  if (storageMode() === 'local') {
    try { await readFile(path.join(LOCAL_DIR, p)); return true; } catch { return false; }
  }
  const dir = p.split('/').slice(0, -1).join('/');
  const name = p.split('/').pop()!;
  const { data } = await client().storage.from(BUCKET).list(dir, { search: name, limit: 5 });
  return Boolean(data?.some((f) => f.name === name));
}

// Local testing only: store and serve photos from disk, guarded by a signature.
export function localSignatureOk(p: string, sig: string | null): boolean {
  return storageMode() === 'local' && safePath(p) && sig === sign(p);
}
export async function localWrite(p: string, bytes: Uint8Array) {
  const full = path.join(LOCAL_DIR, p);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, bytes);
}
export async function localRead(p: string): Promise<Buffer> {
  return readFile(path.join(LOCAL_DIR, p));
}
