import { RuleIR } from "../integration/rulesEngineAdapter.js";
import { Fact } from "../integration/factsBridge.js";

type Sym = string;

export type Value =
  | { k: "int"; v: bigint }
  | { k: "float"; v: number }
  | { k: "str"; v: string }
  | { k: "bool"; v: boolean }
  | { k: "entity"; v: string }
  | { k: "tuple"; v: Value[] };

export type Expr =
  | { t: "var"; name: Sym }
  | { t: "lit"; value: Value }
  | { t: "bin"; op: "+" | "-" | "*" | "/" | "mod" | "==" | "!=" | "<" | "<=" | ">" | ">="; a: Expr; b: Expr }
  | { t: "call"; fn: string; args: Expr[] };

export type Binding = Map<Sym, Value>;

function valueEq(a: Value, b: Value): boolean {
  if (a.k !== b.k) return false;
  switch (a.k) {
    case "int": return a.v === (b as any).v;
    case "float": return Object.is(a.v, (b as any).v);
    case "str": return a.v === (b as any).v;
    case "bool": return a.v === (b as any).v;
    case "entity": return a.v === (b as any).v;
    case "tuple": {
      const aa = a.v, bb = (b as any).v as Value[];
      return aa.length === bb.length && aa.every((x, i) => valueEq(x, bb[i]));
    }
  }
}

export class FactStore {
  private byPred: Map<string, Value[][]> = new Map();

  add(pred: string, args: Value[]): void {
    const arr = this.byPred.get(pred) ?? [];
    arr.push(args);
    this.byPred.set(pred, arr);
  }

  tuples(pred: string): Value[][] {
    return this.byPred.get(pred) ?? [];
  }
}

function evalExpr(expr: Expr, b: Binding): Value {
  switch (expr.t) {
    case "lit": return expr.value;
    case "var": {
      const v = b.get(expr.name);
      if (!v) throw new Error(`Unbound var: ${expr.name}`);
      return v;
    }
    case "bin": {
      const a = evalExpr(expr.a, b);
      const c = evalExpr(expr.b, b);
      const asFloat = (v: Value) => (v.k === "float" ? v.v : v.k === "int" ? Number(v.v) : (() => { throw new Error("not num"); })());
      const asInt = (v: Value) => (v.k === "int" ? v.v : (() => { throw new Error("not int"); })());
      switch (expr.op) {
        case "==": return { k: "bool", v: valueEq(a, c) };
        case "!=": return { k: "bool", v: !valueEq(a, c) };
        case "<": return { k: "bool", v: asFloat(a) < asFloat(c) };
        case "<=": return { k: "bool", v: asFloat(a) <= asFloat(c) };
        case ">": return { k: "bool", v: asFloat(a) > asFloat(c) };
        case ">=": return { k: "bool", v: asFloat(a) >= asFloat(c) };
        case "+": return { k: "float", v: asFloat(a) + asFloat(c) };
        case "-": return { k: "float", v: asFloat(a) - asFloat(c) };
        case "*": return { k: "float", v: asFloat(a) * asFloat(c) };
        case "/": return { k: "float", v: asFloat(a) / asFloat(c) };
        case "mod": return { k: "int", v: asInt(a) % asInt(c) };
      }
    }
    case "call": {
      if (expr.fn === "and") {
        for (const a of expr.args) {
          const v = evalExpr(a, b);
          if (v.k !== "bool") throw new Error("and expects bool");
          if (!v.v) return { k: "bool", v: false };
        }
        return { k: "bool", v: true };
      }
      if (expr.fn === "or") {
        for (const a of expr.args) {
          const v = evalExpr(a, b);
          if (v.k !== "bool") throw new Error("or expects bool");
          if (v.v) return { k: "bool", v: true };
        }
        return { k: "bool", v: false };
      }
      throw new Error(`Unknown call: ${expr.fn}`);
    }
  }
}

function evalBool(expr: Expr, b: Binding): boolean {
  const v = evalExpr(expr, b);
  if (v.k !== "bool") throw new Error("expected bool");
  return v.v;
}

function evalInt(expr: Expr, b: Binding): bigint {
  const v = evalExpr(expr, b);
  if (v.k === "int") return v.v;
  if (v.k === "float") return BigInt(Math.trunc(v.v));
  throw new Error("expected int");
}

function bindingClone(b: Binding): Binding {
  const out: Binding = new Map();
  for (const [k, v] of b.entries()) out.set(k, v);
  return out;
}

function unifyAtom(atom: { pred: string; args: Expr[] }, tuple: Value[], b0: Binding): Binding | null {
  const b = bindingClone(b0);
  if (atom.args.length !== tuple.length) return null;
  for (let i = 0; i < atom.args.length; i++) {
    const pat = atom.args[i];
    const tv = tuple[i];
    if (pat.t === "lit") {
      if (!valueEq(pat.value, tv)) return null;
    } else if (pat.t === "var") {
      const cur = b.get(pat.name);
      if (cur) {
        if (!valueEq(cur, tv)) return null;
      } else {
        b.set(pat.name, tv);
      }
    } else {
      const pv = evalExpr(pat, b);
      if (!valueEq(pv, tv)) return null;
    }
  }
  return b;
}

export function evalRel(plan: any, store: FactStore, seedBindings?: Binding[]): Binding[] {
  switch (plan.op) {
    case "scan": {
      const tuples = store.tuples(plan.atom.pred);
      const seeds = seedBindings ?? [new Map()];
      const out: Binding[] = [];
      for (const s of seeds) {
        for (const tup of tuples) {
          const b2 = unifyAtom(plan.atom, tup, s);
          if (b2) out.push(b2);
        }
      }
      return out;
    }
    case "join": {
      const left = evalRel(plan.lhs, store, seedBindings);
      const out: Binding[] = [];
      for (const lb of left) {
        const right = evalRel(plan.rhs, store, [lb]);
        for (const rb of right) {
          let ok = true;
          const merged = bindingClone(lb);
          for (const [k, v] of rb.entries()) {
            const cur = merged.get(k);
            if (cur) {
              if (!valueEq(cur, v)) { ok = false; break; }
            } else merged.set(k, v);
          }
          if (ok) out.push(merged);
        }
      }
      return out;
    }
    case "filter": {
      const src = evalRel(plan.src, store, seedBindings);
      return src.filter((b) => evalBool(plan.cond, b));
    }
    case "exists":
    case "not_exists": {
      const src = evalRel(plan.src, store, seedBindings);
      const out: Binding[] = [];
      for (const b of src) {
        const sub = evalRel(plan.sub, store, [b]);
        const ok = sub.length > 0;
        if ((plan.op === "exists" && ok) || (plan.op === "not_exists" && !ok)) out.push(b);
      }
      return out;
    }
    case "card": {
      const src = evalRel(plan.src, store, seedBindings);
      const out: Binding[] = [];
      for (const b of src) {
        const sub = evalRel(plan.sub, store, [b]);
        let cnt: bigint;
        if (plan.by && plan.by.length) {
          const keyVars: string[] = plan.by;
          const seen = new Set<string>();
          for (const sb of sub) {
            const key = JSON.stringify(keyVars.map((v) => [v, sb.get(v) ?? null]));
            seen.add(key);
          }
          cnt = BigInt(seen.size);
        } else {
          cnt = BigInt(sub.length);
        }
        const n = evalInt(plan.n, b);
        const pass = plan.cmp === "==" ? (cnt === n) : plan.cmp === ">=" ? (cnt >= n) : (cnt <= n);
        if (pass) out.push(b);
      }
      return out;
    }
    default:
      throw new Error(`Unsupported RelPlan op: ${plan.op}`);
  }
}

function evalEventTerm(et: any, b: Binding): { type: string; args: unknown[] } {
  const args = et.args.map((e: Expr) => {
    const v = evalExpr(e, b);
    // convert Value -> JS primitive / object for adapter
    return valueToJs(v);
  });
  return { type: et.type, args };
}

function valueToJs(v: Value): unknown {
  switch (v.k) {
    case "int": return v.v; // bigint
    case "float": return v.v;
    case "str": return v.v;
    case "bool": return v.v;
    case "entity": return v.v;
    case "tuple": return v.v.map(valueToJs);
  }
}

export function runEff(prog: any, b: Binding, out: { events: { type: string; args: unknown[]; n?: bigint }[] }): void {
  switch (prog.e) {
    case "pure": return;
    case "seq":
      runEff(prog.a, b, out);
      runEff(prog.b, b, out);
      return;
    case "guard":
      if (!evalBool(prog.cond, b)) return;
      return;
    case "tell":
      return;
    case "emit": {
      const ev = evalEventTerm(prog.event, b);
      out.events.push(ev);
      return;
    }
    case "emit_many": {
      const ev = evalEventTerm(prog.event, b);
      const n = evalInt(prog.n, b);
      if (n <= 0n) return;
      out.events.push({ ...ev, n });
      return;
    }
    case "choose_det": {
      // Minimal choose_det: evaluate candidates correlated, sort by orderBy values (lexicographic)
      const cands = evalRel(prog.candidates, (out as any).__store, [b]);
      const orderBy = (bind: Binding) => prog.orderBy.map((e: Expr) => evalExpr(e, bind));
      const stableKey = (bind: Binding) => {
        const entries = Array.from(bind.entries()).sort((x,y)=>x[0].localeCompare(y[0]));
        return JSON.stringify(entries.map(([k,v])=>[k,valueToJs(v)]));
      };
      const cmpVal = (a: Value, b: Value): number => {
        if (a.k !== b.k) return a.k < b.k ? -1 : 1;
        switch (a.k) {
          case "int": return a.v < (b as any).v ? -1 : a.v > (b as any).v ? 1 : 0;
          case "float": return a.v < (b as any).v ? -1 : a.v > (b as any).v ? 1 : 0;
          case "str": return a.v < (b as any).v ? -1 : a.v > (b as any).v ? 1 : 0;
          case "bool": return a.v === (b as any).v ? 0 : a.v ? 1 : -1;
          case "entity": return a.v < (b as any).v ? -1 : a.v > (b as any).v ? 1 : 0;
          case "tuple": {
            const aa=a.v, bb=(b as any).v as Value[];
            const n=Math.min(aa.length, bb.length);
            for (let i=0;i<n;i++){ const c=cmpVal(aa[i], bb[i]); if(c) return c; }
            return aa.length-bb.length;
          }
        }
      };
      const decorated = cands.map((cb: Binding) => ({ b: cb, k: orderBy(cb), s: stableKey(cb) }));
      decorated.sort((x,y)=>{
        const n=Math.min(x.k.length,y.k.length);
        for (let i=0;i<n;i++){
          const c=cmpVal(x.k[i], y.k[i]);
          if(c) return c;
        }
        if (x.k.length!==y.k.length) return x.k.length-y.k.length;
        return x.s < y.s ? -1 : x.s > y.s ? 1 : 0;
      });
      const take = Math.max(0, prog.take|0);
      for (let i=0;i<Math.min(take, decorated.length);i++){
        runEff(prog.then, decorated[i].b, out);
      }
      return;
    }
    default:
      throw new Error(`Unsupported EffProg node: ${prog.e}`);
  }
}

// ---- Fact coercion ----
export function factArgsToValues(args: unknown[]): Value[] {
  return args.map(jsToValue);
}

export function jsToValue(x: unknown): Value {
  if (typeof x === "bigint") return { k: "int", v: x };
  if (typeof x === "number") {
    // Treat integers as int when safe
    if (Number.isInteger(x)) return { k: "int", v: BigInt(x) };
    return { k: "float", v: x };
  }
  if (typeof x === "string") return { k: "entity", v: x };
  if (typeof x === "boolean") return { k: "bool", v: x };
  if (Array.isArray(x)) return { k: "tuple", v: x.map(jsToValue) };
  // fallback stringify
  return { k: "str", v: JSON.stringify(x) };
}

// ---- Public runtime: evalTick ----
export function evalTick(ir: RuleIR[], facts: Fact[]): { events: { type: string; args: unknown[]; n?: bigint }[] } {
  const store = new FactStore();
  for (const f of facts) {
    const [pred, ...args] = f;
    store.add(pred, factArgsToValues(args));
  }

  // Evaluate each rule, collect events
  const eventsOut: { events: { type: string; args: unknown[]; n?: bigint }[]; __store?: FactStore } = { events: [], __store: store };

  // deterministic rule order: phase, priority, ruleId (mirrors earlier engine.ts sort)
  const sorted = [...ir].sort((a, b) => {
    const pa = a.phase ?? "";
    const pb = b.phase ?? "";
    if (pa !== pb) return pa < pb ? -1 : 1;
    const ra = a.priority ?? 0;
    const rb = b.priority ?? 0;
    if (ra !== rb) return ra - rb;
    return a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0;
  });

  for (const r of sorted) {
    const bindings = evalRel(r.body, store);
    for (const b of bindings) {
      runEff(r.per, b, eventsOut);
    }
  }

  return { events: eventsOut.events };
}
