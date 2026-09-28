// Hourly: write the day's question for everyone whose local clock just
// reached eight (SPEC §3.4). One Haiku call per person per day — and none for
// someone still in their first interview, or who has left the last three
// unanswered (shouldAsk): they are asked again when they come back.

import type { Config } from "@netlify/functions";
import { serviceClient } from "../../lib/supabase";
import { generateDailyQuestion, shouldAsk } from "../../lib/daily/question";
import { localHour, safeZone } from "../../lib/daily/time";
import { log } from "../../lib/log";

const HOUR = 8;

export default async () => {
  const db = serviceClient();
  const now = new Date();
  const { data: users, error } = await db
    .from("users")
    .select("id, timezone")
    .not("recording_consent_at", "is", null)
    .not("pronoun", "is", null);
  if (error) throw new Error(`users read failed: ${error.code ?? error.message}`);

  let asked = 0;
  let skipped = 0;
  let resting = 0;
  for (const u of users ?? []) {
    if (localHour(now, safeZone(u.timezone as string)) !== HOUR) continue;
    try {
      if (!(await shouldAsk(db, u.id as string)).ask) {
        resting += 1;
        continue;
      }
      const r = await generateDailyQuestion(db, { userId: u.id as string, now });
      if (r.created) asked += 1;
      else skipped += 1;
    } catch (err) {
      log.error("daily.question.job", err, { userId: u.id });
    }
  }
  log.info("daily.question.job", { users: (users ?? []).length, asked, skipped, resting });
  return new Response(JSON.stringify({ asked, skipped, resting }), { headers: { "content-type": "application/json" } });
};

export const config: Config = {
  schedule: "0 * * * *",
};
