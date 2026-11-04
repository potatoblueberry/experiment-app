-- Oura OAuth2 support.
--
-- oura_tokens: access/refresh tokens. RLS is enabled and NO policies exist, so
-- the anon/authenticated roles can never read them; only Edge Functions using
-- the service-role key can. The app never sees a token.
--
-- oauth_states: one row per "Connect Oura" click. The callback looks the state
-- up, verifies it is fresh, and deletes it (single use). This is the CSRF
-- protection for the OAuth redirect.

create table oura_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scope text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table oura_tokens enable row level security;
create trigger oura_tokens_updated_at before update on oura_tokens
  for each row execute function set_updated_at();

create table oauth_states (
  state uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider data_source_provider not null,
  return_to text not null,
  created_at timestamptz not null default now()
);
alter table oauth_states enable row level security;

-- Sync bookkeeping on the connection row (readable by the owner).
alter table data_source_connections
  add column synced_through date,
  add column last_error text;
