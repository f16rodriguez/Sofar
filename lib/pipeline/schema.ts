// Typed contracts for the pipeline's LLM calls (CLAUDE.md: all LLM calls go
// through lib/llm.ts with typed input/output schemas).

import { z } from "zod";

const span = {
  span_start: z.number().int().min(0),
  span_end: z.number().int().min(0),
};

export const PersonSchema = z.object({
  label: z.string(),
  relationship: z.string().nullable(),
  quotes: z.array(z.string()),
  // Finding 5: true only when the subject actually spoke the name.
  may_name_in_prose: z.boolean(),
  prose_reference: z.string().nullable(),
  ...span,
});

export const PlaceSchema = z.object({
  label: z.string(),
  when_text: z.string().nullable(),
  what_happened: z.string().nullable(),
  ...span,
});

export const EventSchema = z.object({
  what: z.string(),
  when_text: z.string().nullable(),
  when_date: z.string().nullable(),
  where_text: z.string().nullable(),
  who: z.array(z.string()),
  outcome: z.string().nullable(),
  ...span,
});

export const StanceSchema = z.object({
  statement: z.string(),
  rationale: z.string().nullable(),
  origin_event: z.string().nullable(),
  ...span,
});

export const CostSchema = z.object({
  stance_statement: z.string(),
  what_it_cost: z.string(),
  ...span,
});

export const ThreadSchema = z.object({
  label: z.string(),
  description: z.string(),
  ...span,
});

export const VoiceSchema = z.object({
  sentence_length: z.string(),
  vocabulary: z.string(),
  humor: z.string().nullable(),
  avoids: z.string().nullable(),
  repeats: z.array(z.string()),
  self_reference: z.string(),
});

export const UnsaidSchema = z.object({ text: z.string(), ...span });

export const InferredSchema = z.object({
  kind: z.string(),
  content: z.string(),
  ...span,
});

export const ExtractionSchema = z.object({
  people: z.array(PersonSchema),
  places: z.array(PlaceSchema),
  events: z.array(EventSchema),
  stances: z.array(StanceSchema),
  costs: z.array(CostSchema),
  open_threads: z.array(ThreadSchema),
  voice: VoiceSchema,
  unsaid: z.array(UnsaidSchema),
  inferred: z.array(InferredSchema),
});

export type Extraction = z.infer<typeof ExtractionSchema>;
export type Person = z.infer<typeof PersonSchema>;

export const ChapterSchema = z.object({
  title: z.string(),
  body_md: z.string(),
  source_memory_ids: z.array(z.string()),
  // One entry per paragraph of body_md, in order. Each must be non-empty:
  // a paragraph with no source is a paragraph that was invented.
  paragraph_sources: z.array(z.array(z.string())),
});

export type ChapterDraft = z.infer<typeof ChapterSchema>;

// §5.3 entity resolution: is this the same person/place already on record?
export const SameEntitySchema = z.object({
  same: z.boolean(),
  reason: z.string(),
});
