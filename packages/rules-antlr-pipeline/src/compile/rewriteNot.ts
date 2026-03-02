import { Atom, Cond } from "../ast/core.js";
import { BodyFrag, SurfaceRule } from "../ast/surface.js";
import { Body, Exists, Rule } from "../ast/coreRule.js";

/**
 * Minimal rewrite that *only* addresses `not atom` by lowering it to `not_exists(atom)`.
 *
 * Assumption:
 * - In this project, `not` is only generated for `not atom` (see grammar negation rule).
 * - Therefore De Morgan transformations are not required here.
 *
 * If you later allow `not (A and B)` or `not (A or B)`, add a full boolean normalization pass.
 */

type Conj = { atoms: Atom[]; exists: Exists[]; conds: Cond[]; cards: any[] };

function emptyConj(): Conj { return { atoms: [], exists: [], conds: [], cards: [] }; }

function merge(a: Conj, b: Conj): Conj {
  return { atoms: [...a.atoms, ...b.atoms], exists: [...a.exists, ...b.exists], conds: [...a.conds, ...b.conds], cards: [...a.cards, ...b.cards] };
}

function toDNF(f: BodyFrag): Conj[] {
  switch (f.b) {
    case "atom": {
      const c = emptyConj(); c.atoms.push(f.atom); return [c];
    }
    case "cond": {
      const c = emptyConj(); c.conds.push(f.cond); return [c];
    }
    case "and": {
      return f.items.reduce<Conj[]>((acc, it) => {
        const d = toDNF(it);
        const out: Conj[] = [];
        for (const a of acc) for (const b of d) out.push(merge(a, b));
        return out;
      }, [emptyConj()]);
    }
    case "or": {
      return f.items.flatMap(toDNF);
    }
    case "exists": {
      const d = toDNF(f.frag);
      // distribute exists over disjunction: exists(A or B) => exists(A) or exists(B)
      return d.map((conj) => {
        const c = emptyConj();
        c.exists.push({ kind: "exists", atoms: conj.atoms, cond: conj.conds.length ? { c: "and", items: conj.conds } : undefined });
        c.exists.push(...conj.exists);
        c.cards.push(...conj.cards);
        return c;
      });
    }
    case "not": {
      // our grammar produces not(atom) only; treat as not_exists(atom)
      const d = toDNF(f.frag);
      if (d.length !== 1) throw new Error("not(...) expects a single conjunction in this minimal pass");
      const conj = d[0];
      const c = emptyConj();
      // not_exists over the atom-conjunction
      c.exists.push({ kind: "not_exists", atoms: conj.atoms, cond: conj.conds.length ? { c: "and", items: conj.conds } : undefined });
      c.exists.push(...conj.exists);
      c.cards.push(...conj.cards);
      return [c];
    }
    case "forall":
    case "xor":
    case "exact":
    case "at_least":
    case "at_most":
      // left to your existing rewrite passes; this file is deliberately minimal.
      // If needed, wire your full rewrite here.
      throw new Error(`rewriteNot.ts does not handle '${f.b}'`);
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

export function lowerNotOnly(rule: SurfaceRule): Rule[] {
  const dnfs = toDNF(rule.body);
  return dnfs.map((c, i) => ({
    id: dnfs.length === 1 ? rule.id : `${rule.id}#${i+1}`,
    head: rule.head as any,
    body: conjToBody(c),
  }));
}
