'use client';
// On-phone storage for the field app. Everything a tech does is written here first, so a visit
// done with no signal is never lost; sync() uploads it when the phone is back online.
import type { Answer, VisitKind } from '@/lib/checklist';

export type DraftState = 'draft' | 'queued' | 'synced' | 'error';

export type Draft = {
  id: string; code: string; kind: VisitKind; address: string; city: string; owner: string;
  extraItems: string[];
  startedAt: string | null; completedAt: string | null; lat: number | null; lng: number | null;
  answers: Answer[]; notes: string; photoIds: string[];
  state: DraftState; report?: string; error?: string; updatedAt: string;
};

export type Photo = {
  id: string; visitId: string; code: string; kind: VisitKind; label: string; itemKey: string | null;
  takenAt: string; width: number; height: number; bytes: number;
  blob: Blob | null; thumb: string; uploaded: boolean; registered: boolean; path?: string;
};

const DB_NAME = 'ww-field';
let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
      if (!d.objectStoreNames.contains('drafts')) d.createObjectStore('drafts', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('photos')) {
        const s = d.createObjectStore('photos', { keyPath: 'id' });
        s.createIndex('visitId', 'visitId');
      }
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => { dbp = null; reject(r.error); };
  });
  return dbp;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}

async function store(name: string, mode: IDBTransactionMode = 'readonly') {
  return (await open()).transaction(name, mode).objectStore(name);
}

export async function kvGet<T>(key: string): Promise<T | undefined> { return req((await store('kv')).get(key)) as Promise<T | undefined>; }
export async function kvSet(key: string, value: unknown) { await req((await store('kv', 'readwrite')).put(value, key)); }

export async function getDraft(id: string): Promise<Draft | undefined> { return req((await store('drafts')).get(id)) as Promise<Draft | undefined>; }
export async function allDrafts(): Promise<Draft[]> { return req((await store('drafts')).getAll()) as Promise<Draft[]>; }
export async function putDraft(d: Draft) { await req((await store('drafts', 'readwrite')).put({ ...d, updatedAt: new Date().toISOString() })); }
export async function deleteDraft(id: string) { await req((await store('drafts', 'readwrite')).delete(id)); }

export async function putPhoto(p: Photo) { await req((await store('photos', 'readwrite')).put(p)); }
export async function getPhoto(id: string): Promise<Photo | undefined> { return req((await store('photos')).get(id)) as Promise<Photo | undefined>; }
export async function photosFor(visitId: string): Promise<Photo[]> {
  const s = await store('photos');
  return req(s.index('visitId').getAll(visitId)) as Promise<Photo[]>;
}
export async function deletePhoto(id: string) { await req((await store('photos', 'readwrite')).delete(id)); }

export function uuid(): string {
  const c = globalThis.crypto as Crypto & { randomUUID?: () => string };
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Shrinks a camera photo (often 4–8 MB) to about 1600 px, roughly 250–400 KB, plus a small thumbnail.
export async function compressPhoto(file: File): Promise<{ blob: Blob; thumb: string; width: number; height: number }> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  const blob: Blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not save the photo'))), 'image/jpeg', 0.72));
  const ts = Math.min(1, 240 / Math.max(w, h));
  const t = document.createElement('canvas');
  t.width = Math.round(w * ts); t.height = Math.round(h * ts);
  t.getContext('2d')!.drawImage(c, 0, 0, t.width, t.height);
  const thumb = t.toDataURL('image/jpeg', 0.6);
  bmp.close?.();
  return { blob, thumb, width: w, height: h };
}

export function getPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: Math.round(p.coords.latitude * 1e5) / 1e5, lng: Math.round(p.coords.longitude * 1e5) / 1e5 }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 120000 },
    );
  });
}

export class SignInNeeded extends Error {}

async function api(path: string, body: unknown) {
  const r = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (r.status === 401) throw new SignInNeeded('Sign in again to send your visits.');
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, body: j as Record<string, unknown> };
}

let syncing: Promise<SyncResult> | null = null;
export type SyncResult = { sent: number; waiting: number; failed: number; signIn: boolean; offline: boolean };

// Upload every finished visit: photos first (one at a time, so a weak signal still makes progress), then the visit.
export function sync(onChange?: () => void): Promise<SyncResult> {
  if (syncing) return syncing;
  syncing = (async () => {
    const out: SyncResult = { sent: 0, waiting: 0, failed: 0, signIn: false, offline: !navigator.onLine };
    const queued = (await allDrafts()).filter((d) => d.state === 'queued' || d.state === 'error');
    if (!navigator.onLine) { out.waiting = queued.length; return out; }
    for (const d of queued) {
      try {
        for (const pid of d.photoIds) {
          const p = await getPhoto(pid);
          if (!p || p.registered) continue;
          if (!p.uploaded) {
            if (!p.blob) throw new Error('A photo is missing from this phone. Retake it.');
            const t = await api('/api/field/upload', { visitId: d.id, photoId: p.id, code: d.code, kind: d.kind });
            if (!t.ok) throw new Error(String(t.body.error ?? 'Could not start the photo upload'));
            const form = new FormData();
            form.append('cacheControl', '3600');
            form.append('', p.blob, `${p.id}.jpg`);
            const put = await fetch(String(t.body.url), { method: 'PUT', body: form, headers: { 'x-upsert': 'true' } });
            if (!put.ok) throw new Error('A photo upload failed. It will retry.');
            p.uploaded = true; p.path = String(t.body.path);
            await putPhoto(p);
          }
          const reg = await api('/api/field/photo', { visitId: d.id, photoId: p.id, path: p.path, label: p.label, itemKey: p.itemKey, takenAt: p.takenAt, width: p.width, height: p.height, bytes: p.bytes });
          if (!reg.ok) throw new Error(String(reg.body.error ?? 'Could not save a photo'));
          p.registered = true; p.blob = null; // keep the thumbnail, free the space
          await putPhoto(p);
          onChange?.();
        }
        const done = await api('/api/field/complete', {
          visitId: d.id, code: d.code, kind: d.kind, startedAt: d.startedAt, completedAt: d.completedAt,
          lat: d.lat, lng: d.lng, checklist: d.answers, notes: d.notes, photoIds: d.photoIds,
        });
        if (!done.ok) throw new Error(String(done.body.error ?? (done.status === 409 ? 'Some photos have not arrived yet. Retrying.' : 'Could not send the visit')));
        d.state = 'synced'; d.report = String(done.body.reportStatus ?? ''); d.error = undefined;
        await putDraft(d);
        out.sent++;
      } catch (e) {
        if (e instanceof SignInNeeded) { out.signIn = true; out.waiting++; break; }
        d.state = 'error'; d.error = e instanceof Error ? e.message : 'Sync failed';
        await putDraft(d);
        out.failed++;
      }
      onChange?.();
    }
    return out;
  })().finally(() => { syncing = null; });
  return syncing;
}

// Clear out visits that were sent more than 3 days ago, with their thumbnails.
export async function prune() {
  const cutoff = Date.now() - 3 * 864e5;
  for (const d of await allDrafts()) {
    if (d.state === 'synced' && new Date(d.updatedAt).getTime() < cutoff) {
      for (const pid of d.photoIds) await deletePhoto(pid);
      await deleteDraft(d.id);
    }
  }
}
