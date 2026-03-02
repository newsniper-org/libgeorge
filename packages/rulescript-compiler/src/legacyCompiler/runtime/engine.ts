
import { RuleIR } from "../ir/eff";
import { FactStore } from "./facts";
import { evalRel } from "./eval_rel";
import { newEffResult, runEff } from "./eval_eff";

export interface TickResult {
  events: { type: string; args: any[]; n?: bigint }[];
  logs: any[];
}

function sortRules(rules: RuleIR[]): RuleIR[] {
  return [...rules].sort((a, b) => {
    const pa = a.phase ?? "";
    const pb = b.phase ?? "";
    if (pa !== pb) return pa < pb ? -1 : 1;
    const ra = a.priority ?? 0;
    const rb = b.priority ?? 0;
    if (ra !== rb) return ra - rb;
    return a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0;
  });
}

export function tick(store: FactStore, rules: RuleIR[]): TickResult {
  const acc = newEffResult();
  const sorted = sortRules(rules);

  for (const r of sorted) {
    const bindings = evalRel(r.body, store);
    for (const b of bindings) {
      runEff(r.per, b, acc, store);
    }
  }

  // Flatten events (set then bag). Ordering policy can be refined later.
  const events = [
    ...acc.eventsSet.map((e) => ({ type: e.type, args: e.args })),
    ...acc.eventsBag.map((e) => ({ type: e.type, args: e.args, n: e.n })),
  ];
  return { events, logs: acc.logs };
}
