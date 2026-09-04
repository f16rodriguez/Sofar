// M6 acceptance (SPEC §8): delete leaves zero rows and zero storage objects
// for the user; an audio file older than 60 days is gone the next morning.
// (Export is covered by scripts/export-test.ts against a running server.)
//
// Throwaway users, tiny fixture audio, no LLM calls. Cleans up after itself.
//
//   set -a; . ./.env.local; set +a; npm run accept:m6

import { serviceClient } from "../lib/supabase";
import { runAudioRetention, runAccountDeletions, enqueueAccountDeletion, listUserObjects } from "../lib/jobs";

const results: { name: string; ok: boolean; detail?: string }[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const DAY = 86_400_000;
const TABLES = [
  "users", "sessions", "questions", "answers", "memory_people", "memory_places", "memory_events",
  "memory_stances", "memory_costs", "memory_voice", "memory_unsaid", "memory_inferred", "parts",
  "chapters", "chapter_revisions", "marks", "push_subscriptions", "deletion_jobs",
];

async function makeUser(db: ReturnType<typeof serviceClient>, tag: string, keepAudio: boolean) {
  const email = `m6-${tag}-${Date.now()}@example.com`;
  const { data, error } = await db.auth.admin.createUser({ email, password: crypto.randomUUID(), email_confirm: true });
  if (error || !data.user) throw new Error(`auth user: ${error?.message}`);
  const id = data.user.id;
  const { error: pe } = await db.from("users").insert({ id, email, keep_audio: keepAudio });
  if (pe) throw new Error(`profile: ${pe.message}`);
  return id;
}

/** An answer with a real (tiny) audio object, backdated `ageDays`. */
async function makeAnswer(db: ReturnType<typeof serviceClient>, userId: string, ageDays: number) {
  const path = `${userId}/session/${Date.now()}-${Math.random().toString(36).slice(2)}.webm`;
  const { error: up } = await db.storage.from("answer-audio").upload(path, new Uint8Array([26, 69, 223, 163, 0]), { contentType: "audio/webm" });
  if (up) throw new Error(`upload: ${up.message}`);
  const { data, error } = await db
    .from("answers")
    .insert({ user_id: userId, audio_path: path, transcript: "fixture", input: "voice", created_at: new Date(Date.now() - ageDays * DAY).toISOString() })
    .select("id")
    .single();
  if (error || !data) throw new Error(`answer: ${error?.message}`);
  return { id: data.id as string, path };
}

async function rowsFor(db: ReturnType<typeof serviceClient>, userId: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of TABLES) {
    const col = t === "users" ? "id" : "user_id";
    const { count, error } = await db.from(t).select("*", { count: "exact", head: true }).eq(col, userId);
    if (error) throw new Error(`${t}: ${error.message}`);
    if ((count ?? 0) > 0) out[t] = count ?? 0;
  }
  return out;
}

async function main() {
  const db = serviceClient();
  const created: string[] = [];
  try {
    // --- retention -----------------------------------------------------------
    const forgetful = await makeUser(db, "forget", false);
    const keeper = await makeUser(db, "keep", true);
    created.push(forgetful, keeper);
    const old = await makeAnswer(db, forgetful, 61);
    const fresh = await makeAnswer(db, forgetful, 3);
    const kept = await makeAnswer(db, keeper, 200);

    const dry = await runAudioRetention(db, { dryRun: true });
    check("dry run counts the one recording past 60 days", dry.candidates >= 1 && dry.deleted === 0, `${dry.candidates} candidate(s)`);

    const run = await runAudioRetention(db);
    check("retention deletes it", run.deleted >= 1 && run.failed === 0, `${run.deleted} deleted`);

    const exists = async (p: string) => {
      const dir = p.slice(0, p.lastIndexOf("/"));
      const name = p.slice(p.lastIndexOf("/") + 1);
      const { data } = await db.storage.from("answer-audio").list(dir);
      return (data ?? []).some((e) => e.name === name);
    };
    check("the old object is gone from storage", !(await exists(old.path)));
    const { data: oldRow } = await db.from("answers").select("audio_deleted_at, transcript").eq("id", old.id).single();
    check("audio_deleted_at is set; the transcript stays", Boolean(oldRow?.audio_deleted_at) && oldRow?.transcript === "fixture");
    check("a three-day-old recording stays", await exists(fresh.path));
    check("a kept recording stays, however old", await exists(kept.path));

    // --- deletion ------------------------------------------------------------
    const { error: chErr } = await db.from("chapters").insert({ user_id: forgetful, title: "Gone", kind: "chapter", number: 1, body_md: "x", source_memory_ids: [] });
    if (chErr) throw new Error(`chapter: ${chErr.message}`);
    const before = await rowsFor(db, forgetful);
    const objectsBefore = await listUserObjects(db, forgetful);
    check("fixture user has rows and objects to delete", Object.keys(before).length >= 3 && objectsBefore.length >= 1, `${JSON.stringify(before)} · ${objectsBefore.length} object(s)`);

    await enqueueAccountDeletion(db, forgetful);
    await enqueueAccountDeletion(db, forgetful);
    const { count: jobs } = await db.from("deletion_jobs").select("*", { count: "exact", head: true }).eq("user_id", forgetful).eq("status", "pending");
    check("asking twice enqueues once", jobs === 1, `${jobs} job(s)`);

    const del = await runAccountDeletions(db);
    check("deletion job runs", del.deleted >= 1 && del.failed === 0, `${del.deleted} deleted, ${del.failed} failed`);
    const after = await rowsFor(db, forgetful);
    check("zero rows remain in every table", Object.keys(after).length === 0, JSON.stringify(after));
    const objectsAfter = await listUserObjects(db, forgetful);
    check("zero storage objects remain", objectsAfter.length === 0, `${objectsAfter.length}`);
    const { data: authRow } = await db.auth.admin.getUserById(forgetful);
    check("auth user is gone", !authRow?.user);
    created.splice(created.indexOf(forgetful), 1);

    // The keeper was never asked to be deleted.
    const keeperRows = await rowsFor(db, keeper);
    check("another user is untouched", (keeperRows.users ?? 0) === 1 && (keeperRows.answers ?? 0) === 1);
  } finally {
    for (const id of created) {
      const objects = await listUserObjects(db, id).catch(() => [] as string[]);
      if (objects.length > 0) await db.storage.from("answer-audio").remove(objects);
      await db.auth.admin.deleteUser(id);
    }
    console.log(`\ncleanup: ${created.length} fixture user(s) deleted`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\nM6 acceptance (delete + retention): ${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(`m6-accept: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
