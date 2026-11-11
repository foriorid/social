-- Only signed-in users touch app_state, and only through RLS-checked row operations.
revoke all on table public.app_state from anon;
revoke truncate, references, trigger on table public.app_state from authenticated;

-- Secret helpers are for the Edge Function's direct DB connection only.
revoke all on schema private from public, anon, authenticated;
revoke all on function private.set_secret(uuid, text, text) from public, anon, authenticated;
revoke all on function private.get_secret(uuid, text) from public, anon, authenticated;
revoke all on function private.secret_status(uuid) from public, anon, authenticated;

-- Make Data API exposure opt-in for objects created later.
alter default privileges for role postgres in schema public revoke select, insert, update, delete on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke usage, select on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke execute on functions from public;
