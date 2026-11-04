-- Reference rows for the new metrics (mirrors src/domain/metrics.ts).
insert into metric_definitions (id, name, short_name, unit, decimals, higher_is_better, description) values
  ('sleep_latency',    'Sleep latency',              'Latency',   'min',  0, false, 'Minutes from going to bed to falling asleep.'),
  ('awake_time',       'Time awake at night',        'Awake',     'min',  0, false, 'Minutes awake during the night after first falling asleep.'),
  ('sleep_hr',         'Average sleep heart rate',   'Sleep HR',  'bpm',  0, false, 'Average heart rate across the whole night.'),
  ('respiratory_rate', 'Respiratory rate',           'Breaths',   '/min', 1, null,  'Average breaths per minute during sleep.'),
  ('bedtime',          'Bedtime',                    'Bedtime',   'h',    2, null,  'Hours past midnight of the previous day (23.5 = 23:30, 25 = 01:00).'),
  ('daytime_stress',   'Daytime stress',             'Stress',    'min',  0, false, 'Minutes Oura classified as high stress during the day.'),
  ('active_calories',  'Active calories',            'Activity',  'kcal', 0, null,  'Energy spent on activity; a proxy for training load.'),
  ('tz_offset',        'Time zone offset',           'Time zone', 'h',    1, null,  'UTC offset of the night; changes mark travel. Hidden in the app.')
on conflict (id) do nothing;

-- Automatic (and later manual) flags per day, separate from the readings so
-- they are stored once per day, not once per metric. The app merges them into
-- MetricReading.flags when it loads readings.
create table day_flags (
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  flags reading_flag[] not null default '{}',
  source text not null default 'auto' check (source in ('auto', 'manual')),
  created_at timestamptz not null default now(),
  primary key (user_id, date, source)
);
alter table day_flags enable row level security;
create policy "own day flags" on day_flags for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
