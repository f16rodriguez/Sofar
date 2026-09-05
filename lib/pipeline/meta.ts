// The interview is not part of the life (phase0 §5; CLAUDE.md).
//
// A person talking about the questions — rejecting one, asking how far along
// they are, saying the session felt long — is not telling you about their
// life. The extraction prompt says so, and it still leaked: "Interview method
// challenged", "Session ended early", "Basketball question rejected" all
// became open threads, and open threads reach the So far chapter and choose
// tomorrow's question. A rule that matters this much cannot live only in a
// prompt, so it is enforced here too.
//
// Deliberately narrow. Over-filtering silently deletes someone's material,
// which is worse than the leak: a thread is only refused when it is *about*
// the asking, never merely because it was narrated through it. "Asked who
// would say his certainty is untrue, he named no one" is a real thread — the
// fact is his — and it survives.

const ABOUT_THE_ASKING: RegExp[] = [
  // The interview, the app, the exercise itself.
  /\binterview(s|ed|ing|er)?\b/i,
  /\b(this|the) (exercise|questionnaire|survey|app|session'?s? format)\b/i,
  // A question judged rather than answered.
  /\b(question|questions|prompt)\b[^.]{0,60}\b(reject(ed|s)?|dismiss(ed|es)?|too broad|too vague|weak|irrelevant|unimportant|bad|pointless|not (important|foundational|relevant))\b/i,
  /\b(reject(ed|s)?|dismiss(ed|es)?|challenged?|criticis(ed|es)|criticiz(ed|es))\b[^.]{0,40}\b(question|questions|method|line of questioning)\b/i,
  /\bfoundational questions\b/i,
  /\bnot asking enough\b/i,
  // A judgement of the asking, with no question word anywhere near it:
  // "rejected as too broad". Distinct from a declined *topic* ("the editor's
  // concerns were declined as a topic"), which is real content and stays.
  /\btoo (broad|vague|general)\b/i,
  // The session as an event: how long it ran, where it stopped.
  /\bsession (ended|ran|stopped|was cut|felt)\b/i,
  /\b(ended|stopped) after Q\d+\b/i,
  /\bQ\d+\b[^.]{0,30}\b(never (asked|reached)|was not asked|unasked)\b/i,
  /\b(progress|how far along|almost done)\b[^.]{0,30}\b(so far|through|interview)\b/i,
];

/**
 * True when this row is about being interviewed rather than about a life.
 * Checked against everything the row carries, because the giveaway is as
 * often in the description as the label.
 */
export function isAboutTheInterview(...parts: (string | null | undefined)[]): boolean {
  const text = parts.filter(Boolean).join(" — ");
  if (text.trim().length === 0) return false;
  return ABOUT_THE_ASKING.some((p) => p.test(text));
}

/**
 * A stance has to be something the person holds, not a shrug at the question
 * in front of them. "I don't think anyone would say that" is the shape of a
 * non-answer: a bare denial that only means anything alongside the question
 * it deflected, which the book will never show.
 */
const NON_ANSWER =
  /^(i (really )?(don'?t|do not) (think|know|remember|have)|not (sure|really)|no ?one|nobody|nothing (comes to mind|really)|i can'?t (think|get|remember)|okay[.,]|skip\b|pass\b)/i;

export function isNonAnswerStance(statement: string): boolean {
  const s = statement.trim();
  if (s.length === 0) return true;
  // Only when the whole statement is the deflection. A sentence that opens
  // with a hedge and then says something ("I don't know why, but I left in
  // July") is the person talking, and stays.
  const words = s.split(/\s+/).length;
  return NON_ANSWER.test(s) && words <= 12;
}
