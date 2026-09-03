// Interview session orchestration (SPEC §3.3, §4, §5.1).
//
// One turn of an interview: an answer arrives, it is transcribed and stored,
// the machine decides what happens next, and the interviewer words it. The
// state machine owns time and sequence; the model owns wording and the
// judgement of whether an answer was thin.
//
// Headless by design — no browser, no React. M2's UI calls these functions,
// and so does a terminal harness, which is how the interview gets tested
// without spending an API call on a rendering bug.

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { complete, loadPrompt } from "../llm";
import { createAnswer, setTranscript } from "../repo";
import { transcribe } from "../stt";
import {
  decide,
  advance,
  spend,
  initialState,
  type Move,
  type SeedQuestion,
  type SessionState,
} from "./machine";

export const InterviewerOutputSchema = z.object({
  next_question: z.string(),
  is_followup: z.boolean(),
  quoted_phrase: z.string().nullable(),
  block: z.string(),
  announce_last: z.boolean(),
});

/** The model's read of the answer just given — never of the person. */
export const AnswerReadSchema = z.object({
  thin: z
    .boolean()
    .describe("A summary where a moment was asked for, or no day, place, person, number or spoken words in it."),
  declined: z
    .boolean()
    .describe("They said skip, pass, or otherwise refused this topic."),
});

export interface Turn {
  question: string;
  is_followup: boolean;
  announce_last: boolean;
  state: SessionState;
  done: boolean;
}

export async function startSession(
  db: SupabaseClient,
  userId: string,
  kind: "onboarding" | "interview" | "daily" | "weekly" = "onboarding",
): Promise<{ sessionId: string; state: SessionState }> {
  const state = initialState();
  const { data, error } = await db
    .from("sessions")
    .insert({ user_id: userId, kind, started_at: new Date().toISOString(), state })
    .select("id")
    .single();
  if (error) throw new Error(`startSession failed: ${error.code ?? error.message}`);
  return { sessionId: data.id, state };
}

export async function loadSeeds(db: SupabaseClient): Promise<SeedQuestion[]> {
  const { data, error } = await db
    .from("questions")
    .select("id, block, text, order_idx")
    .is("user_id", null)
    .eq("source", "seed")
    .order("order_idx");
  if (error) throw new Error(`loadSeeds failed: ${error.code ?? error.message}`);
  return (data ?? []) as SeedQuestion[];
}

/**
 * Record one answer: store the audio path, transcribe, write the transcript
 * through the repository (never directly), and debit the clock.
 */
export async function recordAnswer(
  db: SupabaseClient,
  opts: {
    userId: string;
    sessionId: string;
    questionId?: string;
    state: SessionState;
    audio?: { bytes: Uint8Array; mimeType: string; path: string };
    text?: string;
  },
): Promise<{ answerId: string; transcript: string; state: SessionState }> {
  const { id: answerId } = await createAnswer(db, {
    userId: opts.userId,
    sessionId: opts.sessionId,
    questionId: opts.questionId,
    audioPath: opts.audio?.path,
    input: opts.audio ? "voice" : "text",
  });

  let transcript = opts.text ?? "";
  let seconds = 0;
  if (opts.audio) {
    const result = await transcribe(opts.audio.bytes, opts.audio.mimeType);
    transcript = result.text;
    seconds = result.durationSec;
    await setTranscript(db, answerId, transcript, result.segments);
  } else {
    // Typed answers still cost the clock something; estimate at reading pace.
    seconds = Math.max(5, Math.round(transcript.split(/\s+/).length / 2.5));
    await setTranscript(db, answerId, transcript, []);
  }

  return { answerId, transcript, state: spend(opts.state, seconds) };
}

/** Was that answer thin, and did they decline? Haiku — a classification. */
async function readAnswer(question: string, answer: string) {
  if (answer.trim().length === 0) return { thin: true, declined: false };
  return complete({
    task: "interviewer",
    system: [
      "You judge one answer against one question. Two booleans, nothing else.",
      "You are not evaluating the person. You are not evaluating the answer's",
      "worth. You are deciding whether the interviewer has what it asked for.",
    ].join("\n"),
    prompt: `QUESTION\n${question}\n\nANSWER\n${answer}`,
    schema: AnswerReadSchema,
    maxTokens: 512,
    includePreamble: false,
  });
}

/**
 * Decide and word the next question. The machine decides *what* happens; the
 * interviewer prompt decides *how it is said*. A seed question is asked
 * verbatim and never goes through the model — the script is founder-authored
 * and paraphrasing it is not the model's job.
 */
export async function nextTurn(
  db: SupabaseClient,
  opts: {
    state: SessionState;
    seeds: SeedQuestion[];
    lastQuestion?: string;
    lastAnswer?: string;
    recentTurns?: { question: string; answer: string }[];
    /** A live angle from the editor (D4), when one has been found. */
    angle?: string;
  },
): Promise<Turn> {
  const read =
    opts.lastQuestion && opts.lastAnswer !== undefined
      ? await readAnswer(opts.lastQuestion, opts.lastAnswer)
      : { thin: false, declined: false };

  const move: Move = decide({
    state: opts.state,
    seeds: opts.seeds,
    lastAnswerThin: read.thin,
    lastAnswerDeclined: read.declined,
    angle: opts.angle,
  });

  if (move.kind === "end") {
    return {
      question: "",
      is_followup: false,
      announce_last: false,
      state: opts.state,
      done: true,
    };
  }

  const state = advance(opts.state, move);

  // Seed questions are asked exactly as written.
  if (move.kind === "next" || move.kind === "skip_block") {
    return {
      question: move.question.text,
      is_followup: false,
      announce_last: false,
      state,
      done: false,
    };
  }
  if (move.kind === "final") {
    return {
      question: move.question.text,
      is_followup: false,
      announce_last: true,
      state,
      done: false,
    };
  }

  // Follow-ups and depth questions are generated, and must quote the person.
  const context = (opts.recentTurns ?? [])
    .slice(-3)
    .map((t) => `Q: ${t.question}\nA: ${t.answer}`)
    .join("\n\n");

  const worded = await complete({
    task: "interviewer",
    system: loadPrompt("interviewer"),
    prompt: [
      `STATE\n${JSON.stringify({
        block: state.block,
        followups_used: state.followups_used,
        seconds_left: state.seconds_left,
        mode: move.kind,
      })}`,
      "",
      move.kind === "depth"
        ? `LIVE ANGLE — chase this\n${move.angle}`
        : `SEED QUESTION AT THIS POSITION\n${move.question.text}`,
      "",
      `LAST FEW TURNS\n${context}`,
    ].join("\n"),
    schema: InterviewerOutputSchema,
    maxTokens: 1024,
  });

  return {
    question: worded.next_question,
    is_followup: worded.is_followup,
    announce_last: worded.announce_last,
    state,
    done: false,
  };
}

export async function saveState(
  db: SupabaseClient,
  sessionId: string,
  state: SessionState,
): Promise<void> {
  const { error } = await db.from("sessions").update({ state }).eq("id", sessionId);
  if (error) throw new Error(`saveState failed: ${error.code ?? error.message}`);
}

export async function endSession(
  db: SupabaseClient,
  sessionId: string,
  state: SessionState,
): Promise<void> {
  const { error } = await db
    .from("sessions")
    .update({
      state,
      status: "processing",
      ended_at: new Date().toISOString(),
      minutes: Number(((1080 - state.seconds_left) / 60).toFixed(2)),
    })
    .eq("id", sessionId);
  if (error) throw new Error(`endSession failed: ${error.code ?? error.message}`);
}
