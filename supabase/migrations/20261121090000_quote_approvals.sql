-- Client approval of a published quotation (the "Setujui penawaran ini" form on /quote/<slug>/).
-- One approval per quotation, written only through approve_quote; title/total are copied from the
-- published JSON by the route handler, never taken from the form.
create table public.quote_approvals (
  slug text primary key check (slug ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'),
  name text not null check (length(name) between 1 and 80),
  phone text check (length(phone) <= 30),
  title text check (length(title) <= 300),
  total bigint check (total >= 0),
  at timestamptz not null default now()
);
alter table public.quote_approvals enable row level security;
create policy "quote_approvals: admins read" on public.quote_approvals for select to authenticated
  using (exists (select 1 from public.workspaces w where w.kind = 'business' and (select public.has_workspace_role(w.id, 'admin'))));
revoke all on table public.quote_approvals from anon, authenticated;
grant select on table public.quote_approvals to authenticated;

create function public.approve_quote(p_slug text, p_name text, p_phone text, p_title text, p_total bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_slug !~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' or length(trim(coalesce(p_name, ''))) = 0 then return false; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'quotes' and o.name = p_slug || '.json') then return false; end if;
  insert into public.quote_approvals (slug, name, phone, title, total)
  values (p_slug, left(trim(p_name), 80), nullif(left(trim(coalesce(p_phone, '')), 30), ''), left(coalesce(p_title, ''), 300), greatest(coalesce(p_total, 0), 0))
  on conflict (slug) do nothing;
  return found;
end $$;
revoke execute on function public.approve_quote(text, text, text, text, bigint) from public;
grant execute on function public.approve_quote(text, text, text, text, bigint) to anon, authenticated;

-- What the client page needs to show "Disetujui oleh … pada …": the name and time only.
create function public.quote_approval(p_slug text) returns table (name text, at timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.name, a.at from public.quote_approvals a where a.slug = p_slug;
$$;
revoke execute on function public.quote_approval(text) from public;
grant execute on function public.quote_approval(text) to anon, authenticated;
