// Sofar pipeline CLI (SPEC §8, M1):
//
//   sofar run --transcript file.txt --user <id>
//
// transcript → extraction → merge → three chapters → DB, and prints them.
// Idempotent: running twice on the same transcript must not duplicate memory
// rows or pile up chapters.
//
//   npm run sofar -- run --transcript transcripts/x.txt --user <uuid>

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { serviceClient } from "../lib/supabase";
import { usage, loadPrompt } from "../lib/llm";
import { createAnswer } from "../lib/repo";
import { extract, clean } from "../lib/pipeline/extract";
import { merge } from "../lib/pipeline/merge";
import * as memory from "../lib/memory";
import {
  findAngles,
  writeChapter,
  type Foundations,
  type MemoryRow,
  type PersonRow,
} from "../lib/pipeline/chapter";

try {
  process.loadEnvFile(".env.local");
} catch {
  // fall back to the ambient environment
}

// phase0 §5 — the three chapters of session one, and how each opens and closes.
// Each is a slot the editor fills with an angle drawn from across the whole
// record. Draft one passed every row to every chapter and got one chapter
// written three times; draft two walled each chapter into its own interview
// block and got three lists. Selection is by angle now (D3).
const OUTLINES = [
  {
    kind: "prologue" as const,
    number: 0,
    label: "Prologue",
    slot: "prologue" as const,
    outline: [
      "PROLOGUE — Now. Built from what the subject said about the present:",
      "yesterday, the thought they keep circling, who they talk to.",
      "Open in scene: a real moment from yesterday, a real time, a real place.",
      "Establish the narrator's voice and the thought they cannot put down.",
      "End on a gap in the subject's own account of yesterday — a thing they",
      "said they left out — if the record holds one. Otherwise end on the",
      "thought they keep circling, left open. Never end on a refusal: refusals",
      "are not in the record and must not be written.",
    ].join("\n"),
  },
  {
    kind: "chapter" as const,
    number: 1,
    label: "Chapter I",
    slot: "decision" as const,
    outline: [
      "CHAPTER I — The decision. Built from the most recent turning point.",
      "Open on the moment of deciding, not the backstory that led to it.",
      "Who they told, and what they left out when they told them.",
      "End on the gap between what they expected and what actually happened.",
    ].join("\n"),
  },
  {
    kind: "chapter" as const,
    number: 2,
    label: "Chapter II",
    slot: "certainty" as const,
    outline: [
      "CHAPTER II — What he knows. Built from the certainties and what came",
      "before them. Open on the certainty itself, in the subject's own phrasing.",
      "Go back to the day it was learned, then to the earliest memory that",
      "connects. End with the person who would tell it differently — unresolved.",
      "If the record is thin on origin, stay thin. Do not manufacture a memory.",
    ].join("\n"),
  },
];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function run() {
  const file = arg("transcript");
  const userId = arg("user");
  if (!file || !userId) {
    console.error("usage: sofar run --transcript <file> --user <uuid>");
    process.exit(1);
  }

  const transcript = fs.readFileSync(file, "utf8");
  const db = serviceClient();

  // --- foundations ------------------------------------------------------
  const { data: user, error: userError } = await db
    .from("users")
    .select("*")
    .eq("id", userId)
    .single();
  if (userError || !user) {
    throw new Error(`no such user: ${userId}`);
  }
  const foundations: Foundations = {
    book_name: user.book_name,
    pronoun: user.pronoun ?? "they",
    age: user.age,
    birthplace: user.birthplace,
    current_city: user.current_city,
    prior_cities: user.prior_cities ?? [],
    occupation: user.occupation,
    household: user.household,
    family_of_origin: user.family_of_origin,
    style: user.style ?? "third",
  };

  // --- answer row: reuse if this exact transcript is already on record ----
  const { data: priorAnswers } = await db
    .from("answers")
    .select("id, transcript")
    .eq("user_id", userId)
    .eq("input", "text");
  const prior = (priorAnswers ?? []).find(
    (a: { transcript: string | null }) => a.transcript === transcript,
  );
  const answerId =
    prior?.id ??
    (await createAnswer(db, { userId, transcript, input: "text" })).id;
  console.log(
    prior ? `answer: reusing ${answerId}` : `answer: created ${answerId}`,
  );

  // --- extraction (Opus for onboarding, SPEC §5.2) ------------------------
  // Cached on disk, keyed by transcript + extraction prompt, so a failure
  // downstream (an overloaded chapter call, a bad outline) never re-bills the
  // extraction. Lives under transcripts/, which is git-ignored: it is derived
  // from personal data and stays with it. --no-cache forces a fresh pass.
  const cacheKey = crypto
    .createHash("sha256")
    .update(transcript)
    .update(loadPrompt("extraction"))
    .digest("hex")
    .slice(0, 16);
  const cacheFile = path.join("transcripts", ".cache", `${cacheKey}.extraction.json`);
  let extraction: Awaited<ReturnType<typeof extract>>["extraction"];
  let dropped: Awaited<ReturnType<typeof extract>>["dropped"];

  if (!process.argv.includes("--no-cache") && fs.existsSync(cacheFile)) {
    ({ extraction, dropped } = clean(JSON.parse(fs.readFileSync(cacheFile, "utf8"))));
    console.log(`extraction: cached (${cacheFile})`);
  } else {
    console.log("extracting…");
    ({ extraction, dropped } = await extract({
      transcript,
      model: "opus",
      onProgress: (pass) => console.log(`  ✓ ${pass}`),
    }));
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify({ extraction, dropped }));
  }
  const counts = Object.entries({
    people: extraction.people.length,
    places: extraction.places.length,
    events: extraction.events.length,
    stances: extraction.stances.length,
    costs: extraction.costs.length,
    threads: extraction.open_threads.length,
    unsaid: extraction.unsaid.length,
    inferred: extraction.inferred.length,
  })
    .map(([k, v]) => `${k} ${v}`)
    .join(", ");
  console.log(`  ${counts}`);
  console.log(`  cost so far: ${usage.summary()}`);
  if (dropped.length > 0) {
    console.log(`  dropped ${dropped.length} item(s) whose span did not support them:`);
    for (const d of dropped) console.log(`    - ${d.kind}: ${d.label} (${d.reason})`);
  }

  // --- merge --------------------------------------------------------------
  console.log("merging…");
  const merged = await merge(db, userId, answerId, extraction);
  console.log(`  created: ${JSON.stringify(merged.created)}`);
  console.log(`  matched existing: ${JSON.stringify(merged.matched)}`);

  // --- gather the memory layer for the editor -----------------------------
  // Every row this transcript produced or matched. The editor reads all of
  // it; the writer receives only what the editor kept for one angle.
  const placedIds = new Set(merged.placed.map((r) => r.id));

  const [people, places, events, stances, costs, voiceRow] = await Promise.all([
    db.from("memory_people").select("*").eq("user_id", userId),
    db.from("memory_places").select("*").eq("user_id", userId),
    db.from("memory_events").select("*").eq("user_id", userId),
    db.from("memory_stances").select("*").eq("user_id", userId),
    db.from("memory_costs").select("*").eq("user_id", userId),
    db.from("memory_voice").select("profile").eq("user_id", userId).maybeSingle(),
  ]);

  const personRows: PersonRow[] = (people.data ?? []).map((p) => ({
    id: p.id,
    label: p.label,
    relationship: p.relationship,
    quotes: Array.isArray(p.quotes) ? p.quotes : [],
    may_name_in_prose: p.may_name_in_prose,
    prose_reference: p.prose_reference,
  }));

  // memory_inferred and memory_unsaid are deliberately absent: nothing
  // inferred reaches prose (CLAUDE.md non-negotiable).
  const rows: MemoryRow[] = [
    ...(places.data ?? []).map((r) => ({
      id: r.id,
      kind: "place",
      text: [r.label, r.when_text, r.what_happened].filter(Boolean).join(" — "),
      quote: r.source_quote ?? undefined,
    })),
    ...(events.data ?? []).map((r) => ({
      id: r.id,
      kind: "event",
      text: [r.what, r.when_text, r.where_text, r.outcome]
        .filter(Boolean)
        .join(" — "),
      quote: r.source_quote ?? undefined,
    })),
    ...(stances.data ?? []).map((r) => ({
      id: r.id,
      kind: "stance",
      text: [r.statement, r.rationale].filter(Boolean).join(" — because "),
      quote: r.source_quote ?? undefined,
    })),
    ...(costs.data ?? []).map((r) => ({
      id: r.id,
      kind: "cost",
      text: r.what_it_cost,
      quote: r.source_quote ?? undefined,
    })),
  ];
  const placedRows = rows.filter((r) => placedIds.has(r.id));
  console.log(`memory layer: ${placedRows.length} rows + ${personRows.length} people`);

  // --- the editor: angles across the whole record --------------------------
  // Where do the facts intersect? Each angle is writable now or names what is
  // missing and the one question that would get it. Unwritable angles go to
  // memory_threads, which the daily question generator reads (SPEC §5.6).
  const { data: declinedRows } = await db
    .from("memory_threads")
    .select("label")
    .eq("user_id", userId)
    .eq("off_record", true);
  const declined = (declinedRows ?? []).map((t: { label: string }) => t.label);
  console.log(`finding angles… (${declined.length} declined topic(s) withheld)`);
  const angles = await findAngles({ rows: placedRows, people: personRows, foundations, declined });
  const writable = angles.filter((a) => a.writable && a.rows.length > 0);
  const open = angles.filter((a) => !a.writable);
  console.log(`  ${angles.length} angle(s): ${writable.length} writable, ${open.length} need more`);
  for (const a of angles) {
    console.log(`  ${a.writable ? "✓" : "…"} ${a.slot ? `[${a.slot}] ` : ""}${a.line}`);
  }

  const needs: { chapter: string; what: string; why: string; ask: string | null }[] = [];
  const { data: existingThreads } = await db
    .from("memory_threads")
    .select("label")
    .eq("user_id", userId);
  const threadLabels = new Set(
    (existingThreads ?? []).map((t: { label: string }) => t.label.toLowerCase()),
  );
  const now = new Date().toISOString();
  for (const a of open) {
    for (const m of a.missing) needs.push({ chapter: a.line, ...m, ask: a.ask });
    const label = a.line;
    if (!threadLabels.has(label.toLowerCase())) {
      await memory.insertThreads(db, [
        {
          user_id: userId,
          label,
          description: [
            ...a.missing.map((m) => `Missing: ${m.what} — ${m.why}`),
            a.ask ? `Ask: ${a.ask}` : "",
          ]
            .filter(Boolean)
            .join(" | "),
          first_seen_at: now,
          last_seen_at: now,
        },
      ]);
      threadLabels.add(label.toLowerCase());
    }
  }

  // --- chapters (Opus, no exceptions — phase0 §5) -------------------------
  for (const spec of OUTLINES) {
    const angle = writable.find((a) => a.slot === spec.slot);
    if (!angle) {
      console.log(`${spec.label}: no writable angle fits this slot yet.`);
      console.log("");
      console.log("─".repeat(70));
      continue;
    }
    const kept = placedRows.filter((r) => angle.rows.includes(r.id));
    console.log(`${spec.label}: ${angle.line}`);
    console.log(`  ${kept.length} rows; writing…`);
    const result = await writeChapter({
      outline: spec.outline,
      story: angle.line,
      rows: kept,
      people: personRows,
      foundations,
      voice: (voiceRow.data?.profile as Record<string, unknown>) ?? {},
      model: "opus",
      onAttempt: (attempt, issues) => {
        console.log(`  attempt ${attempt} rejected — ${issues.length} issue(s)`);
        for (const i of issues) console.log(`    - ${i.detail}`);
      },
    });

    if (result.excised) {
      console.log("  ⚠ model repairs exhausted; rejected sentences cut mechanically");
    }

    const words = result.draft.body_md.split(/\s+/).filter(Boolean).length;
    const payload = {
      user_id: userId,
      number: spec.number,
      title: result.draft.title,
      kind: spec.kind,
      body_md: result.draft.body_md,
      status: "draft",
      model: result.model,
      source_answer_ids: [answerId],
      source_memory_ids: result.draft.source_memory_ids,
      word_count: words,
    };

    // Idempotent: one row per (user, kind, number); rerunning revises it.
    const { data: existing } = await db
      .from("chapters")
      .select("id, version")
      .eq("user_id", userId)
      .eq("kind", spec.kind)
      .eq("number", spec.number)
      .maybeSingle();

    if (existing) {
      await db
        .from("chapters")
        .update({ ...payload, version: existing.version + 1 })
        .eq("id", existing.id);
    } else {
      await db.from("chapters").insert(payload);
    }

    console.log(`  "${result.draft.title}" — ${words} words, ${result.attempts} attempt(s)`);
    console.log("");
    console.log(result.draft.body_md);
    console.log("");
    console.log("─".repeat(70));
  }

  if (needs.length > 0) {
    console.log("");
    console.log("WHAT THE BOOK STILL NEEDS");
    let last = "";
    for (const n of needs) {
      if (n.chapter !== last) {
        console.log(`  ${n.chapter}`);
        last = n.chapter;
      }
      console.log(`    - ${n.what}`);
      if (n.ask) console.log(`      ask: ${n.ask}`);
    }
    console.log("  (recorded as open threads for the question generator)");
  }

  console.log(`\nRUN COST: ${usage.summary()}`);
}

const command = process.argv[2];
if (command !== "run") {
  console.error("usage: sofar run --transcript <file> --user <uuid>");
  process.exit(1);
}

run().catch((err) => {
  console.error(`sofar: ${err instanceof Error ? err.message : err}`);
  console.error(`RUN COST (failed): ${usage.summary()}`);
  process.exit(1);
});
