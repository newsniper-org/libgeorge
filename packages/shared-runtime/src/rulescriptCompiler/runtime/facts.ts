import { Binding, PredicateRef, Sym, Value } from "../ir/rel";

export type Fact = { pred: PredicateRef; args: Value[] };

// Index key helpers
function valueKey(v: Value): string {
  // stable serialization of value
  switch (v.k) {
    case "int": return `i:${v.v.toString()}`;
    case "float": return `f:${Number.isNaN(v.v) ? "NaN" : v.v.toString()}`;
    case "str": return `s:${v.v}`;
    case "bool": return `b:${v.v ? 1 : 0}`;
    case "entity": return `e:${v.v}`;
    case "tuple": return `t:[${v.v.map(valueKey).join(",")}]`;
  }
}

function tupleKey(args: Value[]): string {
  return args.map(valueKey).join("|");
}

export class FactStore {
  // pred -> tuples
  private byPred: Map<PredicateRef, Value[][]> = new Map();

  // pred -> pos -> valueKey -> tupleIndices[]
  private idx1: Map<PredicateRef, Map<number, Map<string, number[]>>> = new Map();
  // pred -> "i|j" -> "valKey_i|valKey_j" -> tupleIndices[]
  private idx2: Map<PredicateRef, Map<string, Map<string, number[]>>> = new Map();

  // pred -> arity
  private arity: Map<PredicateRef, number> = new Map();

  add(pred: PredicateRef, args: Value[]): void {
    const arr = this.byPred.get(pred) ?? [];
    const idx = arr.length;
    arr.push(args);
    this.byPred.set(pred, arr);
    this.arity.set(pred, args.length);

    // build single-column indexes (lazy-alloc)
    const predIdx = this.idx1.get(pred) ?? new Map<number, Map<string, number[]>>();
    for (let i = 0; i < args.length; i++) {
      const col = predIdx.get(i) ?? new Map<string, number[]>();
      const k = valueKey(args[i]);
      const bucket = col.get(k) ?? [];
      bucket.push(idx);
      col.set(k, bucket);
      predIdx.set(i, col);
    }
    this.idx1.set(pred, predIdx);

      // build 2-column indexes (simple all-pairs, can refine later)
      const predIdx2 = this.idx2.get(pred) ?? new Map<string, Map<string, number[]>>();
      for (let i = 0; i < args.length; i++) {
        for (let j = i + 1; j < args.length; j++) {
          const keyIJ = `${i}|${j}`;
          const mapIJ = predIdx2.get(keyIJ) ?? new Map<string, number[]>();
          const k = `${valueKey(args[i])}|${valueKey(args[j])}`;
          const bucket = mapIJ.get(k) ?? [];
          bucket.push(idx);
          mapIJ.set(k, bucket);
          predIdx2.set(keyIJ, mapIJ);
        }
      }
      this.idx2.set(pred, predIdx2);
  }

  addFact(f: Fact): void {
    this.add(f.pred, f.args);
  }

  tuples(pred: PredicateRef): Value[][] {
    return this.byPred.get(pred) ?? [];
  }

  // Return tuple indices matching a specific arg position & value. If no index exists, returns undefined.
  lookup1(pred: PredicateRef, pos: number, v: Value): number[] | undefined {
    const predIdx = this.idx1.get(pred);
    if (!predIdx) return undefined;
    const col = predIdx.get(pos);
    if (!col) return undefined;
    return col.get(valueKey(v));
  }

  lookup2(pred: PredicateRef, i: number, j: number, vi: Value, vj: Value): number[] | undefined {
      const predIdx2 = this.idx2.get(pred);
      if (!predIdx2) return undefined;
      const keyIJ = `${i}|${j}`;
      const mapIJ = predIdx2.get(keyIJ);
      if (!mapIJ) return undefined;
      return mapIJ.get(`${valueKey(vi)}|${valueKey(vj)}`);
    }

    getArity(pred: PredicateRef): number | undefined {
    return this.arity.get(pred);
  }
}

export function bindingClone(b: Binding): Binding {
  const out: Binding = new Map();
  for (const [k, v] of b.entries()) out.set(k, v);
  return out;
}

export function valueEq(a: Value, b: Value): boolean {
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

export function canonicalValue(v: Value): Value {
  // Placeholder for future canonicalization (e.g., normalize floats, entity casing)
  return v;
}

export function eventKey(type: string, args: Value[], tick?: { turn?: number; step?: number }): string {
  const payload = JSON.stringify([type, args], (_k, val) => {
    if (val && typeof val === "object" && "k" in val) return val;
    return val;
  });
  const t = tick ? `${tick.turn ?? ""}:${tick.step ?? ""}` : "";
  return `${t}|${payload}`;
}

export function tupleCanonicalKey(args: Value[]): string {
  return tupleKey(args.map(canonicalValue));
}
