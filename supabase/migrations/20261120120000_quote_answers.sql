-- Answers clients type into the "Pertanyaan untuk Anda" form on /quote/<slug>/ (app/quote/[slug]/route.ts POST).
-- Written only through submit_quote_answers, for published quotations, at most 50 submissions per quotation.
create table public.quote_answers (
  id bigserial primary key,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'),
  name text check (length(name) <= 80),
  answers jsonb not null check (jsonb_typeof(answers) = 'array' and jsonb_array_length(answers) between 1 and 10 and length(answers::text) <= 15000),
  at timestamptz not null default now()
);
create index quote_answers_slug_at on public.quote_answers (slug, at desc);
alter table public.quote_answers enable row level security;
create policy "quote_answers: admins read" on public.quote_answers for select to authenticated
  using (exists (select 1 from public.workspaces w where w.kind = 'business' and (select public.has_workspace_role(w.id, 'admin'))));
revoke all on table public.quote_answers from anon, authenticated;
grant select on table public.quote_answers to authenticated;

create function public.submit_quote_answers(p_slug text, p_name text, p_answers jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.quote_answers (slug, name, answers)
  select p_slug, nullif(left(coalesce(p_name, ''), 80), ''), p_answers
  where p_slug ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'
    and exists (select 1 from storage.objects o where o.bucket_id = 'quotes' and o.name = p_slug || '.json')
    and (select count(*) from public.quote_answers a where a.slug = p_slug) < 50;
$$;
revoke execute on function public.submit_quote_answers(text, text, jsonb) from public;
grant execute on function public.submit_quote_answers(text, text, jsonb) to anon, authenticated;
