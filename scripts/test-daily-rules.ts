// The daily question's hard rules and its pause (SPEC §5.6). Synthetic
// questions only, no LLM calls; the quiet check uses a throwaway user.
//
//   set -a; . ./.env.local; set +a; npm run test:daily

import { serviceClient } from "../lib/supabase";
import { names, placeKey, repeats, sameSubject } from "../lib/daily/topics";
import { isQuiet, ruleFailure, shouldAsk, QUIET_AFTER } from "../lib/daily/question";

let failed = 0;
const check = (ok: boolean, label: string, detail?: string) => {
  if (!ok) failed++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
};

function subjects() {
  console.log("same subject");
  check(
    sameSubject("When you lived in Tucson, what was your first morning there?", "What did you do the day you left Tucson?") !== null,
    "a shared place name is the same subject, however it is worded",
  );
  check(
    sameSubject("What day did Marisol call you about the house?", "Who was with you when Marisol's letter came?") !== null,
    "so is a shared person, possessive or not",
  );
  check(
    sameSubject("What day did the orchard flood, and who was there?", "When the orchard flooded, what did your uncle do first?") !== null,
    "two shared content words that are half the question are the same subject",
  );
  check(
    sameSubject("What did your sister need to get back on her feet?", "What day did your boss ask you to come back?") === null,
    "one shared everyday word is not",
  );
  check(
    sameSubject("Who comes to mind first when you think of that winter?", "What was on your mind the night before the move?") === null,
    "nor is an idiom that happens to share a word",
  );
  check(
    sameSubject("What did you buy with the first paycheck?", "Who taught you to drive?") === null,
    "different subjects are different",
  );
  check(!names("Queens was loud that year?").has("queens"), "the word that opens a question is not taken for a name");
  check(names("What did JC say?").has("jc"), "two-letter initials are names");
  check(placeKey("Tucson, AZ") === "tucson", "a given place is matched by its first part", placeKey("Tucson, AZ"));
  check(
    repeats("What was the first night in Tucson like?", ["Who taught you to drive?", "When did you move to Tucson?"]) === "When did you move to Tucson?",
    "repeats() names the question it circles back to",
  );
}

function rules() {
  console.log("hard rules");
  const recent = ["Who taught you to drive?"];
  const resting = ["When did you move to Tucson?"];
  check(ruleFailure("What did your father say at the station?", recent, resting) === null, "a plain fresh question passes");
  check(/mention/.test(ruleFailure("What chapter of your life began in Tucson?", recent) ?? ""), "the book's words are refused");
  check(/one question/.test(ruleFailure("Where were you? Who was there?", recent) ?? ""), "two question marks are refused");
  check(/ending/.test(ruleFailure("Tell me about the station.", recent) ?? ""), "a question ends in a question mark");
  check(/under/.test(ruleFailure(`What ${"very ".repeat(25)}long day was it?`, recent) ?? ""), "too long is refused");
  check(/repeats/.test(ruleFailure("Who taught you to DRIVE?", recent) ?? ""), "an exact repeat is refused, case aside");
  const circled = ruleFailure("What was your first morning in Tucson like?", recent, resting);
  check(/two weeks/.test(circled ?? ""), "a subject from the last two weeks is refused, with the question it repeats", circled ?? "passed");
  check(ruleFailure("What was your first morning in Tucson like?", recent, []) === null, "the same subject is fine once it has rested");
}

async function quiet() {
  console.log("going quiet");
  const db = serviceClient();
  const email = `daily-${Date.now()}@example.com`;
  const { data: created, error } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (error || !created.user) throw new Error(`auth user: ${error?.message}`);
  const userId = created.user.id;
  try {
    await db.from("users").insert({
      id: userId,
      email,
      pronoun: "they",
      birthplace: "Tucson",
      recording_consent_at: new Date().toISOString(),
    });
    check((await shouldAsk(db, userId)).reason === "still in interview", "nobody is asked before their first interview is over");

    await db.from("users").update({ onboarding_completed_at: new Date().toISOString() }).eq("id", userId);
    check((await shouldAsk(db, userId)).ask, "once it is, they are");

    const ask = async (daysAgo: number) => {
      const { data } = await db
        .from("questions")
        .insert({
          user_id: userId,
          kind: "event",
          block: "daily",
          text: `Synthetic question ${daysAgo}?`,
          source: "generated",
          created_at: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
        })
        .select("id")
        .single();
      return data!.id as string;
    };
    const oldest = await ask(9);
    await ask(8);
    check(!(await isQuiet(db, userId)), "two unanswered is not quiet yet");
    await ask(7);
    check(await isQuiet(db, userId), `${QUIET_AFTER} unanswered in a row is quiet`);
    check((await shouldAsk(db, userId)).reason === "quiet", "and a quiet person is not asked");

    await ask(6);
    await db.from("answers").insert({ user_id: userId, question_id: oldest, input: "text", transcript: "synthetic" });
    check(await isQuiet(db, userId), "an answer to an older question does not break the run");

    const latest = await ask(1);
    await db.from("answers").insert({ user_id: userId, question_id: latest, input: "text", transcript: "synthetic" });
    check(!(await isQuiet(db, userId)), "answering again brings them back");
    check((await shouldAsk(db, userId)).ask, "and they are asked tomorrow");
  } finally {
    await db.auth.admin.deleteUser(userId);
  }
}

async function main() {
  subjects();
  rules();
  await quiet();
  console.log(failed ? `\n${failed} failed` : "\nall passed");
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
