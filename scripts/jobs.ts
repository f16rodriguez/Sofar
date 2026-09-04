// Background jobs on demand (M6). The daily schedule lives in
// netlify/functions/jobs-daily.mts; this is the same code by hand.
//
//   set -a; . ./.env.local; set +a
//   npm run jobs -- retention --dry        # what would be deleted
//   npm run jobs -- retention             # delete recordings past 60 days
//   npm run jobs -- deletions --dry
//   npm run jobs -- deletions             # run pending account deletions
//   npm run jobs -- all

import { serviceClient } from "../lib/supabase";
import { runAudioRetention, runAccountDeletions } from "../lib/jobs";

const args = process.argv.slice(2);
const command = args[0];
const dryRun = args.includes("--dry");
const daysArg = args.indexOf("--days");
const days = daysArg >= 0 ? Number(args[daysArg + 1]) : undefined;

async function main() {
  const db = serviceClient();
  if (command === "retention" || command === "all") {
    const r = await runAudioRetention(db, { dryRun, days });
    console.log(`retention: ${r.candidates} candidate(s), ${r.deleted} deleted, ${r.failed} failed${r.dryRun ? " (dry run)" : ""}`);
  }
  if (command === "deletions" || command === "all") {
    const r = await runAccountDeletions(db, { dryRun });
    console.log(`deletions: ${r.jobs} job(s), ${r.deleted} deleted, ${r.failed} failed${r.dryRun ? " (dry run)" : ""}`);
  }
  if (!["retention", "deletions", "all"].includes(command ?? "")) {
    console.error("usage: jobs retention|deletions|all [--dry] [--days N]");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`jobs: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
