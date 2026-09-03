-- Naming permission (interview findings, Finding 5).
--
-- Some people in a book are load-bearing and deliberately unnamed: the user
-- names their partner and their friends, and declines to name their daughter,
-- their parents, their siblings. The prose must carry those people by
-- relationship alone and must never invent a name to smooth a sentence.
--
-- A prompt instruction is not enforcement. This puts the permission on the
-- row, so the chapter writer is given only what it may say and the
-- source-citation validator (SPEC §5.4) can reject prose naming anyone whose
-- row does not permit it.

alter table public.memory_people
  -- false by default: silence is not consent. Extraction sets this true only
  -- when the user actually spoke the person's name.
  add column may_name_in_prose boolean not null default false,
  -- How prose refers to this person when naming is not permitted:
  -- "his daughter", "his mother", "his brother".
  add column prose_reference text;

comment on column public.memory_people.may_name_in_prose is
  'True only when the user spoke this person''s name. When false the chapter writer receives prose_reference instead of label, and prose containing the label is rejected.';

comment on column public.memory_people.prose_reference is
  'Relationship phrase used in prose when may_name_in_prose is false.';
