import { Rule } from "../ast/core";
import { SchemaRegistry } from "./schema";
import { buildConstraints } from "./infer_constraints";
import { apply, solveConstraints } from "./unify";
import { TypeExpr } from "./type_expr";
import { TypeError } from "./errors";

export interface TypedRule {
  rule: Rule;
  varTypes: Map<string, TypeExpr>;
}

export function typecheckRule(reg: SchemaRegistry, rule: Rule, opts?: { rejectUnresolved?: boolean }): TypedRule {
  const { env, cs } = buildConstraints(reg, rule);
  const sub = solveConstraints(cs);

  const varTypes = new Map<string, TypeExpr>();
  for (const [name, te] of env.vars.entries()) {
    const resolved = apply(sub, te);
    if (opts?.rejectUnresolved && resolved.k === "var") {
      throw new TypeError("AmbiguousType", `Unresolved type for variable ${name}`, { var: name });
    }
    varTypes.set(name, resolved);
  }

  return { rule, varTypes };
}
