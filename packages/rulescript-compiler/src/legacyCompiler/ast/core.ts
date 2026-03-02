import { EventRef, PredRef } from "../types/schema";

export type Sym = string & { readonly __brand: "Sym" };

export type Lit =
  | { t: "int"; v: bigint }
  | { t: "float"; v: number }
  | { t: "bool"; v: boolean }
  | { t: "str"; v: string };

export type Term =
  | { t: "var"; name: Sym }
  | { t: "lit"; lit: Lit }
  | { t: "call"; fn: string; args: Term[] }
  | { t: "tuple"; items: Term[] };

export interface Atom {
  pred: PredRef;
  args: Term[];
}

export type Cond =
  | { c: "true" }
  | { c: "false" }
  | { c: "call"; fn: string; args: Term[] }
  | { c: "and"; items: Cond[] };

export interface Exists {
  kind: "exists" | "not_exists";
  atoms: Atom[];
  cond?: Cond;
}

export interface CardConstraint {
  op: "==" | ">=" | "<=";
  n: Term;
  atoms: Atom[];
  exists?: Exists[];
  cond?: Cond;
  by?: Sym[];
}

export interface Body {
  atoms: Atom[];
  exists?: Exists[]; // optional list
  cards?: CardConstraint[]; // optional cardinality constraints
  cond?: Cond;
}

export type Head =
  | { h: "emit"; event: EventRef; args: Term[] }
  | { h: "emit_many"; event: EventRef; args: Term[]; n: Term }
  | { h: "derive"; pred: PredRef; args: Term[] }; // optional derived facts

export interface Rule {
  id: string;
  phase?: string;
  priority?: number;
  head: Head;
  body: Body;
  meta?: Record<string, string>;
}
