-- Share Penawaran: Alvian uploads a standalone HTML quotation he made outside the system and
-- shares it as hub.forior.id/quote/<slug>/. The page is served by Hub's own route handler
-- (app/quote/[slug]/route.ts), because Supabase refuses to serve rendered HTML from
-- *.supabase.co -- see docs/superpowers/specs/2026-11-18-share-penawaran-design.md §4-A.
-- The HTML lives here (±37 KB once its base64 images are lifted out); the images live in Storage.

create table public.quotes (
  -- 3-63 chars, so a 7-char slug like 'mytepro' is allowed; review_links' {6,88} would reject it.
  slug text primary key
    check (slug ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' and position('--' in slug) = 0),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  title text not null check (length(title) between 1 and 200),
  client_name text check (length(client_name) <= 120),
  -- "Option 1" / "Option 2": one client can receive several options at once.
  option_label text check (length(option_label) <= 40),
  html text not null check (length(html) <= 2000000),
  og_title text check (length(og_title) <= 200),
  og_description text check (length(og_description) <= 400),
  og_image text check (length(og_image) <= 1000),
  revoked boolean not null default false,
  opens integer not null default 0,
  last_opened_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per real open, so "dibuka 5x dalam dua hari" is answerable, not just a counter.
-- No IP is stored: the question is whether the client looked, not who they are.
create table public.quote_opens (
  id bigserial primary key,
  slug text not null references public.quotes (slug) on delete cascade,
  at timestamptz not null default now(),
  ua text check (length(ua) <= 500),
  referer text check (length(referer) <= 500)
);
create index quote_opens_slug_at on public.quote_opens (slug, at desc);
-- Quotations are grouped per client in the dashboard, with each option's open count beside its siblings.
create index quotes_ws_client on public.quotes (workspace_id, lower(client_name));

-- Quotations hold commercial pricing, so this is one step stricter than review_links:
-- 'admin' for every verb, reads included. An Editor sees nothing at all.
alter table public.quotes enable row level security;
create policy "quotes: admins read" on public.quotes for select to authenticated using ((select public.has_workspace_role(workspace_id, 'admin')));
create policy "quotes: admins insert" on public.quotes for insert to authenticated with check ((select public.has_workspace_role(workspace_id, 'admin')));
create policy "quotes: admins update" on public.quotes for update to authenticated using ((select public.has_workspace_role(workspace_id, 'admin'))) with check ((select public.has_workspace_role(workspace_id, 'admin')));
create policy "quotes: admins delete" on public.quotes for delete to authenticated using ((select public.has_workspace_role(workspace_id, 'admin')));

alter table public.quote_opens enable row level security;
create policy "quote_opens: admins read" on public.quote_opens for select to authenticated
  using (exists (select 1 from public.quotes q where q.slug = quote_opens.slug and (select public.has_workspace_role(q.workspace_id, 'admin'))));

-- harden_grants.sql revoked default privileges for new tables, so these must be explicit.
-- quote_opens is written only by the Edge Function over its direct DB connection, never by the
-- browser, so authenticated gets select and nothing more (and needs no sequence privilege).
revoke all on table public.quotes from anon;
revoke all on table public.quote_opens from anon;
grant select, insert, update, delete on table public.quotes to authenticated;
grant select on table public.quote_opens to authenticated;

-- Images only. Verified: Storage serves image/jpeg untouched with max-age=31536000, while it
-- rewrites HTML to text/plain and injects a locking CSP -- hence HTML stays in the table above.
insert into storage.buckets (id, name, public) values ('quotes', 'quotes', true)
  on conflict (id) do nothing;

-- Object paths are <workspace_id>/<slug>/<upload_id>/<n>.<ext>, so the outermost folder is the
-- workspace. The uuid shape is checked before casting: a policy that raises on a malformed path
-- would break uploads instead of refusing them.
create policy "quotes bucket: admins write" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'quotes'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and (select public.has_workspace_role(((storage.foldername(name))[1])::uuid, 'admin'))
  );
create policy "quotes bucket: admins update" on storage.objects for update to authenticated
  using (
    bucket_id = 'quotes'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and (select public.has_workspace_role(((storage.foldername(name))[1])::uuid, 'admin'))
  );
create policy "quotes bucket: admins delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'quotes'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and (select public.has_workspace_role(((storage.foldername(name))[1])::uuid, 'admin'))
  );
