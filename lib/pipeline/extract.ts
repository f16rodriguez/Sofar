// Extraction (SPEC §5.2): transcript → memory rows, each tied to the answer
// and the span it came from.
//
// Sonnet 5 by default, Opus for onboarding. Run as three passes rather than
// one: the full memory schema compiles to a grammar the structured-output
// endpoint rejects as too large, and three narrower passes also let each one
// keep its whole attention on one kind of reading. The transcript is sent as a
// cached block, so the shared input is paid for once across the three.
//
// Provenance: the model returns the words an item came from, and this file
// finds those words in the transcript to compute the offsets. Asking the model
// for character offsets directly does not work — it is asking it to count
// characters, and the first run dropped 19 of 60 items on offsets pointing at
// the wrong text. A quote either appears in the transcript or it does not,
// which makes the check absolute and the offsets correct by construction.

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
  type Located,
} from "./schema";

export interface ExtractOptions {
  transcript: string;
  /** Opus for onboarding (SPEC §5.2). */
  model?: ModelTier;
  memoryContext?: string;
  /** Called as each pass lands, so a long run is not a silent one. */
  onProgress?: (pass: string) => void;
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

interface Sourced {
  source_quote: string;
}

/** Whitespace-collapsed transcript, and the original index of each character. */
function buildIndex(transcript: string): { collapsed: string; map: number[] } {
  let collapsed = "";
  const map: number[] = [];
  let inSpace = false;
  for (let i = 0; i < transcript.length; i++) {
    if (/\s/.test(transcript[i])) {
      if (!inSpace && collapsed.length > 0) {
        collapsed += " ";
        map.push(i);
        inSpace = true;
      }
      continue;
    }
    inSpace = false;
    collapsed += transcript[i];
    map.push(i);
  }
  map.push(transcript.length);
  return { collapsed, map };
}

/**
 * Exact match first; failing that, match on collapsed whitespace. The model
 * copies words reliably and line breaks unreliably, and a quote differing only
 * in wrapping is the same quote. Anything still unfound is text that is not in
 * the transcript — precisely what this exists to catch.
 */
function locate(
  transcript: string,
  index: { collapsed: string; map: number[] },
  quote: string,
): { span_start: number; span_end: number } | null {
  if (quote.trim().length === 0) return null;

  const exact = transcript.indexOf(quote);
  if (exact >= 0) return { span_start: exact, span_end: exact + quote.length };

  const needle = quote.replace(/\s+/g, " ").trim();
  if (needle.length === 0) return null;
  const at = index.collapsed.indexOf(needle);
  if (at < 0) return null;

  return {
    span_start: index.map[at],
    span_end: index.map[Math.min(at + needle.length, index.map.length - 1)],
  };
}

// Keyboard slips a typing person made and never said: "aND" for "and". The
// extraction prompt cannot fix these — it is simultaneously told to copy
// verbatim, and verbatim wins. So it is done here, narrowly: a word whose
// capitalisation is anomalous AND whose lowercase form is an ordinary word.
// "aND" is corrected; "iPhone", "COO", "DR", "PS" are not.
const ORDINARY = new Set(
  ("and the but that this with from they them was were have has had not you your for are its what when where which who how why all can will would could should been being there their then than into out about just because some more most one two first last next time day year like really very still what's don't didn't").split(" "),
);

export function fixKeyboardSlips(text: string): string {
  return text.replace(/\b[A-Za-z']{2,}\b/g, (word) => {
    const lower = word.toLowerCase();
    if (word === lower || word === word.toUpperCase()) return word;
    if (word[0] === word[0].toUpperCase() && word.slice(1) === word.slice(1).toLowerCase()) {
      return word; // ordinary Title Case
    }
    return ORDINARY.has(lower) ? lower : word;
  });
}

/**
 * Every human-readable field, cleaned of slips the person never spoke.
 * Exported because cached extractions must be cleaned on load as well —
 * otherwise the cache faithfully replays yesterday's typos.
 */
export function clean<T>(value: T): T {
  if (typeof value === "string") return fixKeyboardSlips(value) as unknown as T;
  if (Array.isArray(value)) return value.map(clean) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      // source_quote is evidence and is matched against the transcript
      // verbatim; correcting it would break the provenance check.
      out[k] = k === "source_quote" ? v : clean(v);
    }
    return out as T;
  }
  return value;
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

  const quoteNote =
    "For every item, source_quote must be the exact words from the transcript " +
    "it came from — copied, not paraphrased, not summarised. Quote the " +
    "smallest stretch of text that contains the claim. A quote that does not " +
    "appear verbatim in the transcript causes the item to be discarded.";

  const call = <T>(schema: z.ZodType<T>, note: string) =>
    complete({
      task: "extraction",
      model: opts.model,
      system: loadPrompt("extraction"),
      cachedInput,
      memoryContext: opts.memoryContext,
      prompt: `${note}\n\n${quoteNote}`,
      schema,
      // Extraction is careful reading, not reasoning: it locates what was said
      // and copies it out. High effort spends the whole budget deliberating.
      effort: "medium",
      maxTokens: 32000,
    });

  // Sequential, not parallel: the first call writes the shared transcript into
  // the prompt cache and the next two read it.
  const peoplePlaces = await call(PeoplePlacesSchema, PASS_NOTES.peoplePlaces);
  opts.onProgress?.("people and places");
  const happenings = await call(HappeningsSchema, PASS_NOTES.happenings);
  opts.onProgress?.("events, stances and costs");
  const residue = await call(ResidueSchema, PASS_NOTES.residue);
  opts.onProgress?.("threads, voice and inferred");

  const index = buildIndex(opts.transcript);
  const dropped: SpanIssue[] = [];

  const place = <T extends Sourced>(
    items: T[],
    kind: string,
    labelOf: (item: T) => string,
  ): Located<T>[] => {
    const kept: Located<T>[] = [];
    for (const item of items) {
      const span = locate(opts.transcript, index, item.source_quote);
      if (!span) {
        dropped.push({
          kind,
          label: labelOf(item).slice(0, 60),
          reason: "quote not found in transcript",
        });
        continue;
      }
      kept.push({ ...item, ...span });
    }
    return kept;
  };

  const extraction: Extraction = clean({
    people: place(peoplePlaces.people, "person", (p) => p.label),
    places: place(peoplePlaces.places, "place", (p) => p.label),
    events: place(happenings.events, "event", (e) => e.what),
    stances: place(happenings.stances, "stance", (s) => s.statement),
    costs: place(happenings.costs, "cost", (c) => c.what_it_cost),
    open_threads: place(residue.open_threads, "thread", (t) => t.label),
    voice: residue.voice,
    unsaid: place(residue.unsaid, "unsaid", (u) => u.text),
    inferred: place(residue.inferred, "inferred", (i) => i.content),
  });

  return { extraction, dropped };
}
