-- Winter Watch: techs sign in to the field app with a code texted to their mobile.
-- Run once in Supabase → SQL Editor. Safe to run again.
alter table ww.team_members add column if not exists code_sent_at timestamptz;
create unique index if not exists team_members_phone on ww.team_members (phone) where phone is not null;
