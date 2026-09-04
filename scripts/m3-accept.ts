// M3 acceptance (SPEC §8): answering a question that contradicts a canon
// chapter produces exactly one proposed revision with a one-line rationale;
// declining it changes nothing.
//
// Runs on a throwaway auth user with a fictional fixture, so no real book is
// touched. One paid call: the proposer (Sonnet) plus its entailment gate —
// cents. Deleted afterwards, cascade included.
//
//   set -a; . ./.env.local; set +a; npm run accept:m3

import { serviceClient } from "../lib/supabase";
import { usage } from "../lib/llm";
import * as memory from "../lib/memory";
import {
  proposeRevision,
  decideRevision,
} from "../lib/pipeline/revision";
import type { Foundations, MemoryRow } from "../lib/pipeline/chapter";

const results: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const db = serviceClient();
  const email = `m3-${Date.now()}@example.com`;
  const { data: created, error: createError } = await db.auth.admin.createUser({
    email,
    password: `m3-accept-${crypto.randomUUID()}`,
    email_confirm: true,
  });
  if (createError || !created.user) throw new Error(`auth user: ${createError?.message}`);
  const userId = created.user.id;

  try {
    // Block 0 for a fictional person.
    const { error: profileError } = await db.from("users").insert({
      id: userId,
      email,
      book_name: "Fixture",
      pronoun: "he",
      age: 40,
      birthplace: "Providence",
      current_city: "Hartford",
      prior_cities: [],
      occupation: "dispatcher",
      household: "his wife and two kids",
      family_of_origin: "a sister",
      style: "third",
    });
    if (profileError) throw new Error(`profile: ${profileError.message}`);
    const foundations: Foundations = {
      book_name: "Fixture",
      pronoun: "he",
      age: 40,
      birthplace: "Providence",
      current_city: "Hartford",
      prior_cities: [],
      occupation: "dispatcher",
      household: "his wife and two kids",
      family_of_origin: "a sister",
      style: "third",
    };

    // What the chapter was written from.
    const [e1] = await memory.insertEvents(db, [
      {
        user_id: userId,
        what: "Left the shipping company after four years",
        when_text: "last spring",
        source_quote: "I left the shipping company last spring, after four years.",
      },
    ]);
    const [s1] = await memory.insertStances(db, [
      {
        user_id: userId,
        statement: "Leaving was the right call",
        rationale: "the hours were eating the family",
        origin_event_id: e1,
        source_quote: "It was the right call. The hours were eating the family.",
      },
    ]);
    const body =
      "He left the shipping company last spring, after four years.\n\n" +
      "He calls it the right call. The hours were eating the family.";
    const { data: chapter, error: chapterError } = await db
      .from("chapters")
      .insert({
        user_id: userId,
        number: 1,
        title: "The Spring He Left",
        kind: "chapter",
        body_md: body,
        status: "canon",
        canon_at: new Date().toISOString(),
        version: 1,
        source_memory_ids: [e1, s1],
        word_count: body.split(/\s+/).length,
      })
      .select("*")
      .single();
    if (chapterError || !chapter) throw new Error(`chapter: ${chapterError?.message}`);

    // The answer that contradicts it.
    const { data: answer } = await db
      .from("answers")
      .insert({
        user_id: userId,
        input: "text",
        transcript: "I didn't leave. They let me go in the spring. I told people I quit.",
      })
      .select("id")
      .single();
    const [e2] = await memory.insertEvents(db, [
      {
        user_id: userId,
        what: "Was let go from the shipping company; told people he quit",
        when_text: "the spring",
        answer_id: answer?.id,
        source_quote: "I didn't leave. They let me go in the spring. I told people I quit.",
      },
    ]);

    const rows: Record<string, MemoryRow> = {
      [e1]: {
        id: e1,
        kind: "event",
        text: "Left the shipping company after four years — last spring",
        quote: "I left the shipping company last spring, after four years.",
      },
      [s1]: {
        id: s1,
        kind: "stance",
        text: "Leaving was the right call — the hours were eating the family",
        quote: "It was the right call. The hours were eating the family.",
      },
      [e2]: {
        id: e2,
        kind: "event",
        text: "Was let go from the shipping company; told people he quit — the spring",
        quote: "I didn't leave. They let me go in the spring. I told people I quit.",
      },
    };

    console.log("proposing (Sonnet + entailment gate)…");
    const result = await proposeRevision(db, {
      userId,
      chapter: {
        id: chapter.id,
        title: chapter.title,
        body_md: chapter.body_md,
        source_memory_ids: [e1, s1],
      },
      newRows: [rows[e2]],
      sourceRows: [rows[e1], rows[s1]],
      people: [],
      foundations,
      triggerAnswerIds: answer ? [answer.id] : [],
    });
    check("contradiction produces a proposal", result.proposed, result.reason ?? result.rationale);

    const { data: proposals } = await db
      .from("chapter_revisions")
      .select("id, rationale, proposed_body_md, status, trigger_answer_ids")
      .eq("chapter_id", chapter.id)
      .eq("status", "proposed");
    check("exactly one proposed revision", (proposals ?? []).length === 1, `${(proposals ?? []).length}`);
    const proposal = proposals?.[0];
    const rationale = proposal?.rationale ?? "";
    check(
      "rationale is one line",
      rationale.length > 0 && !/\n/.test(rationale) && rationale.length <= 240,
      rationale,
    );
    check(
      "proposal cites the triggering answer",
      Boolean(answer && (proposal?.trigger_answer_ids ?? []).includes(answer.id)),
    );

    // A second pass with the same material must not stack a second proposal.
    const again = await proposeRevision(db, {
      userId,
      chapter: { id: chapter.id, title: chapter.title, body_md: chapter.body_md, source_memory_ids: [e1, s1] },
      newRows: [rows[e2]],
      sourceRows: [rows[e1], rows[s1]],
      people: [],
      foundations,
      triggerAnswerIds: answer ? [answer.id] : [],
    });
    check("a second pass does not open a second proposal", !again.proposed, again.reason);

    if (proposal) {
      console.log("\n  RATIONALE: " + rationale);
      console.log("  PROPOSED:\n" + proposal.proposed_body_md.split("\n").map((l: string) => "    " + l).join("\n") + "\n");

      // Snapshot, decline, compare.
      const before = {
        chapter: (await db.from("chapters").select("*").eq("id", chapter.id).single()).data,
        events: (await db.from("memory_events").select("*").eq("user_id", userId).order("id")).data,
        stances: (await db.from("memory_stances").select("*").eq("user_id", userId).order("id")).data,
      };
      const decided = await decideRevision(db, userId, proposal.id, "declined");
      check("decline is recorded", decided.ok && decided.status === "declined");
      const after = {
        chapter: (await db.from("chapters").select("*").eq("id", chapter.id).single()).data,
        events: (await db.from("memory_events").select("*").eq("user_id", userId).order("id")).data,
        stances: (await db.from("memory_stances").select("*").eq("user_id", userId).order("id")).data,
      };
      check("declining changes nothing in the chapter", JSON.stringify(before.chapter) === JSON.stringify(after.chapter));
      check(
        "declining changes nothing in memory",
        JSON.stringify(before.events) === JSON.stringify(after.events) &&
          JSON.stringify(before.stances) === JSON.stringify(after.stances),
      );
      const { data: open } = await db
        .from("chapter_revisions")
        .select("id")
        .eq("chapter_id", chapter.id)
        .eq("status", "proposed");
      check("no proposal remains open", (open ?? []).length === 0);
      const twice = await decideRevision(db, userId, proposal.id, "accepted");
      check("a decided revision cannot be decided again", !twice.ok && twice.reason === "already decided");
    }
  } finally {
    const { error } = await db.auth.admin.deleteUser(userId);
    console.log(error ? `\ncleanup failed: ${error.message}` : "\ncleanup: fixture user deleted (cascade)");
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\nM3 acceptance: ${results.length - failed.length}/${results.length} passed`);
  console.log(`RUN COST: ${usage.summary()}`);
  if (failed.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(`m3-accept: ${err instanceof Error ? err.message : err}`);
  console.error(`RUN COST (failed): ${usage.summary()}`);
  process.exit(1);
});
