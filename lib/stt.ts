// One batch STT provider behind a typed interface (SPEC §1):
// transcribe(audio) → { text, segments }. Provider: Deepgram Nova batch.
// Swapping providers means reimplementing this file only.

import { requireEnv } from "./env";

export interface TranscriptSegment {
  /** seconds from start of audio */
  start: number;
  end: number;
  text: string;
}

export interface Transcription {
  text: string;
  segments: TranscriptSegment[];
  durationSec: number;
}

interface DeepgramUtterance {
  start: number;
  end: number;
  transcript: string;
}

interface DeepgramResponse {
  metadata?: { duration?: number };
  results?: {
    channels?: {
      alternatives?: { transcript?: string }[];
    }[];
    utterances?: DeepgramUtterance[];
  };
}

const DEEPGRAM_URL =
  "https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true&utterances=true";

/**
 * Names the transcriber should expect. A general model renders an unfamiliar
 * proper noun as the nearest common word — a place someone moved to came back
 * as "Doctor" — and the memory layer is built almost entirely out of people
 * and places, so that error lands directly in the book. The names already in
 * a person's record are the best available prior for what they will say next.
 *
 * Capped: the terms go in the query string, and the tail of a long list is
 * worth less than a request that stays well-formed.
 */
const MAX_KEYTERMS = 40;

function withKeyterms(terms: string[]): string {
  const seen = new Set<string>();
  const usable = terms
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && t.length <= 40 && /[A-Za-z]/.test(t))
    .filter((t) => {
      const k = t.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, MAX_KEYTERMS);
  if (usable.length === 0) return DEEPGRAM_URL;
  return `${DEEPGRAM_URL}&${usable.map((t) => `keyterm=${encodeURIComponent(t)}`).join("&")}`;
}

export async function transcribe(
  audio: Uint8Array | ArrayBuffer,
  mimeType = "audio/webm",
  keyterms: string[] = [],
): Promise<Transcription> {
  const apiKey = requireEnv("DEEPGRAM_API_KEY");
  const body = audio instanceof ArrayBuffer ? new Uint8Array(audio) : audio;

  const res = await fetch(withKeyterms(keyterms), {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": mimeType,
    },
    body: body as unknown as BodyInit,
  });

  if (!res.ok) {
    // SPEC §7: no audio or transcript content in errors — status only.
    throw new Error(`STT request failed with status ${res.status}`);
  }

  const data = (await res.json()) as DeepgramResponse;
  const text =
    data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
  const durationSec = data.metadata?.duration ?? 0;

  const segments: TranscriptSegment[] =
    data.results?.utterances?.map((u) => ({
      start: u.start,
      end: u.end,
      text: u.transcript,
    })) ?? (text ? [{ start: 0, end: durationSec, text }] : []);

  return { text, segments, durationSec };
}
