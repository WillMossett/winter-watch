import { currentMember } from '@/lib/auth';
import { db, getSettings } from '@/lib/db';
import { csvResponse, toCSV } from '@/lib/csv';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentMember())) return new Response('Sign in first.', { status: 401 });
  const { id } = await params;
  const sql = db();
  const settings = await getSettings();
  const [m] = await sql<{ name: string }[]>`select name from ww.mailings where id = ${id}`;
  if (!m) return new Response('Mailing not found.', { status: 404 });
  const rows = await sql<Record<string, string | null>[]>`
    select h.code, h.owner as owner_name, coalesce(h.owner2,'') as owner_name_2, coalesce(nullif(h.first_name,''),'Neighbor') as greeting_name,
      h.mail_address, h.mail_city, h.mail_state, h.mail_zip, h.prop_address as property_address, h.prop_city as property_city
    from ww.mailing_recipients r join ww.households h on h.code = r.code
    where r.mailing_id = ${id} order by h.mail_zip, h.mail_address`;
  const site = settings.site_url.replace(/\/$/, '');
  const out = rows.map((r) => ({ ...r, qr_link: `${site}/${r.code}`, printed_web_address: `${settings.print_url}/${r.code}` }));
  const cols = ['code', 'owner_name', 'owner_name_2', 'greeting_name', 'mail_address', 'mail_city', 'mail_state', 'mail_zip', 'property_address', 'property_city', 'qr_link', 'printed_web_address'];
  return csvResponse(m.name.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase() + '-print-file.csv', toCSV(out, cols));
}
