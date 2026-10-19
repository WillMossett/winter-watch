-- Winter Watch: field visits, photo reports and techs.
-- Run once in Supabase → SQL Editor. Safe to run again.

set search_path = ww, public;

-- Techs sign in to the field app only. Owners and members use the office app.
alter table ww.team_members drop constraint if exists team_members_role_check;
alter table ww.team_members add constraint team_members_role_check check (role in ('owner','member','tech'));
alter table ww.team_members add column if not exists phone text;

-- One service plan per client home. Weekly or every-other-week visits between start and end.
create table if not exists ww.service_plans (
  code text primary key references ww.households(code) on delete cascade,
  tier text not null default 'Standard',
  interval_days int not null default 7 check (interval_days in (7, 14)),
  start_date date not null default current_date,
  end_date date,
  active boolean not null default true,
  owner_phone text,                -- where reports are texted (E.164)
  owner_email text,
  tech_email text references ww.team_members(email) on delete set null,
  access_notes text,               -- lockbox, alarm, where the shutoff is
  extra_items jsonb not null default '[]'::jsonb,  -- extra checklist lines for this home
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Every trip to a house: weekly visits, storm checks, free photos for new leads, walkthroughs.
create table if not exists ww.visits (
  id uuid primary key default gen_random_uuid(),
  code text not null references ww.households(code) on delete cascade,
  kind text not null default 'weekly' check (kind in ('weekly','storm','photo','walkthrough','extra')),
  due_date date not null default current_date,
  tech_email text references ww.team_members(email) on delete set null,
  status text not null default 'scheduled' check (status in ('scheduled','done','missed','cancelled')),
  send_to text,                    -- phone the report goes to; defaults to the plan's owner phone
  started_at timestamptz,
  completed_at timestamptz,
  completed_by text,
  lat double precision,
  lng double precision,
  checklist jsonb not null default '[]'::jsonb,   -- [{key,label,section,result:'ok'|'issue'|'na',note,value}]
  notes text,
  has_issue boolean not null default false,
  report_token text unique,
  report_status text not null default 'none' check (report_status in ('none','waiting','approved','sent','failed','held','no_phone')),
  report_note text,                -- what the manager adds before an issue report goes out
  report_sent_at timestamptz,
  report_error text,
  approved_by text,
  source text,                     -- 'plan', 'text', 'form', 'check', 'manual', 'field'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists visits_plan_day on ww.visits (code, due_date) where kind = 'weekly';
create index if not exists visits_due on ww.visits (status, due_date);
create index if not exists visits_code on ww.visits (code, due_date desc);

create table if not exists ww.visit_photos (
  id uuid primary key,             -- made on the phone, so a retried upload is never stored twice
  visit_id uuid not null references ww.visits(id) on delete cascade,
  path text not null,              -- storage path
  label text,                      -- 'Front of house', 'Thermostat', or the tech's caption
  item_key text,
  taken_at timestamptz,
  width int,
  height int,
  bytes int,
  created_at timestamptz not null default now()
);
create index if not exists visit_photos_visit on ww.visit_photos (visit_id, taken_at);

do $$
declare t text;
begin
  foreach t in array array['service_plans','visits','visit_photos'] loop
    execute format('alter table ww.%I enable row level security', t);
  end loop;
  -- Supabase's browser roles never touch these tables; only the server's own connection does.
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema ww from anon, authenticated';
  end if;
end $$;
