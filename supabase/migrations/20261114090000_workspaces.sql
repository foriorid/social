-- Workspaces (Alvian personal brand / FORIOR business) with members and roles.
-- Every app row now belongs to a workspace; access is decided by membership, not by who created the row.

-- 1. Backups of the data this migration rewrites (private schema, not exposed through the API).
create table if not exists private.backup_app_state_20261114 as select * from public.app_state;
create table if not exists private.backup_galleries_20261114 as select * from public.galleries;

-- 2. Workspaces and members.
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{1,40}$'),
  name text not null check (char_length(name) between 1 and 80),
  kind text not null check (kind in ('personal', 'business')),
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'editor')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id);

-- 3. Role check used by every policy. Security definer so policies on workspace_members itself
--    don't recurse; it only ever answers for the calling user.
create or replace function public.has_workspace_role(ws uuid, min_role text default 'editor')
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case m.role when 'owner' then 3 when 'admin' then 2 else 1 end
    from public.workspace_members m
    where m.workspace_id = ws and m.user_id = (select auth.uid())
  ) >= case min_role when 'owner' then 3 when 'admin' then 2 else 1 end, false)
$$;
revoke all on function public.has_workspace_role(uuid, text) from public, anon;
grant execute on function public.has_workspace_role(uuid, text) to authenticated;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
create policy "workspaces: members read" on public.workspaces for select to authenticated using (public.has_workspace_role(id, 'editor'));
create policy "members: co-members read" on public.workspace_members for select to authenticated using (public.has_workspace_role(workspace_id, 'editor'));
grant select on public.workspaces, public.workspace_members to authenticated;
revoke all on public.workspaces, public.workspace_members from anon;

-- 4. Seed the two workspaces; every existing account (today: Alvian) owns both.
insert into public.workspaces (slug, name, kind) values ('alvian', 'Alvian', 'personal'), ('forior', 'FORIOR', 'business');
insert into public.workspace_members (workspace_id, user_id, role)
select w.id, u.id, 'owner' from public.workspaces w cross join auth.users u;
