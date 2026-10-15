begin;

-- Track successful lookups (including no match) and source credits. Existing
-- words are repaired lazily by the normal account-scoped enrichment queue.
alter table public.words add column if not exists enrichment jsonb;

commit;
