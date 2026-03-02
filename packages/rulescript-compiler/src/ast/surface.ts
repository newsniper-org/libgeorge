import { Atom, Cond, Sym, Term } from "./core.js";

export type QuantifiedVar = { name: Sym };

export type BodyFrag =
  | { b: "atom"; atom: Atom }
  | { b: "cond"; cond: Cond }
  | { b: "and"; items: BodyFrag[] }
  | { b: "or"; items: BodyFrag[] }
  | { b: "xor"; a: BodyFrag; b2: BodyFrag }
  | { b: "exists"; frag: BodyFrag }
  | { b: "not"; frag: BodyFrag }                    // NEW: explicit negation wrapper
  | { b: "forall"; v: QuantifiedVar; domain: BodyFrag; pred: BodyFrag }
  | { b: "exact"; n: Term; frag: BodyFrag; by?: Sym[] }
  | { b: "at_least"; n: Term; frag: BodyFrag; by?: Sym[] }
  | { b: "at_most"; n: Term; frag: BodyFrag; by?: Sym[] };

export type SurfaceHead =
  | { h: "emit"; event: string; args: Term[]; tick: Term }
  | { h: "derive"; pred: string; args: Term[] };

export interface SurfaceRule {
  id: string;
  head: SurfaceHead;
  body: BodyFrag;
  span?: { file: string; line: number; col: number };
}
