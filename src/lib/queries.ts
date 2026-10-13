import 'server-only';
import { db } from './db';

export type Household = {
  code: string; owner: string; owner2: string | null; first_name: string | null;
  prop_address: string | null; prop_city: string | null; prop_state: string | null; prop_zip: string | null;
  mail_address: string | null; mail_city: string | null; mail_state: string | null; mail_zip: string | null;
  apn: string | null; owner_type: string | null; prop_type: string | null; beds: string | null; baths: string | null;
  sqft: string | null; year_built: string | null; est_value: string | null; last_sale: string | null; source: string | null;
  excluded: boolean; exclude_reason: string | null; manual: boolean; created_at: string;
};
export type Lead = {
  code: string; stage: string; tier: string | null; annual_value: number; follow_up: string | null; assignee: string | null;
  first_response_at: string; first_response_type: string; first_mailing_id: string | null; reached: Record<string, string>;
  updated_at: string;
};
export type Mailing = {
  id: string; name: string; kind: string; planned_date: string | null; sent_date: string | null; status: string;
  cost_per_piece: number; extra_cost: number; audience: string | null; towns: string[] | null; created_at: string;
  pieces: number; cost: number; responses: number; subs: number; walkthroughs: number; clients: number; client_value: number;
};

export async function dashboard() {
  const sql = db();
  const [h] = await sql<{ households: number; mailable: number }[]>`
    select count(*)::int as households,
      count(*) filter (where not h.excluded and coalesce(l.stage,'') not in ('client','lost'))::int as mailable
    from ww.households h left join ww.leads l on l.code = h.code`;
  const [m] = await sql<{ pieces: number; spend: number; reached: number }[]>`
    select coalesce(count(r.code),0)::int as pieces,
      coalesce((select sum(m2.extra_cost) from ww.mailings m2 where m2.status='sent'),0) + coalesce(sum(m.cost_per_piece),0) as spend,
      count(distinct r.code)::int as reached
    from ww.mailings m join ww.mailing_recipients r on r.mailing_id = m.id where m.status = 'sent'`;
  const [l] = await sql<{ total: number; mail: number; walk: number; mail_walk: number; clients: number; mail_clients: number; value: number; mail_value: number }[]>`
    select count(*)::int as total,
      count(*) filter (where first_mailing_id is not null)::int as mail,
      count(*) filter (where reached ? 'walkthrough' or reached ? 'client')::int as walk,
      count(*) filter (where first_mailing_id is not null and (reached ? 'walkthrough' or reached ? 'client'))::int as mail_walk,
      count(*) filter (where stage='client')::int as clients,
      count(*) filter (where stage='client' and first_mailing_id is not null)::int as mail_clients,
      coalesce(sum(annual_value) filter (where stage='client'),0) as value,
      coalesce(sum(annual_value) filter (where stage='client' and first_mailing_id is not null),0) as mail_value
    from ww.leads`;
  const [s] = await sql<{ subs: number; phones: number }[]>`select count(*) filter (where status='active')::int as subs, count(*)::int as phones from ww.subscribers`;
  const [scan] = await sql<{ scans: number }[]>`select count(distinct code)::int as scans from ww.events where type='scan'`;
  return { ...h, ...m, ...l, subs: s.subs, scans: scan.scans };
}

export async function mailingsWithStats(): Promise<Mailing[]> {
  return db()<Mailing[]>`
    select m.*,
      (select count(*)::int from ww.mailing_recipients r where r.mailing_id = m.id) as pieces,
      (select count(*)::int from ww.mailing_recipients r where r.mailing_id = m.id) * m.cost_per_piece + m.extra_cost as cost,
      (select count(*)::int from ww.leads l where l.first_mailing_id = m.id) as responses,
      (select count(*)::int from ww.subscribers s join ww.leads l on l.code = s.code where l.first_mailing_id = m.id and s.status='active') as subs,
      (select count(*)::int from ww.leads l where l.first_mailing_id = m.id and (l.reached ? 'walkthrough' or l.reached ? 'client')) as walkthroughs,
      (select count(*)::int from ww.leads l where l.first_mailing_id = m.id and l.stage = 'client') as clients,
      (select coalesce(sum(l.annual_value),0) from ww.leads l where l.first_mailing_id = m.id and l.stage = 'client') as client_value
    from ww.mailings m order by coalesce(m.sent_date, m.planned_date, m.created_at::date) desc, m.created_at desc`;
}

export async function townStats() {
  return db()<{ town: string; households: number; mailed: number; responses: number; clients: number }[]>`
    select coalesce(nullif(h.prop_city,''),'Unknown') as town, count(*)::int as households,
      count(*) filter (where exists (select 1 from ww.mailing_recipients r join ww.mailings m on m.id=r.mailing_id where r.code=h.code and m.status='sent'))::int as mailed,
      count(l.code)::int as responses,
      count(*) filter (where l.stage='client')::int as clients
    from ww.households h left join ww.leads l on l.code = h.code
    group by 1 order by 2 desc`;
}

export async function followUpsDue(today: string) {
  return db()<{ code: string; owner: string; prop_city: string | null; stage: string; follow_up: string; assignee: string | null }[]>`
    select l.code, h.owner, h.prop_city, l.stage, l.follow_up::text as follow_up, l.assignee
    from ww.leads l join ww.households h on h.code = l.code
    where l.follow_up <= ${today}::date and l.stage not in ('client','lost') order by l.follow_up`;
}

export async function towns() {
  return db()<{ town: string; n: number }[]>`select coalesce(nullif(prop_city,''),'Unknown') as town, count(*)::int as n from ww.households group by 1 order by 2 desc`;
}

export async function searchHouseholds(opts: { q?: string; town?: string; status?: string; page: number; pageSize: number }) {
  const sql = db();
  const q = (opts.q ?? '').trim();
  const like = '%' + q.toUpperCase() + '%';
  const where = sql`
    where true
    ${q ? sql`and (h.code ilike ${like} or upper(h.owner) like ${like} or upper(coalesce(h.owner2,'')) like ${like} or upper(coalesce(h.prop_address,'')) like ${like} or upper(coalesce(h.mail_address,'')) like ${like})` : sql``}
    ${opts.town ? sql`and coalesce(nullif(h.prop_city,''),'Unknown') = ${opts.town}` : sql``}
    ${opts.status === 'mailable' ? sql`and not h.excluded and coalesce(l.stage,'') not in ('client','lost')` : sql``}
    ${opts.status === 'notmailed' ? sql`and not h.excluded and l.code is null and not exists (select 1 from ww.mailing_recipients r join ww.mailings m on m.id=r.mailing_id where r.code=h.code and m.status='sent')` : sql``}
    ${opts.status === 'lead' ? sql`and l.code is not null` : sql``}
    ${opts.status === 'excluded' ? sql`and h.excluded` : sql``}`;
  const [count] = await sql<{ n: number }[]>`select count(*)::int as n from ww.households h left join ww.leads l on l.code = h.code ${where}`;
  const rows = await sql<(Household & { stage: string | null; times_mailed: number })[]>`
    select h.*, l.stage,
      (select count(*)::int from ww.mailing_recipients r join ww.mailings m on m.id=r.mailing_id where r.code=h.code and m.status='sent') as times_mailed
    from ww.households h left join ww.leads l on l.code = h.code ${where}
    order by h.prop_city nulls last, h.prop_address nulls last
    limit ${opts.pageSize} offset ${opts.page * opts.pageSize}`;
  return { total: count.n, rows };
}

export async function householdDetail(code: string) {
  const sql = db();
  const [h] = await sql<Household[]>`select * from ww.households where code = ${code}`;
  if (!h) return null;
  const [lead] = await sql<Lead[]>`select *, follow_up::text as follow_up from ww.leads where code = ${code}`;
  const events = await sql<{ id: number; at: string; type: string; note: string | null; by_email: string | null; mailing_name: string | null }[]>`
    select e.id, e.at, e.type, e.note, e.by_email, m.name as mailing_name from ww.events e left join ww.mailings m on m.id = e.mailing_id
    where e.code = ${code} order by e.at desc limit 200`;
  const mailings = await sql<{ id: string; name: string; status: string; sent_date: string | null }[]>`
    select m.id, m.name, m.status, m.sent_date::text as sent_date from ww.mailing_recipients r join ww.mailings m on m.id = r.mailing_id
    where r.code = ${code} order by m.created_at`;
  const subs = await sql<{ id: string; phone: string; email: string | null; status: string; consent_at: string; consent_method: string }[]>`
    select id, phone, email, status, consent_at, consent_method from ww.subscribers where code = ${code}`;
  return { h, lead: lead ?? null, events, mailings, subs };
}

export async function pipeline() {
  return db()<(Lead & { owner: string; prop_city: string | null; last_type: string | null; last_at: string | null })[]>`
    select l.*, l.follow_up::text as follow_up, h.owner, h.prop_city,
      (select e.type from ww.events e where e.code = l.code order by e.at desc limit 1) as last_type,
      (select e.at from ww.events e where e.code = l.code order by e.at desc limit 1) as last_at
    from ww.leads l join ww.households h on h.code = l.code order by l.updated_at desc`;
}

export async function recentResponses(limit = 50) {
  return db()<{ at: string; type: string; note: string | null; code: string; owner: string; mailing_name: string | null }[]>`
    select e.at, e.type, e.note, e.code, h.owner, m.name as mailing_name
    from ww.events e join ww.households h on h.code = e.code left join ww.mailings m on m.id = e.mailing_id
    where e.type in ('scan','form','call','email','text','inperson','referral','check')
    order by e.at desc limit ${limit}`;
}
