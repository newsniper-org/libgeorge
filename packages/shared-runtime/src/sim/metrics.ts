import { GlobalState } from "../core/state.js";
import { GameEvent } from "../core/events.js";

export interface GameMetrics {
  turns: number;
  rehabEntries: number;
  rehabTurns: number;
  totalForgivenDebt: number;
  totalBasicIncomePaid: number;
  governmentFundSum: number;
  reliefFundSum: number;
  samples: number;
  finalMoneyByPlayer: Record<string, number>;
  finalDebtByPlayer: Record<string, number>;
  giniCash: number;
  giniNetWorth: number;
}

export class MetricsCollector {
  private turns = 0;
  private rehabEntries = 0;
  private rehabTurns = 0;
  private totalForgivenDebt = 0;
  private totalBasicIncomePaid = 0;

  private governmentFundSum = 0;
  private reliefFundSum = 0;
  private samples = 0;

  observe(state: GlobalState, events: GameEvent[]): void {
    this.turns += 1;

    this.samples += 1;
    this.governmentFundSum += state.governmentFund as unknown as number;
    this.reliefFundSum += state.reliefFund as unknown as number;

    for (const ev of events) {
      if (ev.type === "set_rehab" && ev.remainingTurns === 3) this.rehabEntries += 1;
      if (ev.type === "forgive_debt") this.totalForgivenDebt += ev.amount as unknown as number;
      if (ev.type === "transfer_money" && ev.reason === "basic_income") this.totalBasicIncomePaid += ev.amount as unknown as number;
    }

    for (const pid of Object.keys(state.players)) {
      if (state.players[pid].status.kind === "rehab") this.rehabTurns += 1;
    }
  }

  finalize(state: GlobalState): GameMetrics {
    const finalMoneyByPlayer: Record<string, number> = {};
    const finalDebtByPlayer: Record<string, number> = {};
    const cash: number[] = [];
    const net: number[] = [];

    for (const pid of Object.keys(state.players)) {
      const p = state.players[pid];
      const m = p.money as unknown as number;
      const d = p.debt as unknown as number;
      finalMoneyByPlayer[pid] = m;
      finalDebtByPlayer[pid] = d;
      cash.push(m);
      net.push(m - d);
    }

    return {
      turns: this.turns,
      rehabEntries: this.rehabEntries,
      rehabTurns: this.rehabTurns,
      totalForgivenDebt: this.totalForgivenDebt,
      totalBasicIncomePaid: this.totalBasicIncomePaid,
      governmentFundSum: this.governmentFundSum,
      reliefFundSum: this.reliefFundSum,
      samples: this.samples,
      finalMoneyByPlayer,
      finalDebtByPlayer,
      giniCash: gini(cash),
      giniNetWorth: gini(net),
    };
  }
}

export function gini(values: number[]): number {
  const xs = values.map((v) => (Number.isFinite(v) ? v : 0)).slice().sort((a, b) => a - b);
  const n = xs.length;
  const sum = xs.reduce((a, b) => a + b, 0);
  if (n === 0 || sum === 0) return 0;
  let cum = 0;
  for (let i = 0; i < n; i++) cum += (i + 1) * xs[i];
  return (2 * cum) / (n * sum) - (n + 1) / n;
}
