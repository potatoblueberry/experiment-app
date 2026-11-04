-- Resumable history import. The sync walks backwards in chunks from the oldest
-- day it has, persisting progress after every chunk, so a long history can be
-- imported across several function calls (each call has a time budget).
alter table data_source_connections
  add column synced_from date,
  add column backfill_done boolean not null default false,
  add column empty_streak smallint not null default 0;

-- Connections that already imported something start from their oldest reading.
update data_source_connections c
set synced_from = (
  select min(r.date) from metric_readings r
  where r.user_id = c.user_id and r.source = c.provider
)
where c.synced_through is not null;
