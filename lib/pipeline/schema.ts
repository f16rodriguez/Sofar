// Typed contracts for the pipeline's LLM calls (CLAUDE.md: all LLM calls go
// through lib/llm.ts with typed input/output schemas).

import { z } from "zod";

// Provenance is a verbatim quote, not a character offset.
//
// Asking a model for span_start/span_end asks it to count characters, which it
// cannot do — the first run dropped 19 of 60 items on offsets that pointed at
// the wrong text. A quote is something a model is good at (copying) and
// something code can verify absolutely: either those characters appear in the
// transcript or they do not. Offsets are then computed by search, so they are
// correct by construction.
const sourced = {
  source_quote: z
    .string()
    .describe(
      "The exact words from the transcript this came from, copied character for character.",
    ),
};

export const PersonSchema = z.object({
  label: z.string(),
  relationship: z.string().nullable(),
  quotes: z.array(z.string()),
  may_name_in_prose: z.boolean(),
  prose_reference: z.string().nullable(),
  ...sourced,
});

export const PlaceSchema = z.object({
  label: z.string(),
  when_text: z.string().nullable(),
  what_happened: z.string().nullable(),
  ...sourced,
});

export const EventSchema = z.object({
  what: z.string(),
  when_text: z.string().nullable(),
  // Strict ISO only. "July", "over a year ago" and "2005" belong in when_text;
  // Postgres rejects them as a date (22007) and takes the whole insert down.
  when_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .describe("YYYY-MM-DD only, and only if a full date was actually stated. Otherwise null."),
  where_text: z.string().nullable(),
  who: z.array(z.string()),
  outcome: z.string().nullable(),
  ...sourced,
});

export const StanceSchema = z.object({
  statement: z.string(),
  rationale: z.string().nullable(),
  origin_event: z.string().nullable(),
  ...sourced,
});

export const CostSchema = z.object({
  stance_statement: z.string(),
  what_it_cost: z.string(),
  ...sourced,
});

export const ThreadSchema = z.object({
  label: z.string(),
  description: z.string(),
  // Finding 6: the subject declined this. Never reaches prose.
  off_record: z.boolean(),
  ...sourced,
});

export const VoiceSchema = z.object({
  sentence_length: z.string(),
  vocabulary: z.string(),
  humor: z.string().nullable(),
  avoids: z.string().nullable(),
  repeats: z.array(z.string()),
  self_reference: z.string(),
});

export const UnsaidSchema = z.object({ text: z.string(), ...sourced });

export const InferredSchema = z.object({
  kind: z.string(),
  content: z.string(),
  ...sourced,
});

/** A row whose quote has been found in the transcript, with real offsets. */
export type Located<T> = T & { span_start: number; span_end: number };

export interface Extraction {
  people: Located<z.infer<typeof PersonSchema>>[];
  places: Located<z.infer<typeof PlaceSchema>>[];
  events: Located<z.infer<typeof EventSchema>>[];
  stances: Located<z.infer<typeof StanceSchema>>[];
  costs: Located<z.infer<typeof CostSchema>>[];
  open_threads: Located<z.infer<typeof ThreadSchema>>[];
  voice: z.infer<typeof VoiceSchema>;
  unsaid: Located<z.infer<typeof UnsaidSchema>>[];
  inferred: Located<z.infer<typeof InferredSchema>>[];
}

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

// Entailment gate: does each paragraph say only what its cited rows say?
export const EntailmentSchema = z.object({
  paragraphs: z.array(
    z.object({
      index: z.number().int(),
      supported: z.boolean(),
      unsupported_claims: z.array(z.string()),
    }),
  ),
});

// Sufficiency: is there a chapter here, and what is it about? Decided before
// anything is written. The writer receives only the rows the editor kept.
export const SufficiencySchema = z.object({
  enough: z.boolean(),
  story: z.string().nullable(),
  keep: z.array(z.string()),
  missing: z.array(z.object({ what: z.string(), why: z.string() })),
});
export type Sufficiency = z.infer<typeof SufficiencySchema>;
