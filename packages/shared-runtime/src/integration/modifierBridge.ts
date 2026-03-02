import { GlobalState } from "../core/state.js";

/**
 * Compute multiplier products to inject into the DSL as facts if the DSL engine
 * does not support product aggregation.
 */
export function computeMultiplierProducts(state: GlobalState): {
  rent: Record<string, number>;
  fees: Record<string, number>;
  cash: Record<string, number>;
} {
  const rent: Record<string, number> = {};
  const fees: Record<string, number> = {};
  const cash: Record<string, number> = {};

  for (const pid of Object.keys(state.players)) {
    rent[pid] = 1.0;
    fees[pid] = 1.0;
    cash[pid] = 1.0;
  }

  for (const m of state.modifiers) {
    const targets = m.scope === "global" ? Object.keys(state.players)
      : (m.targetPlayer ? [m.targetPlayer as unknown as string] : []);
    if (typeof m.value !== "number") continue;

    for (const pid of targets) {
      if (m.kind === "rentMultiplier") rent[pid] *= m.value;
      if (m.kind === "feesMultiplier") fees[pid] *= m.value;
      if (m.kind === "cashMultiplier") cash[pid] *= m.value;
    }
  }
  return { rent, fees, cash };
}
