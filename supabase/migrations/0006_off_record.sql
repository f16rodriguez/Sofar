-- Off the record (interview findings, Finding 6).
--
-- When the subject says "skip", "pass", "off the record", "don't put that
-- in", the thing declined is not content — and the fact that it was
-- declined is not content either. Writing "he would not say" into someone's
-- autobiography turns the book into an interrogation transcript.
--
-- The refusal still has to be remembered: the question generator must know
-- what has been declined so it does not ask again, and the So far chapter
-- must know not to list it as an open thread. So it lives in memory_threads
-- with this flag, and the chapter writer and So far generator never receive
-- rows where it is set.

alter table public.memory_threads
  add column off_record boolean not null default false;

comment on column public.memory_threads.off_record is
  'True when the subject declined this topic. Never reaches prose or the So far chapter; visible to the question generator only so it is not asked again.';
