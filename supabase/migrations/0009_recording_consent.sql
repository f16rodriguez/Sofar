-- 0009: recording consent (landing promise; SPEC §7). Set once, when the
-- person confirms in Block 0 that they are okay being recorded. The interview
-- does not start without it.

alter table public.users
  add column recording_consent_at timestamptz;

comment on column public.users.recording_consent_at is
  'When the person confirmed they are okay being recorded. Null means the interview may not start.';
