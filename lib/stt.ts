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

export async function transcribe(
  audio: Uint8Array | ArrayBuffer,
  mimeType = "audio/webm",
): Promise<Transcription> {
  const apiKey = requireEnv("DEEPGRAM_API_KEY");
  const body = audio instanceof ArrayBuffer ? new Uint8Array(audio) : audio;

  const res = await fetch(DEEPGRAM_URL, {
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
