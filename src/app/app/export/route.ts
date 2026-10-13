import { currentMember } from '@/lib/auth';
import { db } from '@/lib/db';
import { csvResponse, toCSV } from '@/lib/csv';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await currentMember())) return new Response('Sign in first.', { status: 401 });
  const rows = await db()<Record<string, unknown>[]>`
    select h.code, h.owner, h.owner2, h.first_name, h.prop_address, h.prop_city, h.prop_state, h.prop_zip,
      h.mail_address, h.mail_city, h.mail_state, h.mail_zip, h.apn, h.prop_type, h.est_value,
      case when h.excluded then 'yes' else '' end as excluded, h.exclude_reason,
      (select count(*) from ww.mailing_recipients r join ww.mailings m on m.id=r.mailing_id where r.code=h.code and m.status='sent') as times_mailed,
      l.stage, l.tier as plan, l.annual_value, l.first_response_at::date as first_response, l.first_response_type,
      (select name from ww.mailings where id = l.first_mailing_id) as first_mailing, l.follow_up,
      (select string_agg(s.phone, ' ') from ww.subscribers s where s.code = h.code and s.status='active') as alert_phones,
      h.source
    from ww.households h left join ww.leads l on l.code = h.code order by h.prop_city, h.prop_address`;
  const cols = rows.length ? Object.keys(rows[0]) : ['code'];
  return csvResponse(`winter-watch-export-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(rows, cols));
}
