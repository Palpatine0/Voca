-- Private operational diagnostics. No client policies and no public write endpoint.
create table if not exists public.error_logs (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  event text not null check (event in ('api_failure', 'generation_failure', 'recovery_failure')),
  operation text not null,
  user_id uuid,
  word_id uuid,
  error_code text,
  status integer
);
create index if not exists error_logs_occurred_at_idx on public.error_logs (occurred_at desc);
alter table public.error_logs enable row level security;
revoke all on public.error_logs from public, anon, authenticated;
grant select, insert, delete on public.error_logs to service_role;
grant usage, select on sequence public.error_logs_id_seq to service_role;
