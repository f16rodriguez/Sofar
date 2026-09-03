// Interviewer state machine (SPEC §4).
//
// Deterministic: which block we are in, which question is next, how many
// follow-ups have been spent, how much time is left. The model chooses the
// *wording* of a follow-up and judges whether an answer was thin; it never
// decides how long the session runs or what the seed questions are. Time is a
// promise made to the person and is kept in code.
//
// D4: the first sessions go deep rather than wide. When the editor has found
// a live angle, the machine stays on it instead of advancing — depth is a
// state, not an exception.

export type Block = "0" | "1" | "2" | "3" | "4";

export interface SeedQuestion {
  id: string;
  block: Block;
  text: string;
  order_idx: number;
}

export interface SessionState {
  block: Block;
  /** order_idx of the seed question currently being asked. */
  question_idx: number;
  followups_used: number;
  seconds_left: number;
  /** Questions already asked this session, by seed order_idx. */
  asked: number[];
  /** Live angle being pursued, and how many turns have been spent on it. */
  depth?: { angle: string; turns: number };
}

/** Per SPEC §4: blocks 1–4 run 4, 5, 5 and 4 minutes. */
export const BLOCK_SECONDS: Record<Block, number> = {
  "0": 120,
  "1": 240,
  "2": 300,
  "3": 300,
  "4": 240,
};

export const TOTAL_SECONDS = 1080; // 18 min of questions inside a 20 min promise
export const TURN_OVERHEAD_SECONDS = 8;
export const MAX_FOLLOWUPS = 2;
/** Below this, abandon the script and go to the final question. */
export const FINAL_QUESTION_SECONDS = 90;
/** A depth thread runs at most this many turns before the script resumes. */
export const MAX_DEPTH_TURNS = 6;

export function initialState(): SessionState {
  return {
    block: "1",
    question_idx: 0,
    followups_used: 0,
    seconds_left: TOTAL_SECONDS,
    asked: [],
  };
}

/** Time is spent by the answer plus the overhead of asking. */
export function spend(state: SessionState, answerSeconds: number): SessionState {
  return {
    ...state,
    seconds_left: Math.max(
      0,
      state.seconds_left - answerSeconds - TURN_OVERHEAD_SECONDS,
    ),
  };
}

function remainingBlocks(block: Block): Block[] {
  const order: Block[] = ["1", "2", "3", "4"];
  return order.slice(order.indexOf(block));
}

/** Seconds the rest of the script needs if run as written. */
export function budgetRemaining(block: Block): number {
  return remainingBlocks(block).reduce((sum, b) => sum + BLOCK_SECONDS[b], 0);
}

export type Move =
  | { kind: "followup"; question: SeedQuestion }
  | { kind: "depth"; question: SeedQuestion; angle: string }
  | { kind: "next"; question: SeedQuestion }
  | { kind: "skip_block"; question: SeedQuestion; from: Block }
  | { kind: "final"; question: SeedQuestion }
  | { kind: "end" };

export interface DecideInput {
  state: SessionState;
  seeds: SeedQuestion[];
  /** The model's read of the last answer. */
  lastAnswerThin: boolean;
  /** The person said skip; the topic is closed for this session. */
  lastAnswerDeclined: boolean;
  /** A live angle from the editor, when one has been found. */
  angle?: string;
}

/**
 * What happens next. Pure — no model call, no clock, no database. The
 * interviewer prompt then words whatever this returns.
 */
export function decide(input: DecideInput): Move {
  const { state, seeds, lastAnswerThin, lastAnswerDeclined, angle } = input;
  const byOrder = [...seeds].sort((a, b) => a.order_idx - b.order_idx);
  const last = byOrder[byOrder.length - 1];
  const unasked = byOrder.filter((q) => !state.asked.includes(q.order_idx));

  if (unasked.length === 0) return { kind: "end" };

  // The promise comes before the script.
  if (state.seconds_left <= FINAL_QUESTION_SECONDS) {
    return state.asked.includes(last.order_idx)
      ? { kind: "end" }
      : { kind: "final", question: last };
  }

  // A declined topic is closed: no follow-up, no return by another route.
  if (!lastAnswerDeclined) {
    // Depth (D4): stay on a live angle while it is producing.
    if (angle && (state.depth?.turns ?? 0) < MAX_DEPTH_TURNS) {
      const current =
        byOrder.find((q) => q.order_idx === state.question_idx) ?? unasked[0];
      return { kind: "depth", question: current, angle };
    }

    if (lastAnswerThin && state.followups_used < MAX_FOLLOWUPS) {
      const current =
        byOrder.find((q) => q.order_idx === state.question_idx) ?? unasked[0];
      return { kind: "followup", question: current };
    }
  }

  // Out of time for the current block: move on rather than run over.
  if (state.seconds_left < budgetRemaining(state.block)) {
    const order: Block[] = ["1", "2", "3", "4"];
    const nextBlock = order[order.indexOf(state.block) + 1];
    if (nextBlock) {
      const first = unasked.find((q) => q.block === nextBlock);
      if (first) return { kind: "skip_block", question: first, from: state.block };
    }
  }

  return { kind: "next", question: unasked[0] };
}

/** Fold a move back into the state, ready for the next turn. */
export function advance(state: SessionState, move: Move): SessionState {
  switch (move.kind) {
    case "followup":
      return { ...state, followups_used: state.followups_used + 1 };
    case "depth":
      return {
        ...state,
        depth: {
          angle: move.angle,
          turns: (state.depth?.angle === move.angle ? state.depth.turns : 0) + 1,
        },
      };
    case "next":
    case "skip_block":
    case "final":
      return {
        ...state,
        block: move.question.block,
        question_idx: move.question.order_idx,
        followups_used: 0,
        depth: undefined,
        asked: [...state.asked, move.question.order_idx],
      };
    case "end":
      return state;
  }
}
