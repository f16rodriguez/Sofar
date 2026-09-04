-- 0008: audio retention opt-in (SPEC §3.10). Recordings are deleted at sixty
-- days unless the person chose to keep them. Off by default: silence is not
-- consent to keep a voice on a server.

alter table public.users
  add column keep_audio boolean not null default false;

comment on column public.users.keep_audio is
  'When true the sixty-day audio deletion (SPEC §3.10) skips this person''s recordings.';
