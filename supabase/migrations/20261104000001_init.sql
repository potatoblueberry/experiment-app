-- N1 Lab: initial schema. Mirrors src/domain/types.ts one-to-one.
-- Applied with `npx supabase db push` (see CLAUDE.md). Later changes go in new migration files.
-- Conventions: snake_case, every user-owned table has user_id + row-level security.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type metric_id as enum (
  'sleep_duration', 'sleep_efficiency', 'hrv', 'resting_hr', 'readiness', 'steps', 'temp_deviation'
);
create type data_source_provider as enum ('oura', 'manual');
create type reading_flag as enum ('illness', 'travel', 'alcohol', 'outlier');
create type design_type as enum ('AB', 'ABA');
create type experiment_status as enum ('active', 'completed', 'abandoned');
create type adherence_type as enum ('daily_boolean');
create type phase_type as enum ('baseline', 'intervention', 'washout');
create type expected_direction as enum ('increase', 'decrease', 'any');
create type connection_status as enum ('connected', 'disconnected', 'error');

-- ---------------------------------------------------------------------------
-- Reference data (same for everyone, readable by all authenticated users)
-- ---------------------------------------------------------------------------
create table metric_definitions (
  id metric_id primary key,
  name text not null,
  short_name text not null,
  unit text not null default '',
  decimals smallint not null default 0,
  higher_is_better boolean,            -- null = neutral
  description text not null default ''
);

insert into metric_definitions (id, name, short_name, unit, decimals, higher_is_better, description) values
  ('sleep_duration',   'Sleep duration',             'Sleep',      'h',     1, true,  'Total time asleep for the night ending on this day.'),
  ('sleep_efficiency', 'Sleep efficiency',           'Efficiency', '%',     0, true,  'Share of time in bed actually spent asleep.'),
  ('hrv',              'Heart rate variability',     'HRV',        'ms',    0, true,  'Average overnight HRV (rMSSD).'),
  ('resting_hr',       'Resting heart rate',         'Resting HR', 'bpm',   0, false, 'Lowest sustained heart rate during the night.'),
  ('readiness',        'Readiness score',            'Readiness',  '',      0, true,  'Oura combined recovery score 0–100.'),
  ('steps',            'Steps',                      'Steps',      'steps', 0, true,  'Daily step count.'),
  ('temp_deviation',   'Body temperature deviation', 'Temp dev.',  '°C',    2, null,  'Skin temperature vs. personal norm.');

-- ---------------------------------------------------------------------------
-- User data
-- ---------------------------------------------------------------------------
create table data_source_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider data_source_provider not null,
  status connection_status not null default 'disconnected',
  last_sync_at timestamptz,
  -- OAuth tokens live in a separate, service-role-only table (see 0002), never here.
  created_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table metric_readings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  metric_id metric_id not null references metric_definitions (id),
  date date not null,
  value double precision not null,
  source data_source_provider not null,
  flags reading_flag[] not null default '{}',
  synced_at timestamptz not null default now(),
  unique (user_id, metric_id, date)
);
create index metric_readings_user_metric_date on metric_readings (user_id, metric_id, date);

create table experiments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  behavior_change text not null,
  behavior_preset_id text,
  adherence_type adherence_type not null default 'daily_boolean',
  design_type design_type not null default 'AB',
  status experiment_status not null default 'active',
  start_date date not null,            -- first intervention day
  end_date date not null,              -- last day of the final phase
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index experiments_user_status on experiments (user_id, status);

create table experiment_phases (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references experiments (id) on delete cascade,
  type phase_type not null,
  "order" smallint not null,
  start_date date not null,
  end_date date not null,
  unique (experiment_id, "order"),
  check (end_date >= start_date)
);

create table experiment_outcome_metrics (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references experiments (id) on delete cascade,
  metric_id metric_id not null references metric_definitions (id),
  is_primary boolean not null default false,
  expected_direction expected_direction not null default 'any',
  unique (experiment_id, metric_id)
);
-- at most one primary per experiment
create unique index experiment_outcome_metrics_one_primary on experiment_outcome_metrics (experiment_id) where is_primary;

create table adherence_logs (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references experiments (id) on delete cascade,
  date date not null,
  adhered boolean not null,
  note text,
  logged_at timestamptz not null default now(),
  unique (experiment_id, date)
);

-- ---------------------------------------------------------------------------
-- Row-level security: users see only their own rows. Child tables resolve
-- ownership through experiments.user_id.
-- ---------------------------------------------------------------------------
alter table metric_definitions enable row level security;
create policy "metric definitions are readable" on metric_definitions for select to authenticated using (true);

alter table data_source_connections enable row level security;
create policy "own connections" on data_source_connections for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table metric_readings enable row level security;
create policy "own readings" on metric_readings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table experiments enable row level security;
create policy "own experiments" on experiments for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function owns_experiment(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from experiments e where e.id = eid and e.user_id = auth.uid());
$$;

alter table experiment_phases enable row level security;
create policy "own phases" on experiment_phases for all to authenticated
  using (owns_experiment(experiment_id)) with check (owns_experiment(experiment_id));

alter table experiment_outcome_metrics enable row level security;
create policy "own outcome metrics" on experiment_outcome_metrics for all to authenticated
  using (owns_experiment(experiment_id)) with check (owns_experiment(experiment_id));

alter table adherence_logs enable row level security;
create policy "own adherence" on adherence_logs for all to authenticated
  using (owns_experiment(experiment_id)) with check (owns_experiment(experiment_id));

-- updated_at maintenance
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger experiments_updated_at before update on experiments
  for each row execute function set_updated_at();
