-- Scheduled Oura sync. pg_cron fires every 15 minutes; the trigger function
-- posts to the oura-sync-all Edge Function, which syncs the connections that
-- have gone stale (a few per run). The shared secret lives in Supabase Vault:
--
--   select vault.create_secret('<long random string>', 'oura_cron_secret');
--
-- and the same value must be set as the Edge Function secret CRON_SECRET.
-- Until both exist, the function returns 403 and nothing happens.
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.trigger_oura_sync_all()
returns void
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  secret text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'oura_cron_secret' limit 1;
  if secret is null then
    raise notice 'oura_cron_secret missing in vault; skipping scheduled sync';
    return;
  end if;
  perform net.http_post(
    url := 'https://cwayywolbegqsfepkfux.supabase.co/functions/v1/oura-sync-all',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end;
$$;

revoke all on function public.trigger_oura_sync_all() from public;

select cron.schedule('oura-sync-all', '*/15 * * * *', $$ select public.trigger_oura_sync_all(); $$);
