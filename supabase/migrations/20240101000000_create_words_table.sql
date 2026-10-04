-- Run in Supabase, where auth.users and the API roles already exist.
begin;

-- Words table with SM-2 spaced repetition fields
create table if not exists public.words (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  term text not null,
  definition text,
  pronunciation_url text,
  image_url text,

  -- SM-2 algorithm fields
  easiness_factor float not null default 2.5,
  interval integer not null default 0,
  repetitions integer not null default 0,
  next_review_at timestamptz not null default now(),
  last_reviewed_at timestamptz,

  created_at timestamptz not null default now()
);

-- Index for fetching due words efficiently
create index if not exists idx_words_user_due
  on public.words (user_id, next_review_at);

-- RLS: users can only access their own words
alter table public.words enable row level security;

grant select, insert, update, delete on public.words to authenticated;
grant all on public.words to service_role;

-- Reapplying this initial setup preserves words and replaces only these policies.
drop policy if exists "Users can read own words" on public.words;
create policy "Users can read own words"
  on public.words for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own words" on public.words;
create policy "Users can insert own words"
  on public.words for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own words" on public.words;
create policy "Users can update own words"
  on public.words for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own words" on public.words;
create policy "Users can delete own words"
  on public.words for delete to authenticated
  using (auth.uid() = user_id);

commit;
