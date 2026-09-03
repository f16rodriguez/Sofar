// State machine tests (SPEC §4). Pure logic, no API calls, no cost.
// Run: npx tsx scripts/test-machine.ts

import {
  decide, advance, initialState, spend, budgetRemaining,
  FINAL_QUESTION_SECONDS, MAX_FOLLOWUPS, MAX_DEPTH_TURNS,
  type SeedQuestion, type SessionState,
} from "../lib/interview/machine";

const seeds: SeedQuestion[] = [
  { id: "q1", block: "1", text: "Walk me through yesterday.", order_idx: 1 },
  { id: "q2", block: "1", text: "The thing you keep coming back to?", order_idx: 2 },
  { id: "q3", block: "1", text: "Who did you talk to most?", order_idx: 3 },
  { id: "q4", block: "2", text: "Most recent decision?", order_idx: 4 },
  { id: "q5", block: "2", text: "Who did you tell first?", order_idx: 5 },
  { id: "q12", block: "4", text: "Never said out loud?", order_idx: 12 },
];

let failed = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failed++;
}
const base = (over: Partial<SessionState> = {}): SessionState => ({
  ...initialState(), ...over,
});

// 1 — a thin answer earns a follow-up, capped at two
let s = base({ question_idx: 1, asked: [1] });
let m = decide({ state: s, seeds, lastAnswerThin: true, lastAnswerDeclined: false });
check("thin answer → follow-up", m.kind === "followup");
s = advance(s, m);
s = advance(s, decide({ state: s, seeds, lastAnswerThin: true, lastAnswerDeclined: false }));
check("two follow-ups spent", s.followups_used === MAX_FOLLOWUPS);
m = decide({ state: s, seeds, lastAnswerThin: true, lastAnswerDeclined: false });
check("third is refused, moves on", m.kind === "next", `got ${m.kind}`);

// 2 — a skip closes the topic: no follow-up even when thin
m = decide({ state: base({ question_idx: 1, asked: [1] }), seeds, lastAnswerThin: true, lastAnswerDeclined: true });
check("declined → never followed up", m.kind === "next", `got ${m.kind}`);

// 3 — depth holds the angle, then hands back to the script (D4)
s = base({ question_idx: 4, asked: [1, 2, 3, 4] });
const angle = "the villa trip";
for (let i = 0; i < MAX_DEPTH_TURNS; i++) {
  const move = decide({ state: s, seeds, lastAnswerThin: false, lastAnswerDeclined: false, angle });
  if (move.kind !== "depth") { check("depth holds", false, `turn ${i} gave ${move.kind}`); break; }
  s = advance(s, move);
}
check("depth ran its full length", s.depth?.turns === MAX_DEPTH_TURNS, `turns=${s.depth?.turns}`);
m = decide({ state: s, seeds, lastAnswerThin: false, lastAnswerDeclined: false, angle });
check("depth exhausted → back to script", m.kind === "next", `got ${m.kind}`);

// 4 — the twenty-minute promise outranks the script
s = base({ seconds_left: FINAL_QUESTION_SECONDS, asked: [1] });
m = decide({ state: s, seeds, lastAnswerThin: true, lastAnswerDeclined: false, angle });
check("out of time → final question", m.kind === "final", `got ${m.kind}`);
check("final question is the last seed", m.kind === "final" && m.question.order_idx === 12);
s = base({ seconds_left: 30, asked: [1, 12] });
check("nothing left to ask → end", decide({ state: s, seeds, lastAnswerThin: false, lastAnswerDeclined: false }).kind === "end");

// 5 — behind the clock, skip to the next block rather than overrun
s = base({ block: "1", question_idx: 1, asked: [1] });
s = { ...s, seconds_left: budgetRemaining("1") - 1 };
m = decide({ state: s, seeds, lastAnswerThin: false, lastAnswerDeclined: false });
check("behind clock → next block", m.kind === "skip_block" && m.question.block === "2", `got ${m.kind}`);

// 6 — time is spent by answer length plus overhead
check("spend() debits answer + overhead", spend(base(), 52).seconds_left === 1080 - 52 - 8);
check("spend() never goes negative", spend(base({ seconds_left: 3 }), 60).seconds_left === 0);

// 7 — advancing resets follow-ups and clears depth
s = advance(base({ followups_used: 2, depth: { angle: "x", turns: 3 } }),
            { kind: "next", question: seeds[3] });
check("new question resets follow-ups", s.followups_used === 0);
check("new question clears depth", s.depth === undefined);

console.log(`\n${failed === 0 ? "ALL PASS" : `${failed} FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
