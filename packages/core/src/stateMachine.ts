/**
 * Moment lifecycle state machine (PRD §11). The backend is the sole owner of Moment
 * state; clients render it. Transitions are validated so a Moment can never (for example)
 * settle before it is confirmed, or be rewarded twice.
 */
import type { MomentState } from "./types.js";

/** Allowed forward transitions. Anything not listed is rejected. */
const TRANSITIONS: Record<MomentState, MomentState[]> = {
  NORMAL: ["CANDIDATE"],
  CANDIDATE: ["DETECTING", "EXPIRED"],
  DETECTING: ["CONFIRMED", "EXPIRED"],
  CONFIRMED: ["CLIPPING"],
  CLIPPING: ["SETTLING", "CLIPPING"], // self-loop allows safe clip retry (PRD §35)
  SETTLING: ["PUBLISHED", "SETTLING"], // self-loop allows settlement retry (idempotent)
  PUBLISHED: ["SETTLED"],
  SETTLED: [],
  EXPIRED: [],
};

/** Terminal states — no further transitions. */
export const TERMINAL_STATES: MomentState[] = ["SETTLED", "EXPIRED"];

export function canTransition(from: MomentState, to: MomentState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: MomentState, to: MomentState): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal Moment transition: ${from} -> ${to}`);
  }
}

export function isTerminal(state: MomentState): boolean {
  return TERMINAL_STATES.includes(state);
}

/** Whether a Moment in this state should be shown in the public Moment feed. */
export function isPublic(state: MomentState): boolean {
  return state === "PUBLISHED" || state === "SETTLED";
}

/** Human, non-technical status label (PRD §24 live-state language). */
export function statusLabel(state: MomentState): string {
  switch (state) {
    case "NORMAL":
      return "Live";
    case "CANDIDATE":
    case "DETECTING":
      return "Moment detected";
    case "CONFIRMED":
      return "Moment confirmed";
    case "CLIPPING":
      return "Building the Moment";
    case "SETTLING":
      return "Reward settling";
    case "PUBLISHED":
      return "Reward settling";
    case "SETTLED":
      return "Reward received";
    case "EXPIRED":
      return "Faded out";
  }
}
