-- Move app_state and galleries onto workspaces, and reset campaign data (requested 13 Nov 2026).
-- Backups were taken in 20261114090000_workspaces.sql.

-- app_state: one row per (workspace, key). user_id stays as "last edited by".
alter table public.app_state add column workspace_id uuid references public.workspaces (id) on delete cascade;
update public.app_state set workspace_id = (select id from public.workspaces where slug = 'alvian');
alter table public.app_state drop constraint app_state_pkey;

-- Campaigns and everything hanging off them are removed in both workspaces.
delete from public.app_state where key in ('plan', 'tasks', 'approvals') or key like 'look:%';

-- FORIOR starts with the shared folders and settings, rebranded; usage history stays with Alvian.
insert into public.app_state (workspace_id, user_id, key, value)
select (select id from public.workspaces where slug = 'forior'), user_id, key,
       case when key = 'settings' then value || '{"brandName":"FORIOR","handle":""}'::jsonb else value end
from public.app_state where key in ('settings', 'driveFolders');

insert into public.app_state (workspace_id, user_id, key, value)
select w.id, (select id from auth.users order by created_at limit 1), 'plan',
       case w.slug when 'alvian' then '{"accounts":["Alvian"],"campaigns":[]}'::jsonb else '{"accounts":["FORIOR","Intragama Villa"],"campaigns":[]}'::jsonb end
from public.workspaces w;

alter table public.app_state alter column workspace_id set not null;
alter table public.app_state add primary key (workspace_id, key);
alter table public.app_state drop constraint app_state_user_id_fkey;
alter table public.app_state alter column user_id drop not null;
alter table public.app_state add constraint app_state_user_id_fkey foreign key (user_id) references auth.users (id) on delete set null;

drop policy "own rows: select" on public.app_state;
drop policy "own rows: insert" on public.app_state;
drop policy "own rows: update" on public.app_state;
drop policy "own rows: delete" on public.app_state;
create policy "app_state: members read" on public.app_state for select to authenticated using ((select public.has_workspace_role(workspace_id, 'editor')));
create policy "app_state: members insert" on public.app_state for insert to authenticated with check ((select public.has_workspace_role(workspace_id, 'editor')));
create policy "app_state: members update" on public.app_state for update to authenticated using ((select public.has_workspace_role(workspace_id, 'editor'))) with check ((select public.has_workspace_role(workspace_id, 'editor')));
create policy "app_state: members delete" on public.app_state for delete to authenticated using ((select public.has_workspace_role(workspace_id, 'editor')));

-- galleries: Photo Delivery belongs to FORIOR. owner stays as "created by".
alter table public.galleries add column workspace_id uuid references public.workspaces (id) on delete cascade;
update public.galleries set workspace_id = (select id from public.workspaces where slug = 'forior');
alter table public.galleries alter column workspace_id set not null;
create index galleries_workspace_idx on public.galleries (workspace_id, created_at desc);
alter table public.galleries drop constraint galleries_owner_fkey;
alter table public.galleries alter column owner drop not null;
alter table public.galleries add constraint galleries_owner_fkey foreign key (owner) references auth.users (id) on delete set null;

drop policy "galleries: owner reads" on public.galleries;
drop policy "galleries: owner inserts" on public.galleries;
drop policy "galleries: owner updates" on public.galleries;
drop policy "galleries: owner deletes" on public.galleries;
create policy "galleries: members read" on public.galleries for select to authenticated using ((select public.has_workspace_role(workspace_id, 'editor')));
create policy "galleries: members insert" on public.galleries for insert to authenticated with check ((select public.has_workspace_role(workspace_id, 'editor')));
create policy "galleries: members update" on public.galleries for update to authenticated using ((select public.has_workspace_role(workspace_id, 'editor'))) with check ((select public.has_workspace_role(workspace_id, 'editor')));
create policy "galleries: admins delete" on public.galleries for delete to authenticated using ((select public.has_workspace_role(workspace_id, 'admin')));
