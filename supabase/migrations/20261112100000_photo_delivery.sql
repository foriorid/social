-- Photo Delivery galleries. The gallery itself (same shape as the Workspace module) lives in `data`.
-- Owners manage their rows through RLS; clients never touch the table directly — the public
-- `gallery` Edge Function reads/updates a single gallery by slug over its own DB connection.
create table public.galleries (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9-]{1,90}$'),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index galleries_owner_idx on public.galleries (owner, created_at desc);

alter table public.galleries enable row level security;
create policy "galleries: owner reads" on public.galleries for select to authenticated using ((select auth.uid()) = owner);
create policy "galleries: owner inserts" on public.galleries for insert to authenticated with check ((select auth.uid()) = owner);
create policy "galleries: owner updates" on public.galleries for update to authenticated using ((select auth.uid()) = owner) with check ((select auth.uid()) = owner);
create policy "galleries: owner deletes" on public.galleries for delete to authenticated using ((select auth.uid()) = owner);

grant select, insert, update, delete on table public.galleries to authenticated;
revoke all on table public.galleries from anon;
