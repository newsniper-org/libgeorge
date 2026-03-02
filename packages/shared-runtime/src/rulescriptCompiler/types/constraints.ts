import { TypeExpr } from "./type_expr";

export type Constraint =
  | { kind: "eq"; a: TypeExpr; b: TypeExpr; why: string }
  | { kind: "isInt"; a: TypeExpr; why: string }
  | { kind: "isNonNegInt"; a: TypeExpr; why: string };
