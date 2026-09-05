// The interview filter, against real rows from the founder's own record —
// both the ones it must refuse and the ones it must never touch.
//
//   npm run test:meta

import { isAboutTheInterview, isNonAnswerStance } from "../lib/pipeline/meta";

const REFUSE: [string, string][] = [
  ["Interview method challenged", "Subject stated the questions were not foundational enough about him."],
  ["Wanting more questions about himself", "He said the interview wasn't asking enough foundational questions about him."],
  ["Session ended early", "Interview ended after Q11; Q12 was never asked."],
  ["Basketball question rejected", "Asked for the earliest game he remembers playing; he dismissed the question outright."],
  ["Earliest memory refused", "Asked for the earliest memory connecting to his certainty; rejected as too broad."],
  ["Earliest memory tied to the certainty", "Question about earliest memory connecting to his certainty was rejected as too broad."],
];

// Real threads that carry his life. Every one of these must survive.
const KEEP: [string, string][] = [
  ["The gym he never saw", "He planned to check out the gym for the first time and the fever stopped him."],
  ["Nobody to disagree", "Asked who would say his certainty is untrue, he named no one."],
  ["Racing mind at night", "Falling asleep late with mind racing about finances, ventures, stress, ideas."],
  ["The breakfast and the illness", "A breakfast he thinks may have hurt his stomach, cause unknown, followed by fever and chills."],
  ["Still getting by", "Despite the move, he describes life as day to day, figure it out and get by."],
  ["Father shutting down", "His father did not view the last villa and shut down that day; nothing resolved after."],
  ["Leaving and returning to the company", "He chose to leave the company and JC brought him back; the reason for leaving is unexplored."],
  ["Mother getting back on her feet", "Philly was temporary while his mother got back on her feet; no further detail."],
  ["The complicated JC relationship", "Best friend and colleague, called complicated, but he says the two roles have never collided."],
  ["Money, AI, passive income", "The recurring thought of the week — how to make more money, leverage AI, generate passive income."],
  ["Unnamed lost relationships", "He believes his certainty cost him some relationships but declines or is unable to name any."],
  ["Editor's concerns", "The concerns raised by the underperforming editor were declined as a topic."],
];

const NON_ANSWERS = [
  "I don't think anyone would say that.",
  "I don't think anyone would say that's not true.",
  "I don't know.",
  "Okay. I don't think I can get this.",
];

const REAL_STANCES = [
  "Moving is terrible, and I have 2-3 moves left in my lifetime.",
  "I don't think a person should wait for permission to leave a job that is eating their family.",
  "Leaving was the right call because the hours were eating the family.",
];

let failed = 0;
const check = (ok: boolean, label: string) => {
  if (!ok) failed++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}`);
};

console.log("refuses the interview talking about itself");
for (const [label, description] of REFUSE) check(isAboutTheInterview(label, description), label);

console.log("\nkeeps his life, including threads narrated through a question");
for (const [label, description] of KEEP) check(!isAboutTheInterview(label, description), label);

console.log("\nrefuses a shrug dressed as a belief");
for (const s of NON_ANSWERS) check(isNonAnswerStance(s), s);

console.log("\nkeeps a real stance");
for (const s of REAL_STANCES) check(!isNonAnswerStance(s), s.slice(0, 56) + "…");

console.log(`\nmeta filter: ${failed === 0 ? "all passed" : `${failed} failed`}`);
process.exit(failed === 0 ? 0 : 1);
