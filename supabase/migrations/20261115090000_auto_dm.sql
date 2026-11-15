-- Auto DM (comment → DM → follow check → link), run by the public `ig-webhook` Edge Function.

-- The Meta app secret verifies webhook signatures; it lives in Vault like the other keys.
alter table private.user_secrets drop constraint user_secrets_name_check;
alter table private.user_secrets add constraint user_secrets_name_check
  check (name in ('anthropic', 'google', 'meta_token', 'ig_user_id', 'meta_app_secret'));

-- Which Instagram account belongs to which workspace (webhooks only carry the account id),
-- and the token Meta sends back when the webhook URL is registered.
create table public.ig_accounts (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  ig_user_id text unique check (ig_user_id ~ '^[0-9]{5,25}$'),
  verify_token text not null default replace(gen_random_uuid()::text, '-', ''),
  updated_at timestamptz not null default now()
);

create table public.dm_automations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  active boolean not null default false,
  keywords text[] not null default '{}' check (cardinality(keywords) <= 20),
  match_mode text not null default 'contains' check (match_mode in ('contains', 'exact')),
  media_ids text[] not null default '{}' check (cardinality(media_ids) <= 50),
  dm_keywords boolean not null default false,
  public_replies text[] not null default '{}' check (cardinality(public_replies) <= 10),
  opening text not null default '' check (length(opening) <= 900),
  button_label text not null default '' check (length(button_label) <= 40),
  require_follow boolean not null default true,
  follow_prompt text not null default '' check (length(follow_prompt) <= 900),
  follow_button text not null default '' check (length(follow_button) <= 40),
  link_message text not null default '' check (length(link_message) <= 640),
  link_label text not null default '' check (length(link_label) <= 40),
  link_url text not null check (link_url ~ '^https://\S+$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index dm_automations_ws_idx on public.dm_automations (workspace_id);

create table public.dm_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  automation_id uuid references public.dm_automations (id) on delete cascade,
  kind text not null check (kind in ('triggered', 'dm_sent', 'gated', 'link_sent', 'error')),
  ig_user text,
  comment_id text,
  detail text,
  at timestamptz not null default now()
);
create index dm_events_ws_idx on public.dm_events (workspace_id, at desc);
create index dm_events_user_idx on public.dm_events (ig_user, at desc);
-- Meta may deliver the same comment twice; only the first one triggers.
create unique index dm_events_comment_once on public.dm_events (comment_id) where kind = 'triggered';

alter table public.ig_accounts enable row level security;
alter table public.dm_automations enable row level security;
alter table public.dm_events enable row level security;
create policy "ig_accounts: members read" on public.ig_accounts for select to authenticated using ((select public.has_workspace_role(workspace_id, 'editor')));
create policy "ig_accounts: admins write" on public.ig_accounts for insert to authenticated with check ((select public.has_workspace_role(workspace_id, 'admin')));
create policy "ig_accounts: admins update" on public.ig_accounts for update to authenticated using ((select public.has_workspace_role(workspace_id, 'admin'))) with check ((select public.has_workspace_role(workspace_id, 'admin')));
create policy "dm_automations: members read" on public.dm_automations for select to authenticated using ((select public.has_workspace_role(workspace_id, 'editor')));
create policy "dm_automations: members insert" on public.dm_automations for insert to authenticated with check ((select public.has_workspace_role(workspace_id, 'editor')));
create policy "dm_automations: members update" on public.dm_automations for update to authenticated using ((select public.has_workspace_role(workspace_id, 'editor'))) with check ((select public.has_workspace_role(workspace_id, 'editor')));
create policy "dm_automations: members delete" on public.dm_automations for delete to authenticated using ((select public.has_workspace_role(workspace_id, 'editor')));
create policy "dm_events: members read" on public.dm_events for select to authenticated using ((select public.has_workspace_role(workspace_id, 'editor')));

revoke all on table public.ig_accounts, public.dm_automations, public.dm_events from anon;
grant select, insert, update on table public.ig_accounts to authenticated;
grant select, insert, update, delete on table public.dm_automations to authenticated;
grant select on table public.dm_events to authenticated;
