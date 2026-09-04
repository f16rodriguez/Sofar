// Daily jobs (SPEC §3.9, §3.10; M6): audio past sixty days, pending account
// deletions. Scheduled by Netlify; the same functions run by hand through
// scripts/jobs.ts. 05:00 UTC — after midnight in the Americas, before the
// morning in Europe.

import type { Config } from "@netlify/functions";
import { serviceClient } from "../../lib/supabase";
import { runAudioRetention, runAccountDeletions } from "../../lib/jobs";
import { log } from "../../lib/log";

export default async () => {
  const db = serviceClient();
  const retention = await runAudioRetention(db);
  const deletions = await runAccountDeletions(db);
  log.info("jobs.daily", { retention, deletions });
  return new Response(JSON.stringify({ retention, deletions }), {
    headers: { "content-type": "application/json" },
  });
};

export const config: Config = {
  schedule: "0 5 * * *",
};
