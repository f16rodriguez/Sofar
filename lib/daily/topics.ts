// Is this question about something asked about too recently? (SPEC §5.6.)
//
// An exact-match check let the generator walk in circles: over three weeks it
// asked about one unvisited gym twice, one night of racing thoughts three
// times, one father at one villa twice, Queens twice, Mount Vernon twice —
// each worded freshly enough to pass. The main fix is upstream: a thread or a
// place asked about in the last two weeks is not offered to the model at all
// (lib/daily/question.ts). This is the backstop for what slips through, so it
// compares what the questions are about, not how they are worded.
//
// Two questions share a subject when they name the same person or place, or
// share at least two content words that make up half of the shorter one. One
// shared common word is not enough: "come back to the company" and "get back
// on her feet" share "back" and nothing else.

const SCAFFOLD = new Set(
  (
    "a an the and or but if so to of in on at by for with from into onto about " +
    "what when where who whom whose which why how was were is are be been being " +
    "do did does done you your yours youre i me my we us our it its this that " +
    "there then than just actually really first last time day days week one " +
    "ever still any some thing things someone something happened happening " +
    "remember think say said tell told made make like right before after " +
    "exactly clear came come going went get got would could should will can " +
    "time moment morning night today yesterday back feet live lived living " +
    "wasnt werent didnt dont full whats"
  ).split(" "),
);

/** Crude stem: enough to make "moved" and "moving" the same word, no more. */
function stem(w: string): string {
  return w.replace(/(ing|ed|es|s)$/, "").replace(/(.)\1$/, "$1");
}

export function topicWords(question: string): Set<string> {
  return new Set(
    question
      .toLowerCase()
      .replace(/[’']/g, "")
      .split(/[^a-z]+/)
      .filter((w) => w.length > 2 && !SCAFFOLD.has(w))
      .map(stem)
      .filter((w) => w.length > 2),
  );
}

/**
 * Names: capitalised words that do not open the question — Queens, Mount
 * Vernon, JC. A name is the strongest sign two questions are about the same
 * thing, and it survives any rewording.
 */
export function names(question: string): Set<string> {
  const out = new Set<string>();
  const words = question.match(/[A-Za-z][A-Za-z’']*/g) ?? [];
  words.forEach((w, i) => {
    if (i === 0 || w === "I" || !/^[A-Z]/.test(w)) return;
    const bare = w.replace(/[’']s$/, "").replace(/[’']/g, "").toLowerCase();
    if (bare.length >= 2) out.add(bare);
  });
  return out;
}

/** Overlap of what two questions are about, 0 to 1, and how many words it rests on. */
export function topicOverlap(a: string, b: string): { score: number; shared: string[] } {
  const ta = topicWords(a);
  const tb = topicWords(b);
  if (ta.size === 0 || tb.size === 0) return { score: 0, shared: [] };
  const shared = [...ta].filter((w) => tb.has(w));
  // Against the smaller set: a short question about the gym is the same
  // question as a long one about the gym and the fever.
  return { score: shared.length / Math.min(ta.size, tb.size), shared };
}

export const SAME_TOPIC = 0.5;

/** Whether two questions are about the same thing, and why. */
export function sameSubject(a: string, b: string): string | null {
  const nb = names(b);
  const name = [...names(a)].find((n) => nb.has(n));
  if (name) return `both name ${name}`;
  const { score, shared } = topicOverlap(a, b);
  if (shared.length >= 2 && score >= SAME_TOPIC) return `both about ${shared.join(", ")}`;
  return null;
}

/** The recent question this one circles back to, if any. */
export function repeats(question: string, recent: string[]): string | null {
  for (const r of recent) if (sameSubject(question, r)) return r;
  return null;
}

/**
 * A given foundation — "Queens, NY", "Punta Cana" — reduced to the words a
 * question would use for it, so a place asked about recently can be rested.
 */
export function placeKey(value: string): string {
  return value
    .split(",")[0]
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
