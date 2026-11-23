-- Pricelist links: the client page shows what was chosen (approval title + total), not only who approved.
create function public.quote_choice(p_slug text) returns table (name text, at timestamptz, title text, total bigint)
language sql stable security definer set search_path = '' as $$
  select a.name, a.at, a.title, a.total from public.quote_approvals a where a.slug = p_slug;
$$;
revoke execute on function public.quote_choice(text) from public;
grant execute on function public.quote_choice(text) to anon, authenticated;
