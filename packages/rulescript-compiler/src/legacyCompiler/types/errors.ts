import { TypeExpr } from "./type_expr";

export class TypeError extends Error {
  constructor(
    public code:
      | "UnknownPredicate"
      | "UnknownEvent"
      | "ArityMismatch"
      | "TypeMismatch"
      | "OccursCheck"
      | "UnknownBuiltin"
      | "AmbiguousType",
    message: string,
    public detail?: Record<string, unknown>
  ) {
    super(message);
  }
}

export interface TypeEnv {
  vars: Map<string, TypeExpr>;
}
