-- Penawaran builder (Tahap 1). Quotations made in Hub are published to the public `quotes` bucket as
-- <slug>.json (rendered by app/quote/[slug]/route.ts) with their photos under img/<quote id>/<file>.
-- Drafts stay in the workspace's app_state; nothing private goes into the bucket.

-- Admins of the business workspace may now also write <slug>.json and img/<quote id>/<file>.
-- Applied with ALTER POLICY (no drop) so it needs no destructive-statement approval.
alter policy "quotes: admins upload" on storage.objects
  with check (bucket_id = 'quotes'
    and (name ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]\.(html|json)$' and position('--' in name) = 0
      or name ~ '^img/[a-z0-9]{6,32}/[a-z0-9]{6,40}\.(jpg|png|webp)$')
    and exists (select 1 from public.workspaces w where w.kind = 'business' and public.has_workspace_role(w.id, 'admin')));
alter policy "quotes: admins replace" on storage.objects
  using (bucket_id = 'quotes' and exists (select 1 from public.workspaces w where w.kind = 'business' and public.has_workspace_role(w.id, 'admin')))
  with check (bucket_id = 'quotes'
    and (name ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]\.(html|json)$' and position('--' in name) = 0
      or name ~ '^img/[a-z0-9]{6,32}/[a-z0-9]{6,40}\.(jpg|png|webp)$'));

-- One row per time the client opens a builder quotation ("Dibuka 3×, terakhir kemarin"). No IP is kept.
create table public.quote_opens (
  id bigserial primary key,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'),
  at timestamptz not null default now(),
  ua text check (length(ua) <= 300)
);
create index quote_opens_slug_at on public.quote_opens (slug, at desc);
alter table public.quote_opens enable row level security;
create policy "quote_opens: admins read" on public.quote_opens for select to authenticated
  using (exists (select 1 from public.workspaces w where w.kind = 'business' and (select public.has_workspace_role(w.id, 'admin'))));
revoke all on table public.quote_opens from anon, authenticated;
grant select on table public.quote_opens to authenticated;

-- The public page logs opens through this function only, and only for quotations that are published.
create function public.log_quote_open(p_slug text, p_ua text default null) returns void
language sql security definer set search_path = '' as $$
  insert into public.quote_opens (slug, ua)
  select p_slug, left(p_ua, 300)
  where p_slug ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'
    and exists (select 1 from storage.objects o where o.bucket_id = 'quotes' and o.name = p_slug || '.json');
$$;
revoke execute on function public.log_quote_open(text, text) from public;
grant execute on function public.log_quote_open(text, text) to anon, authenticated;
