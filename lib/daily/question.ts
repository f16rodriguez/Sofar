// Daily question generator (SPEC §3.4, §5.6; M4). Haiku picks one question
// from open threads, contradictions and gaps. The hard rules are enforced
// here, in code, after the model answers: no mention of the book, one
// question, asks for a specific, no repeat in sixty days. A question that
// fails is asked for again once, with the reason; if that fails too there is
// no question today. The seed bank is founder-supplied and is not invented
// here (CLAUDE.md).

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { complete, loadPrompt } from "../llm";
import { log } from "../log";
import { localDate, safeZone } from "./time";
import { placeKey, repeats } from "./topics";
import { journey } from "../journey";

export const DailyQuestionSchema = z.object({
  question: z.string(),
  kind: z.enum(["event", "stance", "rationale"]),
  thread_id: z.string().nullable(),
  why_one_line: z.string(),
});

const FORBIDDEN = /\b(book|books|chapter|chapters|page|pages|story|stories|interview|interviews|manuscript|writing|written|app)\b/i;
const MAX_WORDS = 25;
const NO_REPEAT_DAYS = 60;
/** A thread, a place, or a subject asked about this recently is rested. */
const REST_DAYS = 14;
/** This many daily questions in a row with no answer, and the person has gone quiet. */
export const QUIET_AFTER = 3;

export interface DailyQuestionResult {
  created: boolean;
  question?: string;
  questionId?: string;
  reason?: string;
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * Why a question fails the hard rules, or null when it passes. `recent` is
 * everything asked in sixty days (no exact repeat); `resting` is what was
 * asked in the last two weeks (no return to the same subject).
 */
export function ruleFailure(question: string, recent: string[], resting: string[] = []): string | null {
  const q = question.trim();
  if (!q.endsWith("?")) return "must be one question ending in a question mark";
  if ((q.match(/\?/g) ?? []).length > 1) return "one question, not two";
  if (q.split(/\s+/).length > MAX_WORDS) return `under ${MAX_WORDS} words`;
  const hit = q.match(FORBIDDEN);
  if (hit) return `must not mention "${hit[0]}"`;
  const n = normalize(q);
  if (recent.some((r) => normalize(r) === n)) return "repeats a recent question";
  const circled = repeats(q, resting);
  if (circled) return `too close to a question from the last two weeks ("${circled}") — pick a different subject`;
  return null;
}

export async function generateDailyQuestion(
  db: SupabaseClient,
  opts: { userId: string; dryRun?: boolean; now?: Date },
): Promise<DailyQuestionResult> {
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - NO_REPEAT_DAYS * 86_400_000).toISOString();

  const [profileQ, threadsQ, stancesQ, placesQ, recentQ] = await Promise.all([
    db.from("users").select("birthplace, current_city, prior_cities, occupation, household, timezone").eq("id", opts.userId).maybeSingle(),
    db
      .from("memory_threads")
      .select("id, label, description, mention_count, last_seen_at")
      .eq("user_id", opts.userId)
      .eq("status", "open")
      .eq("off_record", false)
      .order("mention_count", { ascending: false })
      .limit(20),
    db.from("memory_stances").select("id, statement, superseded_by").eq("user_id", opts.userId),
    db.from("memory_places").select("label").eq("user_id", opts.userId),
    db
      .from("questions")
      .select("text, created_at, thread_id")
      .eq("user_id", opts.userId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(60),
  ]);
  for (const q of [profileQ, threadsQ, stancesQ, placesQ, recentQ]) {
    if (q.error) throw new Error(`daily question read failed: ${q.error.code ?? q.error.message}`);
  }

  // Today's already exists? One a day.
  const zone = safeZone(profileQ.data?.timezone);
  const today = localDate(now, zone);
  const { data: existing } = await db
    .from("questions")
    .select("id, text, created_at")
    .eq("user_id", opts.userId)
    .eq("block", "daily")
    .gte("created_at", new Date(now.getTime() - 36 * 3_600_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(3);
  const todays = (existing ?? []).find((q) => localDate(new Date(q.created_at as string), zone) === today);
  if (todays) return { created: false, questionId: todays.id as string, question: todays.text as string, reason: "already asked today" };

  // Rest what was asked about in the last two weeks, so the model is not
  // offered the same ten subjects every morning (lib/daily/topics.ts).
  const restFrom = now.getTime() - REST_DAYS * 86_400_000;
  const lately = (recentQ.data ?? []).filter((q) => new Date(q.created_at as string).getTime() >= restFrom);
  const resting = lately.map((q) => String(q.text));
  const restingThreads = new Set(lately.map((q) => q.thread_id as string | null).filter(Boolean));
  const restingText = resting.map(normalize).join(" | ");

  const threads = (threadsQ.data ?? []).filter(
    (t) => !/^(Missing|Ask):/.test(String(t.description ?? "")) && !restingThreads.has(t.id as string),
  );
  const stances = stancesQ.data ?? [];
  const byId = new Map(stances.map((s) => [s.id as string, s]));
  const contradictions = stances
    .filter((s) => s.superseded_by && byId.has(s.superseded_by as string))
    .map((s) => `- used to say: ${s.statement}\n  now says: ${byId.get(s.superseded_by as string)!.statement}`);
  const storied = new Set((placesQ.data ?? []).map((p) => normalize(String(p.label))));
  const foundations = profileQ.data;
  const gaps: string[] = [];
  const gap = (label: string, value: string | null | undefined) => {
    if (!value || storied.has(normalize(value))) return;
    const key = placeKey(value);
    if (key && restingText.includes(key)) return;
    gaps.push(`- ${label}: ${value}`);
  };
  gap("born in", foundations?.birthplace);
  gap("lives in", foundations?.current_city);
  for (const c of foundations?.prior_cities ?? []) gap("lived in", c);
  if (foundations?.occupation) gaps.push(`- work: ${foundations.occupation}`);
  if (foundations?.household) gaps.push(`- lives with: ${foundations.household}`);
  const recent = (recentQ.data ?? []).map((q) => String(q.text));

  const prompt = [
    `OPEN THREADS\n${threads.map((t) => `- [${t.id}] ${t.label}${t.description ? ` — ${String(t.description).replace(/\s+/g, " ").slice(0, 160)}` : ""} (×${t.mention_count})`).join("\n") || "(none)"}`,
    "",
    `CONTRADICTIONS\n${contradictions.join("\n") || "(none)"}`,
    "",
    `GAPS — given, never storied\n${gaps.join("\n") || "(none)"}`,
    "",
    `THE LAST FOURTEEN QUESTIONS\n${recent.slice(0, 14).map((q) => `- ${q}`).join("\n") || "(none yet)"}`,
  ].join("\n");

  let feedback = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const out = await complete<z.infer<typeof DailyQuestionSchema>>({
      task: "daily_question",
      system: loadPrompt("daily-question.v2"),
      prompt: feedback ? `${prompt}\n\nREJECTED: ${feedback}. Ask a different one.` : prompt,
      schema: DailyQuestionSchema,
      maxTokens: 600,
    });
    const failure = ruleFailure(out.question, recent, resting);
    if (failure) {
      feedback = failure;
      continue;
    }
    const threadId = out.thread_id && threads.some((t) => t.id === out.thread_id) ? out.thread_id : null;
    if (opts.dryRun) return { created: false, question: out.question.trim(), reason: `dry run (${out.kind}${threadId ? ", thread" : ""}) — ${out.why_one_line}` };

    const { data, error } = await db
      .from("questions")
      .insert({
        user_id: opts.userId,
        kind: out.kind,
        block: "daily",
        text: out.question.trim(),
        source: threadId ? "thread" : "generated",
        thread_id: threadId,
        asked_at: now.toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(`question insert failed: ${error.code ?? error.message}`);
    log.info("daily.question", { userId: opts.userId, kind: out.kind, thread: Boolean(threadId) });
    return { created: true, question: out.question.trim(), questionId: data.id as string };
  }
  log.info("daily.question.none", { userId: opts.userId, reason: feedback });
  return { created: false, reason: `no question passed the rules today (${feedback})` };
}

/**
 * Whether to write this person a question this morning.
 *
 * Not before the first interview is over: Today shows the interview until
 * then, so the question would go unseen. And not once they have gone quiet —
 * the last three asked, none answered. Over three weeks the founder was asked
 * twenty-four questions nobody read. Asking into silence pays for a model
 * call and an email a day and teaches the inbox to file us as noise. Coming
 * back to Today and asking for one (AskNow) starts them again: the next
 * answer breaks the run.
 */
export async function shouldAsk(db: SupabaseClient, userId: string): Promise<{ ask: boolean; reason?: string }> {
  const where = await journey(db, userId);
  if (where.stage !== "book") return { ask: false, reason: `still in ${where.stage}` };
  if (await isQuiet(db, userId)) return { ask: false, reason: "quiet" };
  return { ask: true };
}

/** The last QUIET_AFTER daily questions went unanswered. */
export async function isQuiet(db: SupabaseClient, userId: string): Promise<boolean> {
  const { data: asked, error } = await db
    .from("questions")
    .select("id")
    .eq("user_id", userId)
    .eq("block", "daily")
    .order("created_at", { ascending: false })
    .limit(QUIET_AFTER);
  if (error) throw new Error(`quiet check failed: ${error.code ?? error.message}`);
  if ((asked ?? []).length < QUIET_AFTER) return false;
  const { count } = await db
    .from("answers")
    .select("id", { count: "exact", head: true })
    .in("question_id", (asked ?? []).map((q) => q.id as string));
  return (count ?? 0) === 0;
}

/** The daily question on the person's local date, if one exists, and whether it has an answer. */
export async function todaysQuestion(
  db: SupabaseClient,
  userId: string,
  timeZone: string,
  now = new Date(),
): Promise<{ id: string; text: string; answered: boolean; transcript: string | null } | null> {
  const today = localDate(now, safeZone(timeZone));
  const { data } = await db
    .from("questions")
    .select("id, text, created_at")
    .eq("user_id", userId)
    .eq("block", "daily")
    .gte("created_at", new Date(now.getTime() - 36 * 3_600_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(3);
  const q = (data ?? []).find((row) => localDate(new Date(row.created_at as string), safeZone(timeZone)) === today);
  if (!q) return null;
  const { data: answer } = await db
    .from("answers")
    .select("transcript")
    .eq("question_id", q.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { id: q.id as string, text: q.text as string, answered: Boolean(answer), transcript: (answer?.transcript as string | null) ?? null };
}
