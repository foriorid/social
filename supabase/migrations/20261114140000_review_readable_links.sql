-- Readable review links: "intragama-villa-november-2026-k7m2". Older 20-40 char random ids stay valid.
alter table public.review_links drop constraint review_links_token_check;
alter table public.review_links add constraint review_links_token_check
  check (token ~ '^[a-z0-9][a-z0-9-]{6,88}[a-z0-9]$' and position('--' in token) = 0);
