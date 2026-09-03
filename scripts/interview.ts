// Headless interview (M2). The whole onboarding session in a terminal:
//
//   npm run interview -- --user <uuid>
//   npm run interview -- --user <uuid> --dry     (no model calls, no cost)
//
// This is the interview engine without a browser. Every rule that matters —
// the twenty-minute promise, two follow-ups, a skip closing a topic, depth
// over breadth — lives in lib/interview/machine.ts and is exercised here
// exactly as the UI will exercise it. Building it this way means an interview
// can be walked end to end for the price of a few Haiku calls, and a
// rendering bug never costs an Opus run.
//
// --dry answers the model's two judgement calls locally (is the answer thin,
// did they decline) so the flow, the clock and the state machine can be
// tested for nothing.

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { serviceClient } from "../lib/supabase";
import { usage } from "../lib/llm";
import {
  startSession,
  loadSeeds,
  recordAnswer,
  nextTurn,
  saveState,
  endSession,
} from "../lib/interview/session";
import { decide, advance, spend, type SessionState } from "../lib/interview/machine";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* ambient env */
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const DRY = process.argv.includes("--dry");

/** The two judgements the model makes, made locally so --dry costs nothing. */
function readAnswerLocally(answer: string) {
  const declined = /^\s*(skip|pass|next)\b/i.test(answer);
  const specifics =
    /\b\d/.test(answer) ||
    /"/.test(answer) ||
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|yesterday|morning|night|july|said|told)\b/i.test(
      answer,
    );
  return { thin: !declined && (answer.split(/\s+/).length < 25 || !specifics), declined };
}

async function main() {
  const userId = arg("user");
  if (!userId) {
    console.error("usage: interview --user <uuid> [--dry]");
    process.exit(1);
  }

  const db = serviceClient();

  // A terminal gets readline; piped input is read up front and replayed.
  // readline/promises closes as soon as a non-TTY stream ends, which makes a
  // scripted walkthrough impossible — and a scripted walkthrough is how this
  // engine gets tested without spending anything.
  const piped = !input.isTTY;
  let scripted: string[] = [];
  if (piped) {
    const chunks: Buffer[] = [];
    for await (const chunk of input) chunks.push(chunk as Buffer);
    scripted = Buffer.concat(chunks).toString("utf8").split("\n");
  }
  const rl = piped ? null : readline.createInterface({ input, output });

  const ask = async (prompt: string): Promise<string> => {
    if (rl) return rl.question(prompt);
    const line = scripted.shift();
    output.write(`${prompt}${line ?? "quit"}\n`);
    return line ?? "quit";
  };
  const seeds = await loadSeeds(db);
  if (seeds.length === 0) throw new Error("no seed questions; apply migration 0004");

  const { sessionId, state: initial } = await startSession(db, userId);
  let state: SessionState = initial;
  const turns: { question: string; answer: string }[] = [];
  const transcriptLines: string[] = [];

  console.log(`session ${sessionId}${DRY ? "  [dry — no model calls]" : ""}`);
  console.log(`${Math.round(state.seconds_left / 60)} minutes. Say "skip" to skip anything.\n`);

  let lastQuestion: string | undefined;
  let lastAnswer: string | undefined;

  for (;;) {
    let question: string;
    let announceLast = false;

    if (DRY) {
      const read = lastAnswer ? readAnswerLocally(lastAnswer) : { thin: false, declined: false };
      const move = decide({
        state,
        seeds,
        lastAnswerThin: read.thin,
        lastAnswerDeclined: read.declined,
      });
      if (move.kind === "end") break;
      state = advance(state, move);
      question =
        move.kind === "followup" || move.kind === "depth"
          ? `[follow-up would be generated here] ${move.question.text}`
          : move.question.text;
      announceLast = move.kind === "final";
    } else {
      const turn = await nextTurn(db, {
        state,
        seeds,
        lastQuestion,
        lastAnswer,
        recentTurns: turns,
      });
      if (turn.done) break;
      state = turn.state;
      question = turn.question;
      announceLast = turn.announce_last;
    }

    if (announceLast) console.log("This is the last question.\n");
    const answer = (await ask(`${question}\n> `)).trim();
    console.log("");

    if (answer.toLowerCase() === "quit") break;

    if (DRY) {
      state = spend(state, Math.max(5, Math.round(answer.split(/\s+/).length / 2.5)));
    } else {
      const recorded = await recordAnswer(db, {
        userId,
        sessionId,
        state,
        text: answer,
      });
      state = recorded.state;
    }

    turns.push({ question, answer });
    transcriptLines.push(`Q: ${question}`, `A: ${answer}`, "");
    lastQuestion = question;
    lastAnswer = answer;

    await saveState(db, sessionId, state);
    console.log(`   [${Math.floor(state.seconds_left / 60)}m ${state.seconds_left % 60}s left]\n`);
  }

  rl?.close();
  await endSession(db, sessionId, state);

  const file = path.join("transcripts", `session-${sessionId}.txt`);
  fs.mkdirSync("transcripts", { recursive: true });
  fs.writeFileSync(file, transcriptLines.join("\n"));

  console.log(`\nsession ended. ${turns.length} answers.`);
  console.log(`transcript: ${file}`);
  console.log(`next: npm run sofar -- run --transcript ${file} --user ${userId}`);
  if (!DRY) console.log(`interview cost: ${usage.summary()}`);
}

main().catch((err) => {
  console.error(`interview: ${err instanceof Error ? err.message : err}`);
  if (!DRY) console.error(`cost: ${usage.summary()}`);
  process.exit(1);
});
