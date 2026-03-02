import { GlobalState, InvariantViolation } from "../core/state.js";
import { GameEvent } from "../core/events.js";
import { applyEvent, ApplyOptions } from "./reducer.js";

export interface ApplyManyResult {
  state: GlobalState;
  violations: InvariantViolation[];
}

export function applyMany(state0: GlobalState, events: GameEvent[], opts: ApplyOptions = {}): ApplyManyResult {
  let s = state0;
  const all: InvariantViolation[] = [];
  for (const ev of events) {
    const r = applyEvent(s, ev, opts);
    s = r.state;
    all.push(...r.violations);
  }
  return { state: s, violations: all };
}
