// Extraction (SPEC §5.2): transcript → memory rows, each tied to the answer
// and the span it came from.
//
// Sonnet 5 by default, Opus for onboarding. Run as three passes rather than
// one: the full memory schema compiles to a grammar the structured-output
// endpoint rejects as too large, and three narrower passes also let each one
// keep its whole attention on one kind of reading. The transcript is sent as a
// cached block, so the shared input is paid for once across the three.
//
// Every item's span is verified against the transcript before it is allowed
// through — a claim whose span does not contain it is not traceable, and
// untraceable memory is what the source-citation rule exists to prevent.

import { z } from "zod";
import { complete, loadPrompt, type ModelTier } from "../llm";
import {
  PersonSchema,
  PlaceSchema,
  EventSchema,
  StanceSchema,
  CostSchema,
  ThreadSchema,
  VoiceSchema,
  UnsaidSchema,
  InferredSchema,
  type Extraction,
} from "./schema";

export interface ExtractOptions {
  transcript: string;
  /** Opus for onboarding (SPEC §5.2). */
  model?: ModelTier;
  memoryContext?: string;
}

export interface SpanIssue {
  kind: string;
  label: string;
  reason: string;
}

export interface ExtractResult {
  extraction: Extraction;
  dropped: SpanIssue[];
}

interface Spanned {
  span_start: number;
  span_end: number;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A span is valid if it is in range and the text it covers overlaps the claim.
 * Shared significant words rather than exact containment: the model paraphrases
 * lightly, and demanding verbatim identity would drop good rows. Demanding
 * nothing would let a row cite an unrelated part of the transcript.
 */
function spanSupports(
  transcript: string,
  item: Spanned,
  claim: string,
): string | null {
  const { span_start: start, span_end: end } = item;
  if (end <= start) return "empty span";
  if (start < 0 || end > transcript.length) return "span out of range";

  const source = normalize(transcript.slice(start, end));
  if (source.length === 0) return "span covers no text";

  const claimWords = normalize(claim)
    .split(" ")
    .filter((w) => w.length > 3);
  if (claimWords.length === 0) return null;

  const hits = claimWords.filter((w) => source.includes(w)).length;
  return hits / claimWords.length >= 0.34
    ? null
    : `span does not contain the claim (${hits}/${claimWords.length} words)`;
}

// --- the three passes -------------------------------------------------------

const PeoplePlacesSchema = z.object({
  people: z.array(PersonSchema),
  places: z.array(PlaceSchema),
});

const HappeningsSchema = z.object({
  events: z.array(EventSchema),
  stances: z.array(StanceSchema),
  costs: z.array(CostSchema),
});

const ResidueSchema = z.object({
  open_threads: z.array(ThreadSchema),
  voice: VoiceSchema,
  unsaid: z.array(UnsaidSchema),
  inferred: z.array(InferredSchema),
});

const PASS_NOTES = {
  peoplePlaces:
    "PASS 1 of 3 — people and places only. Pay particular attention to naming " +
    "permission: may_name_in_prose is true only where the subject actually " +
    "spoke the name.",
  happenings:
    "PASS 2 of 3 — events, stances, and costs only. Stances in the subject's " +
    "own phrasing; an origin_event only where they connected the belief to one.",
  residue:
    "PASS 3 of 3 — open threads, the voice profile, anything unsaid, and " +
    "everything inferred. Refusals and skips are threads, not absences.",
} as const;

export async function extract(opts: ExtractOptions): Promise<ExtractResult> {
  const cachedInput = [
    "--- TRANSCRIPT START ---",
    opts.transcript,
    "--- TRANSCRIPT END ---",
  ].join("\n");

  const spanNote =
    "Character offsets are counted from the first character after the " +
    "TRANSCRIPT START line.";

  const call = <T>(schema: z.ZodType<T>, note: string) =>
    complete({
      task: "extraction",
      model: opts.model,
      system: loadPrompt("extraction"),
      cachedInput,
      memoryContext: opts.memoryContext,
      prompt: `${note}\n\n${spanNote}`,
      schema,
      maxTokens: 64000,
    });

  // Sequential, not parallel: the first call writes the shared transcript into
  // the prompt cache and the next two read it.
  const peoplePlaces = await call(PeoplePlacesSchema, PASS_NOTES.peoplePlaces);
  const happenings = await call(HappeningsSchema, PASS_NOTES.happenings);
  const residue = await call(ResidueSchema, PASS_NOTES.residue);

  const dropped: SpanIssue[] = [];
  const keep = <T extends Spanned>(
    items: T[],
    kind: string,
    claimOf: (item: T) => string,
  ): T[] =>
    items.filter((item) => {
      const problem = spanSupports(opts.transcript, item, claimOf(item));
      if (problem) {
        dropped.push({ kind, label: claimOf(item).slice(0, 60), reason: problem });
        return false;
      }
      return true;
    });

  const extraction: Extraction = {
    people: keep(peoplePlaces.people, "person", (p) => p.label),
    places: keep(peoplePlaces.places, "place", (p) => p.label),
    events: keep(happenings.events, "event", (e) => e.what),
    stances: keep(happenings.stances, "stance", (s) => s.statement),
    costs: keep(happenings.costs, "cost", (c) => c.what_it_cost),
    open_threads: keep(residue.open_threads, "thread", (t) => t.label),
    voice: residue.voice,
    unsaid: keep(residue.unsaid, "unsaid", (u) => u.text),
    // memory_inferred never reaches prose, so a loose span costs nothing.
    inferred: residue.inferred,
  };

  return { extraction, dropped };
}
