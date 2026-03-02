import { Atom, Cond, Sym, Term } from "./core.js";

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
  exists?: Exists[];
  cards?: CardConstraint[];
  cond?: Cond;
}

export type Head =
  | { h: "emit"; event: string; args: Term[]; tick: Term }
  | { h: "derive"; pred: string; args: Term[] };

export interface Rule {
  id: string;
  head: Head;
  body: Body;
}
