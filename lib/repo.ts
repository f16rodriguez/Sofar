// Single access path for answers.transcript and chapters.body_md (SPEC §7):
// app-level per-user encryption is P1 and lands in encode/decode below
// without touching callers. No other module may read or write these columns.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TranscriptSegment } from "./stt";

// P1: per-user key encryption goes here.
const encode = (plain: string | null): string | null => plain;
const decode = (stored: string | null): string | null => stored;

// --- answers ----------------------------------------------------------------

export interface NewAnswer {
  userId: string;
  sessionId?: string;
  questionId?: string;
  audioPath?: string;
  transcript?: string;
  segments?: TranscriptSegment[];
  durationSec?: number;
  input?: "voice" | "text";
}

export interface AnswerRow {
  id: string;
  user_id: string;
  session_id: string | null;
  question_id: string | null;
  audio_path: string | null;
  transcript: string | null;
  segments: TranscriptSegment[] | null;
  duration_sec: number | null;
  input: "voice" | "text";
  processed_at: string | null;
  audio_deleted_at: string | null;
  created_at: string;
}

export async function createAnswer(
  db: SupabaseClient,
  answer: NewAnswer,
): Promise<{ id: string }> {
  const { data, error } = await db
    .from("answers")
    .insert({
      user_id: answer.userId,
      session_id: answer.sessionId ?? null,
      question_id: answer.questionId ?? null,
      audio_path: answer.audioPath ?? null,
      transcript: encode(answer.transcript ?? null),
      segments: answer.segments ?? null,
      duration_sec: answer.durationSec ?? null,
      input: answer.input ?? "voice",
    })
    .select("id")
    .single();
  if (error) throw new Error(`createAnswer failed: ${error.code ?? error.message}`);
  return { id: data.id };
}

export async function getAnswer(
  db: SupabaseClient,
  id: string,
): Promise<AnswerRow | null> {
  const { data, error } = await db
    .from("answers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getAnswer failed: ${error.code ?? error.message}`);
  if (!data) return null;
  return { ...data, transcript: decode(data.transcript) } as AnswerRow;
}

export async function setTranscript(
  db: SupabaseClient,
  id: string,
  transcript: string,
  segments: TranscriptSegment[],
  durationSec?: number,
): Promise<void> {
  const { error } = await db
    .from("answers")
    .update({
      transcript: encode(transcript),
      segments,
      // Measured by the transcriber (SPEC §2). Retention, the session clock
      // and any later question about how long someone actually spoke all
      // read this; nothing else records it.
      ...(typeof durationSec === "number" ? { duration_sec: Math.round(durationSec) } : {}),
      processed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(`setTranscript failed: ${error.code ?? error.message}`);
}

// --- chapters (body_md goes through here for the same reason) ---------------

export interface NewChapter {
  userId: string;
  title: string;
  bodyMd: string;
  kind?: "prologue" | "chapter" | "interlude" | "sofar";
  number?: number;
  model?: string;
  sourceAnswerIds?: string[];
  sourceMemoryIds?: string[];
}

export async function createChapter(
  db: SupabaseClient,
  chapter: NewChapter,
): Promise<{ id: string }> {
  const { data, error } = await db
    .from("chapters")
    .insert({
      user_id: chapter.userId,
      title: chapter.title,
      body_md: encode(chapter.bodyMd),
      kind: chapter.kind ?? "chapter",
      number: chapter.number ?? null,
      model: chapter.model ?? null,
      source_answer_ids: chapter.sourceAnswerIds ?? [],
      source_memory_ids: chapter.sourceMemoryIds ?? [],
      word_count: chapter.bodyMd.split(/\s+/).filter(Boolean).length,
    })
    .select("id")
    .single();
  if (error) throw new Error(`createChapter failed: ${error.code ?? error.message}`);
  return { id: data.id };
}

export async function getChapterBody(
  db: SupabaseClient,
  id: string,
): Promise<string | null> {
  const { data, error } = await db
    .from("chapters")
    .select("body_md")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getChapterBody failed: ${error.code ?? error.message}`);
  return data ? decode(data.body_md) : null;
}
