-- Penawaran, simple version: a quotation is just an HTML file in the `quotes` bucket, stored as
-- <slug>.html at the bucket root and shown at /quote/<slug>/. Nothing else is stored.
-- The two tables from the first attempt were never used and are dropped.
drop table if exists public.quote_opens;
drop table if exists public.quotes;

drop policy if exists "quotes bucket: admins write" on storage.objects;
drop policy if exists "quotes bucket: admins update" on storage.objects;
drop policy if exists "quotes bucket: admins delete" on storage.objects;

-- Owners and Admins of the FORIOR (business) workspace can list, upload, replace and delete.
-- Reading a single file for the public link goes through the public bucket and needs no policy.
create policy "quotes: admins list" on storage.objects for select to authenticated
  using (bucket_id = 'quotes' and exists (select 1 from public.workspaces w where w.kind = 'business' and public.has_workspace_role(w.id, 'admin')));
create policy "quotes: admins upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'quotes' and name ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]\.html$' and position('--' in name) = 0
    and exists (select 1 from public.workspaces w where w.kind = 'business' and public.has_workspace_role(w.id, 'admin')));
create policy "quotes: admins replace" on storage.objects for update to authenticated
  using (bucket_id = 'quotes' and exists (select 1 from public.workspaces w where w.kind = 'business' and public.has_workspace_role(w.id, 'admin')))
  with check (bucket_id = 'quotes' and name ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]\.html$' and position('--' in name) = 0);
create policy "quotes: admins delete" on storage.objects for delete to authenticated
  using (bucket_id = 'quotes' and exists (select 1 from public.workspaces w where w.kind = 'business' and public.has_workspace_role(w.id, 'admin')));
