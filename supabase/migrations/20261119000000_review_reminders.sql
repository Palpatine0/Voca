begin;
-- One Voca-specific VAPID identity survives API restarts and redeploys.
create table if not exists public.reminder_identity (
  id boolean primary key default true check (id),
  public_key text not null,
  private_key text not null
);
create table if not exists public.review_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  keys jsonb not null,
  timezone text not null,
  last_sent date,
  retry_after timestamptz not null default now()
);
alter table public.reminder_identity enable row level security;
alter table public.review_subscriptions enable row level security;
revoke all on public.reminder_identity, public.review_subscriptions from public, anon, authenticated;
grant select, insert on public.reminder_identity to service_role;
grant select, insert, update, delete on public.review_subscriptions to service_role;

create or replace function public.claim_review_reminders()
returns setof public.review_subscriptions language sql as $$
  with eligible as (
    select s.endpoint from public.review_subscriptions s
    where s.retry_after <= now()
      and extract(hour from now() at time zone s.timezone) between 9 and 19
      and s.last_sent is distinct from (now() at time zone s.timezone)::date
      and exists (select 1 from public.words w where w.user_id = s.user_id and w.next_review_at <= now())
    order by s.retry_after limit 20 for update of s skip locked
  )
  update public.review_subscriptions s set retry_after = now() + interval '15 minutes'
  from eligible where s.endpoint = eligible.endpoint returning s.*;
$$;
revoke all on function public.claim_review_reminders() from public, anon, authenticated;
grant execute on function public.claim_review_reminders() to service_role;
notify pgrst, 'reload schema';
commit;
