import { Sort } from "./sort";

export type PredRef = string; // e.g. "money/3"
export type EventRef = string; // e.g. "transfer_money/4"

export interface PredicateSchema {
  ref: PredRef;
  args: Sort[];
  name?: string;
}

export interface EventSchema {
  ref: EventRef;
  args: Sort[];
  name?: string;
}

export type BuiltinSchema =
  | { kind: "fn"; name: string; args: Sort[]; ret: Sort }
  | { kind: "poly_eq"; name: "==" | "!=" }
  | { kind: "cmp"; name: "<" | "<=" | ">" | ">="; operand: Sort }
  | { kind: "arith"; name: "+" | "-" | "*" | "/" | "mod"; operand: Sort; ret: Sort };

export interface SchemaRegistry {
  predicates: Map<PredRef, PredicateSchema>;
  events: Map<EventRef, EventSchema>;
  builtins: Map<string, BuiltinSchema>;
}

export function defaultBuiltins(): Map<string, BuiltinSchema> {
  const Int: Sort = { kind: "prim", name: "Int" };
  const Float: Sort = { kind: "prim", name: "Float" };
  const Bool: Sort = { kind: "prim", name: "Bool" };

  const m = new Map<string, BuiltinSchema>();
  // equality (polymorphic but same-sort)
  m.set("==", { kind: "poly_eq", name: "==" });
  m.set("!=", { kind: "poly_eq", name: "!=" });
  // comparisons (start with Int/Float)
  for (const op of ["<", "<=", ">", ">="] as const) {
    m.set(op, { kind: "cmp", name: op, operand: Int });
  }
  // basic math: Int
  for (const op of ["+", "-", "*", "/", "mod"] as const) {
    m.set(op, { kind: "arith", name: op, operand: Int, ret: Int });
  }
  // helpers
  m.set("is_true", { kind: "fn", name: "is_true", args: [Bool], ret: Bool });
  m.set("to_int", { kind: "fn", name: "to_int", args: [Float], ret: Int });
  return m;
}
