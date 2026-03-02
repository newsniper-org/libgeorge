import { GlobalState } from "../core/state.js";
import { RulesEngine } from "../integration/tick.js";
import { Strategy, EnvModel } from "./strategy.js";
import { runGame, Termination } from "./runner.js";

export interface BatchSummary {
  games: number;
  avgTurns: number;
  avgRehabEntries: number;
  avgForgivenDebt: number;
  avgBasicIncomePaid: number;
  avgGovernmentFund: number;
  avgGiniNetWorth: number;
}

export function runBatch(
  seeds: number[],
  makeInitial: (seed: number) => GlobalState,
  engine: RulesEngine,
  strategy: Strategy,
  env: EnvModel,
  term: Termination
): BatchSummary {
  let sumTurns = 0;
  let sumRehab = 0;
  let sumForgive = 0;
  let sumBI = 0;
  let sumGovMean = 0;
  let sumGini = 0;

  for (const seed of seeds) {
    const init = makeInitial(seed);
    const { metrics } = runGame(init, engine, strategy, env, term);
    sumTurns += metrics.turns;
    sumRehab += metrics.rehabEntries;
    sumForgive += metrics.totalForgivenDebt;
    sumBI += metrics.totalBasicIncomePaid;
    sumGovMean += metrics.samples ? metrics.governmentFundSum / metrics.samples : 0;
    sumGini += metrics.giniNetWorth;
  }

  const n = seeds.length || 1;
  return {
    games: seeds.length,
    avgTurns: sumTurns / n,
    avgRehabEntries: sumRehab / n,
    avgForgivenDebt: sumForgive / n,
    avgBasicIncomePaid: sumBI / n,
    avgGovernmentFund: sumGovMean / n,
    avgGiniNetWorth: sumGini / n,
  };
}
