// Resuming an interview (SPEC §3.3). Throwaway users, no LLM calls.
//
//   set -a; . ./.env.local; set +a; npm run test:session

import { serviceClient } from "../lib/supabase";
import { resumeOrStart } from "../lib/interview/session";
import { initialState } from "../lib/interview/machine";

let failed = 0;
const check = (ok: boolean, label: string, detail?: string) => {
  if (!ok) failed++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
};

async function main() {
  const db = serviceClient();
  const email = `session-${Date.now()}@example.com`;
  const { data: created, error } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (error || !created.user) throw new Error(`auth user: ${error?.message}`);
  const userId = created.user.id;

  try {
    await db.from("users").insert({ id: userId, email });

    const first = await resumeOrStart(db, userId);
    check(!first.resumed, "a first interview starts fresh");
    check(first.state.seconds_left === initialState().seconds_left, "with the whole clock");

    // Part way in, and interrupted.
    const partway = { ...first.state, block: "2" as const, question_idx: 4, asked: [0, 4], seconds_left: 700 };
    await db.from("sessions").update({ state: partway }).eq("id", first.sessionId);

    const again = await resumeOrStart(db, userId);
    check(again.resumed && again.sessionId === first.sessionId, "coming back picks the same session up", again.sessionId === first.sessionId ? "same id" : "new id");
    check(again.state.question_idx === 4 && again.state.seconds_left === 700, "with the clock and place kept");
    const { count: sessionCount } = await db
      .from("sessions").select("*", { count: "exact", head: true }).eq("user_id", userId);
    check(sessionCount === 1, "and no second session is minted", `${sessionCount}`);

    // A day later: a clean run, and the old one is closed rather than left open.
    const tomorrow = new Date(Date.now() + 13 * 3_600_000);
    const next = await resumeOrStart(db, userId, "onboarding", tomorrow);
    check(!next.resumed && next.sessionId !== first.sessionId, "a day later starts fresh");
    check(next.state.seconds_left === initialState().seconds_left, "with the whole clock again");
    const { data: old } = await db.from("sessions").select("status").eq("id", first.sessionId).single();
    check(old?.status !== "active", "and yesterday's session is closed, not orphaned", String(old?.status));

    // A session with no time left is finished, whatever its status says.
    await db.from("sessions").update({ state: { ...next.state, seconds_left: 5 } }).eq("id", next.sessionId);
    const third = await resumeOrStart(db, userId);
    check(!third.resumed && third.sessionId !== next.sessionId, "a spent clock does not resume");

    const { count: total } = await db
      .from("sessions").select("*", { count: "exact", head: true }).eq("user_id", userId).eq("status", "active");
    check(total === 1, "exactly one interview is ever open", `${total} active`);
  } finally {
    await db.auth.admin.deleteUser(userId);
    console.log("\ncleanup: fixture user deleted (cascade)");
  }

  console.log(`\nsession: ${failed === 0 ? "all passed" : `${failed} failed`}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`test-session: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
