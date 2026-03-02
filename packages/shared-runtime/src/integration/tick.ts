/**
 * Integration layer:
 * tickCycle:
 *   1) Convert runtime state + inputs into DSL facts
 *   2) Call RulesEngine.tickFacts(...)
 *   3) Receive GameEvents
 *   4) Apply reducer
 */

import { GlobalState } from "../core/state.js";
import { GameEvent } from "../core/events.js";
import { PlayerCommand, EnvInput } from "../core/inputs.js";
import { applyMany } from "../runtime/apply.js";
import { stateToFacts, inputsToFacts, Fact } from "./factsBridge.js";

// RulesEngine adapter interface for fact-based evaluation
export interface RulesEngine {
  tickFacts(state: GlobalState, facts: Fact[]): GameEvent[];
}

export function tickCycle(
  state: GlobalState,
  engine: RulesEngine,
  cmds: PlayerCommand[],
  env: EnvInput[]
): { state: GlobalState; events: GameEvent[] } {
  const T = state.tick as unknown as number;

  const facts = stateToFacts(state, { tick: T });
  const inputFacts = inputsToFacts(cmds, env, { tick: T });

  const events = engine.tickFacts(state, [...facts, ...inputFacts]);

  const result = applyMany(state, events, { strict: false });
  return { state: result.state, events };
}
