-- Google Calendar for Jadwal Shoot: several Google accounts per workspace, connected with OAuth.
-- The OAuth client (from Google Cloud Console) is stored in Vault like the other keys.
alter table private.user_secrets drop constraint user_secrets_name_check;
alter table private.user_secrets add constraint user_secrets_name_check
  check (name in ('anthropic', 'google', 'meta_token', 'ig_user_id', 'meta_app_secret', 'google_client_id', 'google_client_secret'));

-- One row per connected Google account. The refresh token lives in Vault (secret_id); members only see the email.
create table public.gcal_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null check (length(email) between 3 and 200),
  calendar_id text not null default 'primary' check (length(calendar_id) between 1 and 200),
  color text not null default '#16a36a' check (color ~ '^#[0-9a-fA-F]{6}$'),
  is_default boolean not null default false,
  secret_id uuid not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, email)
);
alter table public.gcal_accounts enable row level security;
create policy "gcal_accounts: members read" on public.gcal_accounts for select to authenticated using ((select public.has_workspace_role(workspace_id, 'editor')));
create policy "gcal_accounts: members update" on public.gcal_accounts for update to authenticated using ((select public.has_workspace_role(workspace_id, 'editor'))) with check ((select public.has_workspace_role(workspace_id, 'editor')));
revoke all on table public.gcal_accounts from anon, authenticated;
grant select (id, workspace_id, email, calendar_id, color, is_default, created_at) on public.gcal_accounts to authenticated;
grant update (color, is_default, calendar_id) on public.gcal_accounts to authenticated;
