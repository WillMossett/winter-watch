import postgres from 'postgres';

// One shared connection pool per server instance. All tables are schema-qualified (ww.*),
// so this works through Supabase's transaction pooler without relying on search_path.
const g = globalThis as unknown as { __wwSql?: postgres.Sql };

export function db(): postgres.Sql {
  if (!g.__wwSql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    g.__wwSql = postgres(url, {
      prepare: false,          // required for Supabase's transaction pooler
      max: 5,
      idle_timeout: 20,
      connect_timeout: 15,
      types: { numeric: { to: 1700, from: [1700], serialize: (x: unknown) => String(x), parse: (x: string) => Number(x) } },
    });
  }
  return g.__wwSql;
}

export type Settings = {
  code_prefix: string;
  site_url: string;
  print_url: string;
  cost_letter: number;
  cost_postcard: number;
  check_price: number;
  tier_values: Record<string, number>;
  team_alert_phone: string | null;
  alerts_enabled: boolean;
};

export async function getSettings(): Promise<Settings> {
  const sql = db();
  const rows = await sql<Settings[]>`select * from ww.settings where id = 1`;
  if (!rows[0]) {
    await sql`insert into ww.settings (id) values (1) on conflict do nothing`;
    return getSettings();
  }
  return rows[0];
}
