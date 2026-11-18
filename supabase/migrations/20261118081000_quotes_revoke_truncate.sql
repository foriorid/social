-- RLS does not apply to TRUNCATE. Without this, any signed-in user -- including an Editor who
-- must not even see quotations (20261118080000) -- could wipe every quotation in every workspace.
--
-- Why it was there at all: Supabase's default privileges grant ALL on new tables in public, and
-- 20261111094000_creator_os_harden_grants.sql only revoked the four row verbs from those defaults.
-- TRUNCATE, REFERENCES and TRIGGER rode along on every table created since. That file already
-- revokes exactly these three for app_state; this does the same for the quotation tables.
--
-- Found by reading information_schema.role_table_grants back after applying the migration,
-- rather than trusting the GRANT statements to be the whole story.
revoke truncate, references, trigger on table public.quotes from authenticated;
revoke truncate, references, trigger on table public.quote_opens from authenticated;

-- quote_opens is written only by the Edge Function over its direct DB connection.
revoke insert, update, delete on table public.quote_opens from authenticated;
