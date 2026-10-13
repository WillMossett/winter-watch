-- Winter Watch database schema (PostgreSQL / Supabase).
-- Tables live in their own schema `ww`, which Supabase does NOT expose through its public API,
-- so the browser-facing anon key can never read them. The app reads and writes through a
-- server-side database connection only. Row-level security is enabled anyway as a second lock.

create extension if not exists pgcrypto;
create schema if not exists ww;
set search_path = ww, public;

-- One-row settings table
create table if not exists ww.settings (
  id int primary key default 1 check (id = 1),
  code_prefix text not null default 'WW',
  site_url text not null default 'https://watch.micasastays.com',
  print_url text not null default 'watch.micasastays.com',
  cost_letter numeric(8,2) not null default 0.85,
  cost_postcard numeric(8,2) not null default 0.57,
  check_price numeric(8,2) not null default 65,
  tier_values jsonb not null default '{"Essential":1668,"Standard":2268,"Premium":2868,"White Glove":5388}',
  team_alert_phone text,               -- the lead's phone: gets a text when a weather alert is drafted
  alerts_enabled boolean not null default false,  -- master switch for live texting
  updated_at timestamptz not null default now()
);
insert into ww.settings (id) values (1) on conflict do nothing;

create table if not exists ww.team_members (
  email text primary key check (email = lower(email)),
  name text,
  role text not null default 'member' check (role in ('owner','member')),
  created_at timestamptz not null default now()
);

create table if not exists ww.households (
  code text primary key,
  owner text not null,
  owner2 text,
  first_name text,
  prop_address text,
  prop_city text,
  prop_state text,
  prop_zip text,
  mail_address text,
  mail_city text,
  mail_state text,
  mail_zip text,
  apn text,
  owner_type text,
  prop_type text,
  beds text, baths text, sqft text, year_built text, est_value text, last_sale text,
  source text,
  addr_key text unique,                -- normalized property address + zip, for de-duplication
  excluded boolean not null default false,
  exclude_reason text,
  manual boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists households_city_idx on ww.households (prop_city);

-- Property addresses that must never get cold mail (current MiCasa owners, etc.)
create table if not exists ww.exclusions (
  addr_key text primary key,
  address text not null,
  reason text not null default 'MiCasa owner',
  created_at timestamptz not null default now()
);

create table if not exists ww.mailings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('letter','postcard')),
  planned_date date,
  sent_date date,
  status text not null default 'draft' check (status in ('draft','sent')),
  cost_per_piece numeric(8,2) not null default 0,
  extra_cost numeric(10,2) not null default 0,
  audience text,
  towns text[],
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists ww.mailing_recipients (
  mailing_id uuid not null references ww.mailings(id) on delete cascade,
  code text not null references ww.households(code) on delete cascade,
  primary key (mailing_id, code)
);
create index if not exists mailing_recipients_code_idx on ww.mailing_recipients (code);

create table if not exists ww.leads (
  code text primary key references ww.households(code) on delete cascade,
  stage text not null default 'responded' check (stage in ('responded','alerts','walkthrough','client','lost')),
  tier text check (tier is null or tier in ('Essential','Standard','Premium','White Glove')),
  annual_value numeric(10,2) not null default 0,
  follow_up date,
  assignee text,
  first_response_at timestamptz not null default now(),
  first_response_type text not null,
  first_mailing_id uuid references ww.mailings(id) on delete set null,
  reached jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Everything that happens to a household: scans, form submissions, calls, notes, stage changes, texts
create table if not exists ww.events (
  id bigserial primary key,
  code text references ww.households(code) on delete cascade,
  at timestamptz not null default now(),
  type text not null,      -- scan | form | call | email | text | inperson | referral | note | stage | alerts | check
  mailing_id uuid references ww.mailings(id) on delete set null,
  note text,
  by_email text,
  meta jsonb not null default '{}'
);
create index if not exists events_code_idx on ww.events (code, at desc);
create index if not exists events_at_idx on ww.events (at desc);

-- Storm alert subscribers. Consent is recorded with the exact wording they agreed to.
create table if not exists ww.subscribers (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,          -- E.164, e.g. +15865550100
  code text references ww.households(code) on delete set null,
  name text,
  email text,
  status text not null default 'active' check (status in ('active','stopped')),
  consent_at timestamptz not null,
  consent_method text not null,        -- web form | text keyword | phone call (verbal) | in person
  consent_text text,
  consent_ip text,
  stopped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ww.alerts (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  message text not null,
  status text not null default 'draft' check (status in ('draft','sending','sent','cancelled')),
  source text not null default 'manual' check (source in ('manual','nws')),
  nws_id text unique,
  nws_event text,
  nws_areas text,
  nws_ends timestamptz,
  created_at timestamptz not null default now(),
  approved_by text,
  sent_at timestamptz,
  recipients int not null default 0,
  delivered int not null default 0,
  failed int not null default 0
);

create table if not exists ww.alert_deliveries (
  alert_id uuid not null references ww.alerts(id) on delete cascade,
  subscriber_id uuid not null references ww.subscribers(id) on delete cascade,
  phone text not null,
  status text not null default 'queued',
  provider_id text,
  error text,
  sent_at timestamptz,
  primary key (alert_id, subscriber_id)
);

create table if not exists ww.inbound_messages (
  id bigserial primary key,
  phone text not null,
  content text,
  received_at timestamptz not null default now(),
  provider_id text unique,
  handled_as text,
  raw jsonb
);

-- Paid one-off storm checks requested by replying CHECK
create table if not exists ww.check_requests (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid references ww.subscribers(id) on delete set null,
  code text references ww.households(code) on delete set null,
  phone text not null,
  alert_id uuid references ww.alerts(id) on delete set null,
  status text not null default 'new' check (status in ('new','scheduled','done','cancelled')),
  note text,
  requested_at timestamptz not null default now()
);

-- Simple rate limiting for the public page
create table if not exists ww.rate_hits (
  key text not null,
  at timestamptz not null default now()
);
create index if not exists rate_hits_key_idx on ww.rate_hits (key, at desc);

-- Second lock: RLS on, no policies, so no API role can touch these tables.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'ww' loop
    execute format('alter table ww.%I enable row level security', t);
  end loop;
end $$;
revoke all on schema ww from public;
