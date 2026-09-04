-- 0010: rate limits (SPEC §8 M6 hardening). One row per (subject, action)
-- window. Service role only; no RLS policies because no client reads it.

create table public.rate_limits (
  key          text primary key,
  count        int not null default 0,
  window_start timestamptz not null default now()
);

alter table public.rate_limits enable row level security;

comment on table public.rate_limits is
  'Fixed-window counters keyed by subject:action. Written only through lib/ratelimit.ts with the service role.';
