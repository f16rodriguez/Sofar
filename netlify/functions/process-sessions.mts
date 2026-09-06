// Closed sessions into the book (SPEC §3.4).
//
// Every fifteen minutes: any session a person has finished is read — extracted,
// merged, and turned into a chapter once enough has accumulated. Delivery
// stays separate from generation (D1), so a chapter written here is a draft
// until it is read.
//
// Off unless SOFAR_PROCESS_SESSIONS is set to "on". This is the one job that
// spends real money without anyone asking it to, and a cron that quietly bills
// a founder is not a feature. Until it is switched on, `npm run sofar --
// process` does the same work by hand.

import type { Config } from "@netlify/functions";
import { serviceClient } from "../../lib/supabase";
import { processSession } from "../../lib/pipeline/process";
import { usage } from "../../lib/llm";
import { log } from "../../lib/log";

/** One pass never processes more than this, whatever has piled up. */
const PER_RUN = 5;

export default async () => {
  if ((process.env.SOFAR_PROCESS_SESSIONS ?? "").toLowerCase() !== "on") {
    return Response.json({ skipped: "SOFAR_PROCESS_SESSIONS is not on" });
  }

  const db = serviceClient();
  const { data, error } = await db
    .from("sessions")
    .select("id")
    .eq("status", "processing")
    .order("ended_at", { ascending: true })
    .limit(PER_RUN);
  if (error) throw new Error(`sessions read failed: ${error.code ?? error.message}`);

  const sessions = (data ?? []) as { id: string }[];
  let processed = 0;
  let chapters = 0;
  let revisions = 0;
  let failed = 0;

  for (const s of sessions) {
    try {
      const r = await processSession(db, s.id);
      if (r.skipped) continue;
      processed += 1;
      if (r.chapter) chapters += 1;
      revisions += r.revisions;
    } catch (err) {
      // processSession has already marked it failed; one bad session must not
      // stop the ones behind it.
      failed += 1;
      log.error("process.sessions", err, { sessionId: s.id });
    }
  }

  const summary = { waiting: sessions.length, processed, chapters, revisions, failed, cost: usage.summary() };
  log.info("process.sessions", summary);
  return Response.json(summary);
};

export const config: Config = {
  schedule: "*/15 * * * *",
};
