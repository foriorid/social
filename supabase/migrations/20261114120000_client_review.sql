-- Client Review Portal: one private link per content batch. The team publishes a snapshot of the batch
-- (snapshot), the client approves / asks for revision / comments through the public `review` Edge Function
-- (feedback). Clients have no account; they only know the token.
create table public.review_links (
  token text primary key check (token ~ '^[a-z0-9]{20,40}$'),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  campaign_id text not null check (length(campaign_id) between 1 and 80),
  snapshot jsonb not null,
  feedback jsonb not null default '{}'::jsonb,
  revoked boolean not null default false,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, campaign_id)
);

alter table public.review_links enable row level security;
create policy "review_links: members read" on public.review_links for select to authenticated using ((select public.has_workspace_role(workspace_id, 'editor')));
create policy "review_links: members insert" on public.review_links for insert to authenticated with check ((select public.has_workspace_role(workspace_id, 'editor')));
create policy "review_links: members update" on public.review_links for update to authenticated using ((select public.has_workspace_role(workspace_id, 'editor'))) with check ((select public.has_workspace_role(workspace_id, 'editor')));
create policy "review_links: admins delete" on public.review_links for delete to authenticated using ((select public.has_workspace_role(workspace_id, 'admin')));

revoke all on table public.review_links from anon;
grant select, insert, update, delete on table public.review_links to authenticated;

-- A team reply appended in one UPDATE, so it never overwrites a client comment written at the same moment.
-- security invoker: the RLS update policy above decides who may reply.
create function public.review_team_reply(p_token text, p_day int, p_name text, p_text text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  t text := left(btrim(coalesce(p_text, '')), 1000);
  n text := coalesce(nullif(left(btrim(coalesce(p_name, '')), 60), ''), 'FORIOR');
  k text := p_day::text;
  result jsonb;
begin
  if t = '' then raise exception 'Balasan masih kosong.'; end if;
  update public.review_links
     set feedback = jsonb_set(
           feedback,
           array[k],
           coalesce(feedback -> k, '{"comments":[]}'::jsonb)
             || jsonb_build_object('comments', coalesce(feedback -> k -> 'comments', '[]'::jsonb)
                  || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'by', n, 'text', t, 'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'team', true)))),
         updated_at = now()
   where token = p_token
  returning feedback into result;
  if result is null then raise exception 'Link review tidak ditemukan.'; end if;
  return result;
end;
$$;

revoke all on function public.review_team_reply(text, int, text, text) from public, anon;
grant execute on function public.review_team_reply(text, int, text, text) to authenticated;
