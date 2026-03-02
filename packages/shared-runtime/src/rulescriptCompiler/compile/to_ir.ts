import { Atom as CAtom, Cond as CCond, Exists as CExists, Rule } from "../ast/core";
import { Expr, RelPlan, Atom as RAtom, Value } from "../ir/rel";
import { EffProg, EventTerm, RuleIR } from "../ir/eff";

function litToValue(l: any): Value {
  switch (l.t) {
    case "int":
      return { k: "int", v: l.v };
    case "float":
      return { k: "float", v: l.v };
    case "bool":
      return { k: "bool", v: l.v };
    case "str":
      return { k: "str", v: l.v };
    default:
      throw new Error(`Unknown lit: ${JSON.stringify(l)}`);
  }
}

function termToExpr(t: any): Expr {
  switch (t.t) {
    case "var":
      return { t: "var", name: t.name };
    case "lit":
      return { t: "lit", value: litToValue(t.lit) };
    case "tuple":
      return { t: "lit", value: { k: "tuple", v: t.items.map((x: any) => {
        const ex = termToExpr(x);
        if (ex.t !== "lit") throw new Error(`Tuple items must be literals after lowering (got expr)`);
        return ex.value;
      }) } };
    case "call":
      return { t: "call", fn: t.fn, args: t.args.map(termToExpr) };
    default:
      throw new Error(`Unknown term: ${JSON.stringify(t)}`);
  }
}

function atomToR(a: CAtom): RAtom {
  return { pred: a.pred, args: a.args.map(termToExpr) };
}

function condToExpr(c: CCond): Expr {
  switch (c.c) {
    case "true":
      return { t: "lit", value: { k: "bool", v: true } };
    case "false":
      return { t: "lit", value: { k: "bool", v: false } };
    case "call": {
      // encode builtins as call or bin when recognized
      const op = c.fn;
      if (["==", "!=", "<", "<=", ">", ">="].includes(op)) {
        return { t: "bin", op: op as any, a: termToExpr(c.args[0]), b: termToExpr(c.args[1]) };
      }
      return { t: "call", fn: c.fn, args: c.args.map(termToExpr) };
    }
    case "and": {
      // fold into a chain of guards later; here just return call("and",..)
      return { t: "call", fn: "and", args: c.items.map(condToExpr) };
    }
  }
}

function joinAll(plans: RelPlan[]): RelPlan {
  if (plans.length === 0) {
    // A dummy scan is not representable; callers should handle empty body.
    // For now, create a scan of a special predicate __unit/0.
    return { op: "scan", atom: { pred: "__unit/0", args: [] } };
  }
  return plans.reduce((a, b) => ({ op: "join", lhs: a, rhs: b } as RelPlan));
}

function applyExists(base: RelPlan, ex: CExists): RelPlan {
  const sub = joinAll(ex.atoms.map((a) => ({ op: "scan", atom: atomToR(a) } as RelPlan)));
  const sub2 = ex.cond ? { op: "filter", src: sub, cond: condToExpr(ex.cond) } : sub;
  return { op: ex.kind, src: base, sub: sub2 } as RelPlan;
}

function mkPer(rule: Rule): EffProg {
  // Optionally emit provenance logs.
  const log: EffProg = { e: "tell", item: { k: "rule_fired", ruleId: rule.id, binding: [] } };

  if (rule.head.h === "emit" || rule.head.h === "emit_many") {
    const eventType = rule.head.event.split("/")[0];
    // NOTE: args may reference vars; evaluator will need to evaluate Expr under binding.
    const argsExpr = rule.head.args.map(termToExpr);
    const event: EventTerm = {
      type: eventType,
      // Here we store args as Value literals only when they are literals.
      // Real implementation: keep Expr[] and evaluate later.
      args: argsExpr,
      meta: undefined,
    };

    const emitNode: EffProg =
      rule.head.h === "emit"
        ? { e: "emit", event }
        : { e: "emit_many", event, n: termToExpr(rule.head.n) };

    return { e: "seq", a: log, b: emitNode };
  }

  // derive fact => encode as special emit (runtime interprets)
  if (rule.head.h === "derive") {
    const predName = rule.head.pred;
    const argsExpr = rule.head.args.map(termToExpr);
    const event: EventTerm = {
      type: "__derive",
      args: [{ t: "lit", value: { k: "str", v: predName } } as any, ...argsExpr],
    };
    return { e: "seq", a: log, b: { e: "emit", event } };
  }

  return log;
}

export function compileRuleToIR(rule: Rule): RuleIR {
  const scans = rule.body.atoms.map((a) => ({ op: "scan", atom: atomToR(a) } as RelPlan));
  let plan = joinAll(scans);

  if (rule.body.cond) {
    const e = condToExpr(rule.body.cond);
    // If cond was an AND tree encoded as call("and"), evaluator can interpret it. For now just filter.
    plan = { op: "filter", src: plan, cond: e };
  }

  for (const ex of rule.body.exists ?? []) {
    plan = applyExists(plan, ex);
  }
  for (const card of rule.body.cards ?? []) {
    const scans2 = card.atoms.map((a: any) => ({ op: "scan", atom: atomToR(a) } as RelPlan));
    let sub = joinAll(scans2);
    if (card.cond) sub = { op: "filter", src: sub, cond: condToExpr(card.cond) };
    for (const ex of card.exists ?? []) {
      sub = applyExists(sub, ex);
    }
    plan = { op: "card", src: plan, sub, cmp: card.op, n: termToExpr(card.n), by: card.by } as RelPlan;
  }


  return {
    ruleId: rule.id,
    phase: rule.phase,
    priority: rule.priority,
    body: plan,
    per: mkPer(rule),
  };
}

export function compileProgramToIR(rules: Rule[]): RuleIR[] {
  return rules.map(compileRuleToIR);
}
