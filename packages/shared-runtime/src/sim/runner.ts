import { GlobalState } from "../core/state.js";
import { PlayerCommand, EnvInput } from "../core/inputs.js";
import { tickCycle, RulesEngine } from "../integration/tick.js";
import { MetricsCollector, GameMetrics } from "./metrics.js";
import { Strategy, EnvModel } from "./strategy.js";

export interface Termination {
  maxTicks: number;
  isTerminal?: (state: GlobalState) => boolean;
}

export interface SimulationResult {
  final: GlobalState;
  metrics: GameMetrics;
}

export function runGame(
  initial: GlobalState,
  engine: RulesEngine,
  strategy: Strategy,
  env: EnvModel,
  term: Termination
): SimulationResult {
  let state = initial;
  const collector = new MetricsCollector();

  for (let t = 0; t < term.maxTicks; t++) {
    if (term.isTerminal && term.isTerminal(state)) break;

    const cmds: PlayerCommand[] = strategy.decide(state);
    const envInputs: EnvInput[] = env.sample(state);

    const out = tickCycle(state, engine, cmds, envInputs);
    state = out.state;
    collector.observe(state, out.events);
  }

  return { final: state, metrics: collector.finalize(state) };
}
