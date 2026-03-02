import { Atom, Cond, Sym, Term } from "../ast/core.js";
import { BodyFrag, SurfaceRule } from "../ast/surface.js";
import { Body, CardConstraint, Exists, Rule } from "../ast/coreRule.js";

type Conj = { atoms: Atom[]; exists: Exists[]; cards: CardConstraint[]; conds: Cond[] };

function emptyConj(): Conj { return { atoms: [], exists: [], cards: [], conds: [] }; }

function merge(a: Conj, b: Conj): Conj {
  return {
    atoms: [...a.atoms, ...b.atoms],
    exists: [...a.exists, ...b.exists],
    cards: [...a.cards, ...b.cards],
    conds: [...a.conds, ...b.conds],
  };
}

function toAndCond(conds: Cond[]): Cond | undefined {
  if (!conds.length) return undefined;
  return conds.length === 1 ? conds[0] : { c: "and", items: conds };
}

function conjToBody(c: Conj): Body {
  return {
    atoms: c.atoms,
    exists: c.exists.length ? c.exists : undefined,
    cards: c.cards.length ? c.cards : undefined,
    cond: toAndCond(c.conds),
  };
}

// Convert a fragment into DNF: array of conjunctions
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
      // distribute exists over DNF: exists(A or B) => exists(A) or exists(B)
      const ds = toDNF(f.frag);
      return ds.map((conj) => {
        const c = emptyConj();
        c.exists.push({ kind: "exists", atoms: conj.atoms, cond: toAndCond(conj.conds) });
        c.exists.push(...conj.exists);
        c.cards.push(...conj.cards);
        return c;
      });
    }
    case "not": {
      // in this language, not wraps a single fragment; use not_exists over the fragment conjunction.
      const ds = toDNF(f.frag);
      if (ds.length !== 1) throw new Error("not(...) expects a single conjunction after normalization");
      const conj = ds[0];
      const c = emptyConj();
      c.exists.push({ kind: "not_exists", atoms: conj.atoms, cond: toAndCond(conj.conds) });
      c.exists.push(...conj.exists);
      c.cards.push(...conj.cards);
      return [c];
    }
    case "xor": {
      // xor(A,B) => (A and not_exists(B)) OR (B and not_exists(A))
      const A = toDNF(f.a);
      const B = toDNF(f.b2);

      const notExistsAll = (dnf: Conj[]): Exists[] =>
        dnf.map((c) => ({ kind: "not_exists", atoms: c.atoms, cond: toAndCond(c.conds) } as Exists));

      const notB = notExistsAll(B);
      const notA = notExistsAll(A);

      const out: Conj[] = [];
      for (const a of A) out.push(merge(a, { atoms: [], exists: [...notB], cards: [], conds: [] }));
      for (const b of B) out.push(merge(b, { atoms: [], exists: [...notA], cards: [], conds: [] }));
      return out;
    }
    case "forall": {
      // forall(v in D, P) => per Di in DNF(D): count( Di where not_exists(P) ) == 0
      const D = toDNF(f.domain);
      const P = toDNF(f.pred);

      const notP: Exists[] = P.map((p) => ({ kind: "not_exists", atoms: p.atoms, cond: toAndCond(p.conds) } as Exists));

      const out: Conj[] = [];
      for (const d of D) {
        const c = emptyConj();
        const zero: Term = { t: "lit", lit: { t: "int", v: 0n } } as any;
        c.cards.push({
          op: "==",
          n: zero,
          atoms: d.atoms,
          exists: [...(d.exists ?? []), ...notP, ...P.flatMap((x) => x.exists)],
          cond: toAndCond(d.conds),
          by: [f.v.name],
        });
        c.cards.push(...d.cards);
        out.push(c);
      }
      return out;
    }
    case "exact":
    case "at_least":
    case "at_most": {
      const ds = toDNF(f.frag);
      if (ds.length !== 1) throw new Error("cardinality constraints over disjunction not supported");
      const conj = ds[0];
      const op = f.b === "exact" ? "==" : f.b === "at_least" ? ">=" : "<=";
      const c = emptyConj();
      c.cards.push({
        op,
        n: f.n,
        atoms: conj.atoms,
        exists: conj.exists.length ? conj.exists : undefined,
        cond: toAndCond(conj.conds),
        by: f.by,
      });
      c.cards.push(...conj.cards);
      return [c];
    }
  }
}

export function rewriteRule(rule: SurfaceRule): Rule[] {
  const dnfs = toDNF(rule.body);
  return dnfs.map((c, i) => ({
    id: dnfs.length === 1 ? rule.id : `${rule.id}#${i+1}`,
    head: rule.head as any,
    body: conjToBody(c),
  }));
}

export function rewriteProgram(rules: SurfaceRule[]): Rule[] {
  return rules.flatMap(rewriteRule);
}
