import 'server-only';
import { db } from './db';
import { viewUrls } from './storage';
import type { Answer, VisitKind } from './checklist';

export type ReportVisit = {
  id: string; code: string; kind: VisitKind; due_date: string; status: string; tech_email: string | null;
  started_at: string | null; completed_at: string | null; completed_by: string | null; lat: number | null; lng: number | null;
  checklist: Answer[] | null; notes: string | null; has_issue: boolean; report_token: string | null; report_status: string;
  report_note: string | null; report_sent_at: string | null; report_error: string | null; approved_by: string | null;
  send_to: string | null; source: string | null; address: string; city: string; owner: string; first_name: string | null;
  owner_phone: string | null;
};
export type ReportPhoto = { id: string; path: string; label: string | null; item_key: string | null; taken_at: string | null; url: string };

const SELECT = (sql: ReturnType<typeof db>) => sql`
  select v.id, v.code, v.kind, v.due_date::text, v.status, v.tech_email, v.started_at, v.completed_at, v.completed_by, v.lat, v.lng,
    v.checklist, v.notes, v.has_issue, v.report_token, v.report_status, v.report_note, v.report_sent_at, v.report_error, v.approved_by,
    v.send_to, v.source, coalesce(h.prop_address,'') as address, coalesce(h.prop_city,'') as city, coalesce(h.owner,'') as owner,
    h.first_name, p.owner_phone
  from ww.visits v join ww.households h on h.code = v.code left join ww.service_plans p on p.code = v.code`;

async function withPhotos(v: ReportVisit | undefined) {
  if (!v) return null;
  const rows = await db()<Omit<ReportPhoto, 'url'>[]>`select id, path, label, item_key, taken_at from ww.visit_photos where visit_id = ${v.id} order by taken_at nulls last, id`;
  const urls = await viewUrls(rows.map((r) => r.path));
  const photos: ReportPhoto[] = rows.map((r) => ({ ...r, url: urls[r.path] ?? '' })).filter((p) => p.url);
  return { v, photos };
}

export async function visitById(id: string) {
  const sql = db();
  const [v] = await sql<ReportVisit[]>`${SELECT(sql)} where v.id = ${id}`;
  return withPhotos(v);
}

export async function visitByToken(token: string) {
  const sql = db();
  const [v] = await sql<ReportVisit[]>`${SELECT(sql)} where v.report_token = ${token} and v.status = 'done'`;
  return withPhotos(v);
}
