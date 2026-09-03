-- Store the words each memory row came from (interview findings, Finding 7).
--
-- Extraction already produces a verbatim source_quote for every row — it is
-- how provenance is verified — but only the offsets were kept. The chapter
-- writer therefore received summaries ("Came to DR to view villas") when the
-- person had given a scene (three villas, a deflating first one, baby-safe
-- stairs, a father who did not walk the third). Thin sources produce thin
-- prose, and a writer with only a summary either writes short or invents.
--
-- Keeping the quote makes the row's own evidence available to the writer and
-- to the entailment gate, so richer prose is also better-sourced prose.

alter table public.memory_people  add column source_quote text;
alter table public.memory_places  add column source_quote text;
alter table public.memory_events  add column source_quote text;
alter table public.memory_stances add column source_quote text;
alter table public.memory_costs   add column source_quote text;
alter table public.memory_threads add column source_quote text;

comment on column public.memory_events.source_quote is
  'The exact words in the transcript this row was extracted from. Given to the chapter writer as its material and to the entailment gate as its evidence.';
