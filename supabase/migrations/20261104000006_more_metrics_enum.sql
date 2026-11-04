-- New metrics from Oura sleep / activity / stress documents. Enum values must be
-- added in their own migration: Postgres refuses to use a new enum value in the
-- same transaction that created it, so the metric_definitions rows follow in 0007.
alter type metric_id add value if not exists 'sleep_latency';
alter type metric_id add value if not exists 'awake_time';
alter type metric_id add value if not exists 'sleep_hr';
alter type metric_id add value if not exists 'respiratory_rate';
alter type metric_id add value if not exists 'bedtime';
alter type metric_id add value if not exists 'daytime_stress';
alter type metric_id add value if not exists 'active_calories';
alter type metric_id add value if not exists 'tz_offset';
