
import { Atom, Binding, Expr, RelPlan, Sym, Value } from "../ir/rel";
import { FactStore, bindingClone, valueEq } from "./facts";
import { evalBool, evalExpr, evalInt } from "./eval_expr";

type Bindings = Binding[];

function unifyAtom(atom: Atom, tuple: Value[], b0: Binding): Binding | null {
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
      // expression pattern: evaluate and compare (vars must be bound)
      const pv = evalExpr(pat, b);
      if (!valueEq(pv, tv)) return null;
    }
  }
  return b;
}

function joinBindings(a: Bindings, b: Bindings): Bindings {
  const out: Bindings = [];
  for (const ba of a) {
    for (const bb of b) {
      let ok = true;
      const merged = bindingClone(ba);
      for (const [k, v] of bb.entries()) {
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

function distinctBindings(bs: Bindings, vars?: Sym[]): Bindings {
  const keyVars = vars ?? Array.from(new Set(bs.flatMap(b => Array.from(b.keys()))));
  const seen = new Set<string>();
  const out: Bindings = [];
  for (const b of bs) {
    const key = JSON.stringify(keyVars.map(v => [v, b.get(v) ?? null]));
    if (!seen.has(key)) { seen.add(key); out.push(b); }
  }
  return out;
}

function projectBinding(b: Binding, vars: Sym[]): Binding {
  const out: Binding = new Map();
  for (const v of vars) {
    const val = b.get(v);
    if (val) out.set(v, val);
  }
  return out;
}

function groupBy(bs: Bindings, keys: Sym[]): Map<string, Binding[]> {
  const m = new Map<string, Binding[]>();
  for (const b of bs) {
    const key = JSON.stringify(keys.map(k => [k, b.get(k) ?? null]));
    const arr = m.get(key) ?? [];
    arr.push(b);
    m.set(key, arr);
  }
  return m;
}

export function evalRel(plan: RelPlan, store: FactStore, seedBindings?: Bindings): Bindings {
    plan = optimizeJoinOrder(plan, store);
  switch (plan.op) {
    case "scan": {
        const seeds = seedBindings ?? [new Map()];
        return scanWithIndex(plan.atom, store, seeds);
      }
    case "join": {
  // Evaluate lhs first, then evaluate rhs correlated with each lhs binding.
  const left = evalRel(plan.lhs, store, seedBindings);
  const out: Bindings = [];
  for (const lb of left) {
    const right = evalRel(plan.rhs, store, [lb]);
    for (const rb of right) {
      // merge (should be consistent due to correlation; still verify)
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
      return src.filter(b => evalBool(plan.cond, b));
    }
    case "project": {
      const src = evalRel(plan.src, store, seedBindings);
      return src.map(b => projectBinding(b, plan.vars));
    }
    case "distinct": {
      const src = evalRel(plan.src, store, seedBindings);
      return distinctBindings(src);
    }
    case "group_by": {
      const src = evalRel(plan.src, store, seedBindings);
      const grouped = groupBy(src, plan.keys);
      const out: Bindings = [];
      for (const [k, rows] of grouped.entries()) {
        // representative binding includes key vars from first row
        const rep = projectBinding(rows[0], plan.keys);
        for (const agg of plan.aggs) {
          if (agg.kind === "count") {
            rep.set(agg.out as any, { k: "int", v: BigInt(rows.length) });
          } else if (agg.kind === "sum") {
            let s = 0;
            for (const r of rows) s += (evalExpr(agg.expr!, r) as any).v ?? 0;
            rep.set(agg.out as any, { k: "float", v: s });
          } else if (agg.kind === "min") {
            let m: Value | null = null;
            for (const r of rows) {
              const v = evalExpr(agg.expr!, r);
              if (!m || (v.k === "float" && m.k === "float" ? v.v < m.v : false)) m = v;
            }
            if (m) rep.set(agg.out as any, m);
          } else if (agg.kind === "max") {
            let m: Value | null = null;
            for (const r of rows) {
              const v = evalExpr(agg.expr!, r);
              if (!m || (v.k === "float" && m.k === "float" ? v.v > m.v : false)) m = v;
            }
            if (m) rep.set(agg.out as any, m);
          }
        }
        out.push(rep);
      }
      return out;
    }
    case "exists":
    case "not_exists": {
      const src = evalRel(plan.src, store, seedBindings);
      const out: Bindings = [];
      for (const b of src) {
        const sub = evalRel(plan.sub, store, [b]);
        const ok = sub.length > 0;
        if ((plan.op === "exists" && ok) || (plan.op === "not_exists" && !ok)) out.push(b);
      }
      return out;
    }
    case "card": {
      const src = evalRel(plan.src, store, seedBindings);
      const out: Bindings = [];
      for (const b of src) {
        const sub = evalRel(plan.sub, store, [b]);
        let cnt: bigint;
        if (plan.by && plan.by.length) {
          const keys = plan.by as any;
          const distinct = distinctBindings(sub, keys);
          cnt = BigInt(distinct.length);
        } else {
          cnt = BigInt(sub.length);
        }
        const n = evalInt(plan.n, b);
        const pass = plan.cmp === "==" ? (cnt === n) : plan.cmp === ">=" ? (cnt >= n) : (cnt <= n);
        if (pass) out.push(b);
      }
      return out;
    }
  }
}function scanWithIndex(planAtom: Atom, store: FactStore, seeds: Bindings): Bindings {
  const tuplesAll = store.tuples(planAtom.pred);
  const out: Bindings = [];
  for (const s of seeds) {
    // Determine best filter (pos,value) based on literals or already-bound vars.
    let bestPos: number | null = null;
    let bestVal: Value | null = null;
    let bestCount: number | null = null;

    // Try 2-column index first
      for (let i = 0; i < planAtom.args.length; i++) {
        for (let j = i + 1; j < planAtom.args.length; j++) {
          const pi = planAtom.args[i];
          const pj = planAtom.args[j];
          let vi: Value | null = null;
          let vj: Value | null = null;
          if (pi.t === "lit") vi = pi.value;
          else if (pi.t === "var") vi = s.get(pi.name) ?? null;
          if (pj.t === "lit") vj = pj.value;
          else if (pj.t === "var") vj = s.get(pj.name) ?? null;
          if (vi && vj) {
            const idx2 = store.lookup2(planAtom.pred, i, j, vi, vj);
            if (idx2) {
              for (const ti of idx2) {
                const tup = tuplesAll[ti];
                const b2 = unifyAtom(planAtom, tup, s);
                if (b2) out.push(b2);
              }
              return out;
            }
          }
        }
      }

      for (let i = 0; i < planAtom.args.length; i++) {
      const pat = planAtom.args[i];
      let v: Value | null = null;
      if (pat.t === "lit") v = pat.value;
      else if (pat.t === "var") {
        const bound = s.get(pat.name);
        if (bound) v = bound;
      }
      if (v) {
        const idx = store.lookup1(planAtom.pred, i, v);
        if (idx) {
          const cnt = idx.length;
          if (bestCount === null || cnt < bestCount) {
            bestCount = cnt;
            bestPos = i;
            bestVal = v;
          }
        }
      }
    }

    if (bestPos !== null && bestVal !== null) {
      const idx = store.lookup1(planAtom.pred, bestPos, bestVal) ?? [];
      for (const ti of idx) {
        const tup = tuplesAll[ti];
        const b2 = unifyAtom(planAtom, tup, s);
        if (b2) out.push(b2);
      }
    } else {
      for (const tup of tuplesAll) {
        const b2 = unifyAtom(planAtom, tup, s);
        if (b2) out.push(b2);
      }
    }
  }
  return out;
}

function flattenJoin(plan: RelPlan): RelPlan[] {
  if (plan.op === "join") return [...flattenJoin(plan.lhs), ...flattenJoin(plan.rhs)];
  return [plan];
}

function rebuildLeftDeep(plans: RelPlan[]): RelPlan {
  if (plans.length === 0) throw new Error("empty join");
  return plans.reduce((a, b) => ({ op: "join", lhs: a, rhs: b } as RelPlan));
}

function estimateScanSize(p: RelPlan, store: FactStore): number {
  if (p.op === "scan") return store.tuples(p.atom.pred).length;
  if (p.op === "filter") return estimateScanSize(p.src, store) * 0.5;
  if (p.op === "distinct") return estimateScanSize(p.src, store) * 0.7;
  if (p.op === "project") return estimateScanSize(p.src, store);
  if (p.op === "group_by") return estimateScanSize(p.src, store) * 0.3;
  if (p.op === "exists" || p.op === "not_exists" || p.op === "card") return estimateScanSize(p.src, store);
  if (p.op === "join") return estimateScanSize(p.lhs, store) * estimateScanSize(p.rhs, store);
  return 1;
}

function optimizeJoinOrder(plan: RelPlan, store: FactStore): RelPlan {
  // Only reorder pure join chains of scans/filters/etc. We keep correlated semantics correct because
  // our join evaluation correlates rhs with lhs binding. Left-deep reordering is safe for conjunctive queries.
  if (plan.op !== "join") return plan;
  const parts = flattenJoin(plan).map((p) => optimizeJoinOrder(p, store));
  // heuristic: sort by estimated base size (ascending)
  parts.sort((a, b) => estimateScanSize(a, store) - estimateScanSize(b, store));
  return rebuildLeftDeep(parts);
}


