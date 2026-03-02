import { Body, Cond, Head, Rule, Term, Lit } from "../ast/core";
import { SchemaRegistry } from "./schema";
import { Constraint } from "./constraints";
import { TypeEnv, TypeError } from "./errors";
import { TypeExpr, TVarId } from "./type_expr";
import { Sort } from "./sort";

export interface InferContext {
  reg: SchemaRegistry;
  nextTVar: number;
  env: TypeEnv;
  cs: Constraint[];
}

function freshVar(ctx: InferContext): TypeExpr {
  const id = (ctx.nextTVar++ as any) as TVarId;
  return { k: "var", v: id };
}

function getVar(ctx: InferContext, name: string): TypeExpr {
  const existing = ctx.env.vars.get(name);
  if (existing) return existing;
  const tv = freshVar(ctx);
  ctx.env.vars.set(name, tv);
  return tv;
}

function litType(l: Lit): TypeExpr {
  switch (l.t) {
    case "int":
      return { k: "sort", s: { kind: "prim", name: "Int" } };
    case "float":
      return { k: "sort", s: { kind: "prim", name: "Float" } };
    case "bool":
      return { k: "sort", s: { kind: "prim", name: "Bool" } };
    case "str":
      return { k: "sort", s: { kind: "prim", name: "String" } };
  }
}

function termType(ctx: InferContext, t: Term): TypeExpr {
  switch (t.t) {
    case "var":
      return getVar(ctx, t.name as any);
    case "lit":
      return litType(t.lit);
    case "tuple":
      return { k: "tuple", items: t.items.map((x) => termType(ctx, x)) };
    case "call": {
      const b = ctx.reg.builtins.get(t.fn);
      if (!b) throw new TypeError("UnknownBuiltin", `Unknown builtin: ${t.fn}`, { fn: t.fn });
      const argT = t.args.map((a) => termType(ctx, a));

      if (b.kind === "fn") {
        if (b.args.length !== argT.length) {
          throw new TypeError("ArityMismatch", `Builtin arity mismatch: ${t.fn}`, { fn: t.fn });
        }
        b.args.forEach((s, i) => ctx.cs.push({ kind: "eq", a: argT[i], b: { k: "sort", s }, why: `builtin ${t.fn} arg${i}` }));
        return { k: "sort", s: b.ret };
      }

      // For operators, term-level use is discouraged; treat as unknown and rely on Cond typing.
      return freshVar(ctx);
    }
  }
}

function inferCond(ctx: InferContext, c: Cond): void {
  switch (c.c) {
    case "true":
    case "false":
      return;
    case "and":
      c.items.forEach((x) => inferCond(ctx, x));
      return;
    case "call": {
      const b = ctx.reg.builtins.get(c.fn);
      if (!b) throw new TypeError("UnknownBuiltin", `Unknown builtin: ${c.fn}`, { fn: c.fn });

      const args = c.args.map((a) => termType(ctx, a));

      if (b.kind === "poly_eq") {
        if (args.length !== 2) throw new TypeError("ArityMismatch", `Equality expects 2 args`, { fn: c.fn });
        ctx.cs.push({ kind: "eq", a: args[0], b: args[1], why: `equality ${c.fn}` });
        return;
      }

      if (b.kind === "cmp") {
        if (args.length !== 2) throw new TypeError("ArityMismatch", `Comparison expects 2 args`, { fn: c.fn });
        ctx.cs.push({ kind: "eq", a: args[0], b: { k: "sort", s: b.operand }, why: `cmp ${c.fn}` });
        ctx.cs.push({ kind: "eq", a: args[1], b: { k: "sort", s: b.operand }, why: `cmp ${c.fn}` });
        return;
      }

      if (b.kind === "fn") {
        if (b.args.length !== args.length) throw new TypeError("ArityMismatch", `Builtin arity mismatch: ${c.fn}`, { fn: c.fn });
        b.args.forEach((s, i) => ctx.cs.push({ kind: "eq", a: args[i], b: { k: "sort", s }, why: `builtin ${c.fn} arg${i}` }));
        ctx.cs.push({
          kind: "eq",
          a: { k: "sort", s: b.ret },
          b: { k: "sort", s: { kind: "prim", name: "Bool" } },
          why: `cond ${c.fn} returns Bool`,
        });
        return;
      }

      // arith in conditions not supported at this layer
      return;
    }
  }
}

function inferBody(ctx: InferContext, b: Body): void {
  for (const at of b.atoms) {
    const ps = ctx.reg.predicates.get(at.pred);
    if (!ps) throw new TypeError("UnknownPredicate", `Unknown predicate: ${at.pred}`, { pred: at.pred });
    if (ps.args.length !== at.args.length) throw new TypeError("ArityMismatch", `Predicate arity mismatch: ${at.pred}`, { pred: at.pred });

    at.args.forEach((arg, i) => {
      const te = termType(ctx, arg);
      ctx.cs.push({ kind: "eq", a: te, b: { k: "sort", s: ps.args[i] }, why: `${at.pred} arg${i}` });
    });
  }

  if (b.exists) {
    for (const ex of b.exists) {
      for (const at of ex.atoms) {
        const ps = ctx.reg.predicates.get(at.pred);
        if (!ps) throw new TypeError("UnknownPredicate", `Unknown predicate: ${at.pred}`, { pred: at.pred });
        if (ps.args.length !== at.args.length) throw new TypeError("ArityMismatch", `Predicate arity mismatch: ${at.pred}`, { pred: at.pred });

        at.args.forEach((arg, i) => {
          const te = termType(ctx, arg);
          ctx.cs.push({ kind: "eq", a: te, b: { k: "sort", s: ps.args[i] }, why: `${at.pred} arg${i} in ${ex.kind}` });
        });
      }
      if (ex.cond) inferCond(ctx, ex.cond);
    }
  }


  if (b.cards) {
    for (const card of b.cards) {
      // type the subquery atoms/exists/cond
      card.atoms.forEach((at: any) => {
        const ps = ctx.reg.predicates.get(at.pred);
        if (!ps) throw new TypeError("UnknownPredicate", `Unknown predicate: ${at.pred}`, { pred: at.pred });
        if (ps.args.length !== at.args.length) throw new TypeError("ArityMismatch", `Predicate arity mismatch: ${at.pred}`, { pred: at.pred });
        at.args.forEach((arg: any, i: number) => {
          const te = termType(ctx, arg);
          ctx.cs.push({ kind: "eq", a: te, b: { k: "sort", s: ps.args[i] }, why: `${at.pred} arg${i} in card` });
        });
      });

      // nested exists inside cardinality fragment
      (card.exists ?? []).forEach((ex: any) => {
        ex.atoms.forEach((at: any) => {
          const ps = ctx.reg.predicates.get(at.pred);
          if (!ps) throw new TypeError("UnknownPredicate", `Unknown predicate: ${at.pred}`, { pred: at.pred });
          if (ps.args.length !== at.args.length) throw new TypeError("ArityMismatch", `Predicate arity mismatch: ${at.pred}`, { pred: at.pred });
          at.args.forEach((arg: any, i: number) => {
            const te = termType(ctx, arg);
            ctx.cs.push({ kind: "eq", a: te, b: { k: "sort", s: ps.args[i] }, why: `${at.pred} arg${i} in card.${ex.kind}` });
          });
        });
        if (ex.cond) inferCond(ctx, ex.cond);
      });

      if (card.cond) inferCond(ctx, card.cond);

      // n must be Int
      const nT = termType(ctx, card.n);
      ctx.cs.push({ kind: "eq", a: nT, b: { k: "sort", s: { kind: "prim", name: "Int" } }, why: `cardinality n must be Int` });
      ctx.cs.push({ kind: "isNonNegInt", a: nT, why: `cardinality n must be >=0` });

      // by vars must exist; type inferred by usage in subquery, so just ensure they are vars known in env
      (card.by ?? []).forEach((v: any) => {
        // Touch the var to ensure it has a type var in env
        getVar(ctx, v);
      });
    }
  }

  if (b.cond) inferCond(ctx, b.cond);
}

function inferHead(ctx: InferContext, h: Head): void {
  if (h.h === "derive") {
    const ps = ctx.reg.predicates.get(h.pred);
    if (!ps) throw new TypeError("UnknownPredicate", `Unknown predicate: ${h.pred}`, { pred: h.pred });
    if (ps.args.length !== h.args.length) throw new TypeError("ArityMismatch", `Predicate arity mismatch: ${h.pred}`, { pred: h.pred });
    h.args.forEach((a, i) => {
      const te = termType(ctx, a);
      ctx.cs.push({ kind: "eq", a: te, b: { k: "sort", s: ps.args[i] }, why: `${h.pred} derive arg${i}` });
    });
    return;
  }

  const es = ctx.reg.events.get(h.event);
  if (!es) throw new TypeError("UnknownEvent", `Unknown event: ${h.event}`, { event: h.event });
  if (es.args.length !== h.args.length) throw new TypeError("ArityMismatch", `Event arity mismatch: ${h.event}`, { event: h.event });

  h.args.forEach((a, i) => {
    const te = termType(ctx, a);
    ctx.cs.push({ kind: "eq", a: te, b: { k: "sort", s: es.args[i] }, why: `${h.event} arg${i}` });
  });

  if (h.h === "emit_many") {
    const nT = termType(ctx, h.n);
    ctx.cs.push({ kind: "eq", a: nT, b: { k: "sort", s: { kind: "prim", name: "Int" } }, why: `emit_many multiplicity must be Int` });
    ctx.cs.push({ kind: "isNonNegInt", a: nT, why: `emit_many multiplicity must be >= 0 (runtime checked)` });
  }
}

export function buildConstraints(reg: SchemaRegistry, rule: Rule): { env: TypeEnv; cs: Constraint[] } {
  const ctx: InferContext = { reg, nextTVar: 0, env: { vars: new Map() }, cs: [] };
  inferBody(ctx, rule.body);
  inferHead(ctx, rule.head);
  return { env: ctx.env, cs: ctx.cs };
}
