import { Constraint } from "./constraints";
import { TypeError } from "./errors";
import { TypeExpr, TVarId } from "./type_expr";
import { sortEq } from "./sort";

export type Subst = Map<TVarId, TypeExpr>;

export function apply(sub: Subst, t: TypeExpr): TypeExpr {
  if (t.k === "var") {
    const r = sub.get(t.v);
    return r ? apply(sub, r) : t;
  }
  if (t.k === "tuple") return { k: "tuple", items: t.items.map((x) => apply(sub, x)) };
  return t;
}

function occurs(v: TVarId, t: TypeExpr, sub: Subst): boolean {
  const tt = apply(sub, t);
  if (tt.k === "var") return tt.v === v;
  if (tt.k === "tuple") return tt.items.some((x) => occurs(v, x, sub));
  return false;
}

function unifyOne(a0: TypeExpr, b0: TypeExpr, sub: Subst, why: string): void {
  const a = apply(sub, a0);
  const b = apply(sub, b0);

  if (a.k === "var") {
    if (b.k === "var" && a.v === b.v) return;
    if (occurs(a.v, b, sub)) throw new TypeError("OccursCheck", `Occurs check failed`, { why });
    sub.set(a.v, b);
    return;
  }
  if (b.k === "var") {
    unifyOne(b, a, sub, why);
    return;
  }

  if (a.k === "sort" && b.k === "sort") {
    if (!sortEq(a.s, b.s)) {
      throw new TypeError("TypeMismatch", `Type mismatch`, { why, a: a.s, b: b.s });
    }
    return;
  }

  if (a.k === "tuple" && b.k === "tuple") {
    if (a.items.length !== b.items.length) throw new TypeError("TypeMismatch", `Tuple arity mismatch`, { why });
    for (let i = 0; i < a.items.length; i++) unifyOne(a.items[i], b.items[i], sub, `${why} tuple[${i}]`);
    return;
  }

  throw new TypeError("TypeMismatch", `Type mismatch`, { why, a, b });
}

export function solveConstraints(cs: Constraint[]): Subst {
  const sub: Subst = new Map();

  // First pass unify equals.
  for (const c of cs) {
    if (c.kind === "eq") unifyOne(c.a, c.b, sub, c.why);
  }

  // Second pass: check special constraints.
  for (const c of cs) {
    if (c.kind === "isInt" || c.kind === "isNonNegInt") {
      const t = apply(sub, c.a);
      if (t.k === "sort") {
        if (!(t.s.kind === "prim" && t.s.name === "Int")) {
          throw new TypeError("TypeMismatch", `Expected Int`, { why: c.why, got: t.s });
        }
      }
      // If still var, we leave it; caller may treat unresolved as error.
    }
  }

  return sub;
}
