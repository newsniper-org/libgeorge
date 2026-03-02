import { SurfaceRule, BodyFrag } from "../ast/surface";
import { Rule, Body, Atom, Exists, Cond } from "../ast/core";

// Rewrite sugar (or/xor/forall/exact/at_least/at_most) into Core Rule[].
//
// Design:
// - or: rule splitting (DNF expansion)
// - xor(A,B): (A and not_exists(B)) OR (B and not_exists(A))
// - forall(x in D, P): not_exists(D and not_exists(P))  (i.e., not exists x in D s.t. not P)
// - exact/at_least/at_most: lowered to COUNT constraints. In this skeleton we emit a placeholder Exists
//   with a special predicate __count_constraint/.. that the IR compiler can recognize.
//   You can later replace this with explicit group_by/count nodes in the Core AST.

export interface RewriteOptions {
  // If true, keep disjunction as union-style later. For now we always split.
  maxRuleExpansion?: number;
}

type Conj = { atoms: Atom[]; exists: Exists[]; cards: any[]; conds: Cond[] };

function emptyConj(): Conj {
  return { atoms: [], exists: [], cards: [], conds: [] };
}

function mergeConj(a: Conj, b: Conj): Conj {
  return {
    atoms: [...a.atoms, ...b.atoms],
    exists: [...a.exists, ...b.exists],
    cards: [...a.cards, ...b.cards],
    conds: [...a.conds, ...b.conds],
  };
}

// Convert a fragment into DNF: array of conjunctions.
function toDNF(f: BodyFrag): Conj[] {
  switch (f.b) {
    case "atom": {
      const c = emptyConj();
      c.atoms.push(f.atom);
      return [c];
    }
    case "cond": {
      const c = emptyConj();
      c.conds.push(f.cond);
      return [c];
    }
    case "and": {
      return f.items.reduce<Conj[]>((acc, it) => {
        const d = toDNF(it);
        const out: Conj[] = [];
        for (const a of acc) for (const b of d) out.push(mergeConj(a, b));
        return out;
      }, [emptyConj()]);
    }
    case "or": {
      return f.items.flatMap(toDNF);
    }
    case "exists": {
      // exists(frag): represent as Exists{kind:"exists"} subquery with its own DNF (must be single conj)
      const d = toDNF(f.frag);
      const out: Conj[] = [];
      for (const conj of d) {
        const c = emptyConj();
        c.exists.push({ kind: "exists", atoms: conj.atoms, cond: conj.conds.length ? { c: "and", items: conj.conds } : undefined });
        c.exists.push(...conj.exists);
        c.cards.push(...conj.cards);
        out.push(c);
      }
      return out;
    }
    case "xor": {
      // xor(A,B) => (A and not_exists(B)) or (B and not_exists(A))
      const A = toDNF(f.a);
      const B = toDNF(f.b2);
      if (A.length !== 1 || B.length !== 1) {
        // Full generality is possible but may explode. Keep strict skeleton.
        throw new Error(`xor with disjunction inside operands not supported in this skeleton`);
      }
      const a = A[0];
      const b = B[0];
      const notB: Exists = { kind: "not_exists", atoms: b.atoms, cond: b.conds.length ? { c: "and", items: b.conds } : undefined };
      const notA: Exists = { kind: "not_exists", atoms: a.atoms, cond: a.conds.length ? { c: "and", items: a.conds } : undefined };
      return [mergeConj(a, { atoms: [], exists: [notB], cards: [], conds: [] }), mergeConj(b, { atoms: [], exists: [notA], cards: [], conds: [] })];
    }
    case "forall": {
  // forall(v in D, P) => for each disjunct Di of D: count( Di where not P ) == 0
  const D = toDNF(f.domain);
  const P = toDNF(f.pred);

  // not exists(P1 or P2) == not_exists(P1) AND not_exists(P2)
  const notP: Exists[] = P.map((p) => ({ kind: "not_exists", atoms: p.atoms, cond: p.conds.length ? { c: "and", items: p.conds } : undefined } as Exists));

  const out: Conj[] = [];
  for (const d of D) {
    const c = emptyConj();
    // violation subquery: D conjunct atoms/exists/conds plus not_exists(Pi) for all Pi
    c.cards.push({
      op: "==",
      n: { t: "lit", lit: { t: "int", v: 0n } },
      atoms: d.atoms,
      exists: [...(d.exists ?? []), ...notP, ...P.flatMap((x) => x.exists)],
      cond: d.conds.length ? { c: "and", items: d.conds } : undefined,
      by: f.v ? [f.v.name] : undefined,
    });
    c.cards.push(...d.cards);
    out.push(c);
  }
  return out;
}
    case "exact":
    case "at_least":
    case "at_most": {
      const d = toDNF(f.frag);
      if (d.length !== 1) throw new Error(`cardinality constraints over disjunction not supported in this skeleton`);
      const conj = d[0];

      const op = f.b === "exact" ? "==" : f.b === "at_least" ? ">=" : "<=";

      const c = emptyConj();
      // Attach a cardinality constraint node (core AST)
      c.cards.push({
        op,
        n: f.n,
        atoms: conj.atoms,
        exists: conj.exists.length ? conj.exists : undefined,
        cond: conj.conds.length ? { c: "and", items: conj.conds } : undefined,
        by: f.by,
      });
      return [c];
    }
  }
}

function conjToBody(c: Conj): Body {
  return {
    atoms: c.atoms,
    exists: c.exists.length ? c.exists : undefined,
    cards: c.cards.length ? (c.cards as any) : undefined,
    cond: c.conds.length ? (c.conds.length === 1 ? c.conds[0] : { c: "and", items: c.conds }) : undefined,
  };
}

export function rewriteRule(rule: SurfaceRule, _opts?: RewriteOptions): Rule[] {
  const dnfs = toDNF(rule.body);
  return dnfs.map((c, i) => ({
    id: dnfs.length === 1 ? rule.id : `${rule.id}#${i + 1}`,
    phase: rule.phase,
    priority: rule.priority,
    head: rule.head as any,
    body: conjToBody(c),
  }));
}

export function rewriteProgram(rules: SurfaceRule[], opts?: RewriteOptions): Rule[] {
  return rules.flatMap((r) => rewriteRule(r, opts));
}
