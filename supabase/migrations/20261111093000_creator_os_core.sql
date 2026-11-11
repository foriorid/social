-- Exposure through the Data API is opt-in for everything created from here on.
alter default privileges for role postgres in schema public revoke select, insert, update, delete on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke usage, select on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke execute on functions from public;

-- One row per (user, app store key). Mirrors the browser store so every page syncs without a schema per feature.
create table public.app_state (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null check (char_length(key) between 1 and 200),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.app_state enable row level security;
grant select, insert, update, delete on table public.app_state to authenticated;

create policy "own rows: select" on public.app_state for select to authenticated using ((select auth.uid()) = user_id);
create policy "own rows: insert" on public.app_state for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own rows: update" on public.app_state for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows: delete" on public.app_state for delete to authenticated using ((select auth.uid()) = user_id);

-- API keys never reach the browser: encrypted in Vault, reachable only from the Edge Function over a direct DB connection.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.user_secrets (
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (name in ('anthropic', 'google', 'meta_token', 'ig_user_id')),
  secret_id uuid not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, name)
);
alter table private.user_secrets enable row level security;

create function private.set_secret(p_user uuid, p_name text, p_value text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  select secret_id into v_id from private.user_secrets where user_id = p_user and name = p_name;
  if p_value is null or p_value = '' then
    if v_id is not null then
      delete from vault.secrets where id = v_id;
      delete from private.user_secrets where user_id = p_user and name = p_name;
    end if;
    return;
  end if;
  if v_id is null then
    v_id := vault.create_secret(p_value, 'user:' || p_user || ':' || p_name);
    insert into private.user_secrets (user_id, name, secret_id) values (p_user, p_name, v_id);
  else
    perform vault.update_secret(v_id, p_value);
    update private.user_secrets set updated_at = now() where user_id = p_user and name = p_name;
  end if;
end $$;

create function private.get_secret(p_user uuid, p_name text) returns text
language sql security definer set search_path = '' stable as $$
  select d.decrypted_secret from private.user_secrets s join vault.decrypted_secrets d on d.id = s.secret_id
  where s.user_id = p_user and s.name = p_name
$$;

revoke all on function private.set_secret(uuid, text, text) from public, anon, authenticated;
revoke all on function private.get_secret(uuid, text) from public, anon, authenticated;
