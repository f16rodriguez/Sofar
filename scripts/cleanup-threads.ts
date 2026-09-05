// Retire what the memory layer should never have held (M3 follow-up).
//
// Two faults put rows in the record that are not about anyone's life:
//
//   the interview talking about itself — "Interview method challenged",
//   "Session ended early", "Basketball question rejected"
//
//   the same thread under several names — the unvisited gym arrived four
//   times, because threads were compared on their label alone
//
// Both feed the So far chapter and choose tomorrow's question, so both are
// worth clearing out of the record already written. Nothing is deleted: a
// retired thread is marked resolved, which is reversible and keeps the
// provenance intact.
//
//   set -a; . ./.env.local; set +a
//   npm run cleanup:threads -- --user <id>            # show what would change
//   npm run cleanup:threads -- --user <id> --apply    # do it

import { serviceClient } from "../lib/supabase";
import { similarity } from "../lib/pipeline/merge";
import { isAboutTheInterview, isNonAnswerStance } from "../lib/pipeline/meta";

// Threads restate each other loosely, so sameness is scored lower here than
// in the merge itself. Tunable with --same because the right line depends on
// how one person happens to talk; run it dry and look before applying.
const DEFAULT_SAME = 0.35;
const EDITOR_NEED = /^(Missing|Ask):/;

interface Thread {
  id: string;
  label: string;
  description: string | null;
  mention_count: number;
  off_record: boolean;
  status: string;
}

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const userId = arg("user");
  const apply = process.argv.includes("--apply");
  const SAME = Number(arg("same") ?? DEFAULT_SAME);
  if (!userId) {
    console.error("usage: cleanup:threads --user <uuid> [--apply]");
    process.exit(1);
  }
  const db = serviceClient();

  const { data, error } = await db
    .from("memory_threads")
    .select("id, label, description, mention_count, off_record, status")
    .eq("user_id", userId)
    .eq("status", "open")
    .order("mention_count", { ascending: false });
  if (error) throw new Error(error.message);
  const threads = (data ?? []) as Thread[];

  const text = (t: Thread) => `${t.label} — ${t.description ?? ""}`;
  const meta = threads.filter((t) => isAboutTheInterview(t.label, t.description));
  const needs = threads.filter((t) => EDITOR_NEED.test(t.description ?? "") && !meta.includes(t));
  const real = threads.filter((t) => !meta.includes(t) && !needs.includes(t));

  // Group what is left by sameness, keeping the most-mentioned as the survivor.
  const groups: Thread[][] = [];
  for (const t of real) {
    const g = groups.find((group) => group.some((o) => similarity(text(o), text(t)) >= SAME));
    if (g) g.push(t);
    else groups.push([t]);
  }
  const duplicated = groups.filter((g) => g.length > 1);

  console.log(`${threads.length} open thread(s): ${real.length} about his life, ${meta.length} about the interview, ${needs.length} editor notes\n`);

  if (meta.length > 0) {
    console.log("ABOUT THE INTERVIEW — would be retired");
    for (const t of meta) console.log(`  ×${t.mention_count}  ${t.label}`);
    console.log("");
  }

  if (duplicated.length > 0) {
    console.log("THE SAME THREAD MORE THAN ONCE — would be collapsed into the first");
    for (const g of duplicated) {
      const [keep, ...rest] = g;
      console.log(`  keep ×${g.reduce((n, t) => n + t.mention_count, 0)}  ${keep.label}`);
      for (const t of rest) console.log(`     retire ×${t.mention_count}  ${t.label}`);
    }
    console.log("");
  }

  const { data: stances } = await db
    .from("memory_stances")
    .select("id, statement")
    .eq("user_id", userId);
  const shrugs = (stances ?? []).filter((s: { statement: string }) => isNonAnswerStance(s.statement));
  if (shrugs.length > 0) {
    console.log("NOT BELIEFS, SHRUGS — reported only, never touched by this script");
    for (const s of shrugs) console.log(`  ${s.statement}`);
    console.log("  (a stance has no resolved state; say the word and they go)\n");
  }

  const retiring = [...meta.map((t) => t.id), ...duplicated.flatMap((g) => g.slice(1).map((t) => t.id))];
  const after = real.length - duplicated.reduce((n, g) => n + g.length - 1, 0);

  if (!apply) {
    console.log(`would retire ${retiring.length} thread(s); ${after} would remain open. Re-run with --apply.`);
    return;
  }

  // The survivor inherits the weight: a thread returned to four times under
  // four names has been returned to four times.
  for (const g of duplicated) {
    const total = g.reduce((n, t) => n + t.mention_count, 0);
    const { error: e } = await db.from("memory_threads").update({ mention_count: total }).eq("id", g[0].id);
    if (e) throw new Error(e.message);
  }
  for (let i = 0; i < retiring.length; i += 50) {
    const { error: e } = await db
      .from("memory_threads")
      .update({ status: "resolved", updated_at: new Date().toISOString() })
      .in("id", retiring.slice(i, i + 50));
    if (e) throw new Error(e.message);
  }
  console.log(`retired ${retiring.length} thread(s); ${after} open thread(s) remain.`);
}

main().catch((err) => {
  console.error(`cleanup-threads: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
