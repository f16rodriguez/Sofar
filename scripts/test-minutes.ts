// Session minutes (SPEC §3.6). Throwaway user, no LLM calls.
//
//   set -a; . ./.env.local; set +a; npm run test:minutes

import { serviceClient } from "../lib/supabase";
import { balance, spend, topUp, MONTHLY_CAP, TOPUP_MINUTES, isCapped } from "../lib/minutes";
import { resumeOrStart, OutOfMinutes } from "../lib/interview/session";

let failed = 0;
const check = (ok: boolean, label: string, detail?: string) => {
  if (!ok) failed++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
};

async function main() {
  const db = serviceClient();
  const email = `minutes-${Date.now()}@example.com`;
  const { data: created, error } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (error || !created.user) throw new Error(`auth user: ${error?.message}`);
  const userId = created.user.id;

  try {
    await db.from("users").insert({ id: userId, email });

    const start = await balance(db, userId);
    check(start.used === 0 && start.remaining === MONTHLY_CAP, "a new month starts full", `${start.remaining}/${start.cap}`);
    check(new Date(start.resetsAt).getTime() > Date.now(), "and knows when it resets", start.resetsAt.slice(0, 10));

    const after = await spend(db, userId, 18.4);
    check(after.used === 19, "a part minute costs a whole one", `${after.used}`);
    check(after.remaining === MONTHLY_CAP - 19, "and comes off what is left", `${after.remaining}`);

    // Only interview sessions are refused (SPEC §3.6); the rest are metered.
    check(isCapped("interview") && !isCapped("onboarding") && !isCapped("daily"), "the cap applies to interview sessions");

    // Onboarding still runs on an empty meter.
    await db.from("users").update({ session_minutes_used: MONTHLY_CAP }).eq("id", userId);
    const onboarding = await resumeOrStart(db, userId, "onboarding");
    check(Boolean(onboarding.sessionId), "onboarding is never refused for minutes");

    let refused = false;
    let resetsAt = "";
    try {
      await resumeOrStart(db, userId, "interview");
    } catch (err) {
      refused = err instanceof OutOfMinutes;
      if (err instanceof OutOfMinutes) resetsAt = err.resetsAt;
    }
    check(refused, "an interview is refused on an empty meter", resetsAt ? `resets ${resetsAt.slice(0, 10)}` : "");

    const toppedUp = await topUp(db, userId);
    check(toppedUp.remaining === TOPUP_MINUTES, "a top-up buys minutes back", `${toppedUp.remaining} left`);
    const allowed = await resumeOrStart(db, userId, "interview");
    check(Boolean(allowed.sessionId), "and the interview may begin");

    // A new month wipes the meter, without a job having to run.
    await db
      .from("users")
      .update({ session_minutes_used: 90, session_minutes_reset_at: new Date(Date.now() - 1000).toISOString() })
      .eq("id", userId);
    const rolled = await balance(db, userId);
    check(rolled.used === 0 && rolled.remaining === MONTHLY_CAP, "the month turning resets it", `${rolled.remaining}/${rolled.cap}`);
    check(new Date(rolled.resetsAt).getTime() > Date.now(), "and the next reset is in the future");

    // Ending a session bills what it used.
    const fresh = await resumeOrStart(db, userId, "onboarding");
    const { endSession } = await import("../lib/interview/session");
    await endSession(db, fresh.sessionId, { ...fresh.state, seconds_left: fresh.state.seconds_left - 600 });
    const billed = await balance(db, userId);
    check(billed.used === 10, "ending a session bills its minutes", `${billed.used} min`);
  } finally {
    await db.auth.admin.deleteUser(userId);
    console.log("\ncleanup: fixture user deleted (cascade)");
  }

  console.log(`\nminutes: ${failed === 0 ? "all passed" : `${failed} failed`}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`test-minutes: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
