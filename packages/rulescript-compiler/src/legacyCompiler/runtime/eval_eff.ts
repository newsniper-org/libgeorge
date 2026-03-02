
import { Binding, Expr, Value } from "../ir/rel";
import { EffProg, EventTerm, LogItem } from "../ir/eff";
import { canonicalValue, eventKey } from "./facts";
import { evalBool, evalExpr, evalInt } from "./eval_expr";
import { evalRel } from "./eval_rel";
import { FactStore, valueEq } from "./facts";

export interface EffResult {
  eventsSet: { key: string; type: string; args: Value[] }[];
  eventsBag: { type: string; args: Value[]; n: bigint }[];
  logs: LogItem[];
}

function evalEventTerm(et: EventTerm, b: Binding): { type: string; args: Value[] } {
  const args = et.args.map((e) => canonicalValue(evalExpr(e, b)));
  return { type: et.type, args };
}

export function runEff(prog: EffProg, b: Binding, acc: EffResult, store: FactStore, tick?: { turn?: number; step?: number }): void {
  switch (prog.e) {
    case "pure":
      return;
    case "seq":
      runEff(prog.a, b, acc, store, tick);
      runEff(prog.b, b, acc, store, tick);
      return;
    case "guard":
      if (!evalBool(prog.cond, b)) return;
      return;
    case "tell": {
      // include binding if rule_fired and empty binding list
      if (prog.item.k === "rule_fired" && prog.item.binding.length === 0) {
        prog.item.binding = Array.from(b.entries()).map(([k, v]) => [k as any, v]);
      }
      acc.logs.push(prog.item);
      return;
    }
    case "emit": {
      const ev = evalEventTerm(prog.event, b);
      const key = eventKey(ev.type, ev.args, tick);
      // enforce set semantics
      if (acc.eventsSet.find((x) => x.key === key)) {
        throw new Error(`Duplicate emit(set) detected: ${key}`);
      }
      acc.eventsSet.push({ key, type: ev.type, args: ev.args });
      return;
    }
    case "emit_many": {
      const ev = evalEventTerm(prog.event, b);
      const n = evalInt(prog.n, b);
      if (n < 0n) throw new Error(`emit_many multiplicity must be >=0, got ${n}`);
      if (n === 0n) return;
      acc.eventsBag.push({ type: ev.type, args: ev.args, n });
      return;
    }
    case "choose_det": {
  // Evaluate candidate bindings correlated with current binding b
  const cd = prog as Extract<EffProg, { e: "choose_det" }>;
        const cands = evalRel(cd.candidates, store, [b]);
  if (cands.length === 0) return;

  // Compute ordering keys and stable tie-break key (canonical binding)
  function keyOf(bind: Binding): any[] {
    return cd.orderBy.map((e: Expr) => evalExpr(e, bind));
  }
  function stableKey(bind: Binding): string {
    // deterministic serialization: sorted by var name
    const entries = Array.from(bind.entries()).sort((x, y) => (x[0] as any).localeCompare(y[0] as any));
    return JSON.stringify(entries);
  }

  function cmpVal(a: any, b: any): number {
    if (a.k !== b.k) return a.k < b.k ? -1 : 1;
    switch (a.k) {
      case "int": return a.v < b.v ? -1 : a.v > b.v ? 1 : 0;
      case "float": return a.v < b.v ? -1 : a.v > b.v ? 1 : 0;
      case "str": return a.v < b.v ? -1 : a.v > b.v ? 1 : 0;
      case "bool": return (a.v === b.v) ? 0 : (a.v ? 1 : -1);
      case "entity": return a.v < b.v ? -1 : a.v > b.v ? 1 : 0;
      case "tuple": {
        const aa = a.v, bb = b.v;
        const n = Math.min(aa.length, bb.length);
        for (let i = 0; i < n; i++) {
          const c = cmpVal(aa[i], bb[i]);
          if (c !== 0) return c;
        }
        return aa.length - bb.length;
      }
    }
    return 0;
  }

  const decorated = cands.map((cb) => ({
    b: cb,
    k: keyOf(cb),
    s: stableKey(cb),
  }));

  decorated.sort((x, y) => {
    const n = Math.min(x.k.length, y.k.length);
    for (let i = 0; i < n; i++) {
      const c = cmpVal(x.k[i], y.k[i]);
      if (c !== 0) return c;
    }
    if (x.k.length !== y.k.length) return x.k.length - y.k.length;
    return x.s < y.s ? -1 : x.s > y.s ? 1 : 0;
  });

  const take = Math.max(0, cd.take | 0);
  for (let i = 0; i < Math.min(take, decorated.length); i++) {
    runEff(cd.then, decorated[i].b, acc, store, tick);
  }
  return;
}
  }
}

export function newEffResult(): EffResult {
  return { eventsSet: [], eventsBag: [], logs: [] };
}