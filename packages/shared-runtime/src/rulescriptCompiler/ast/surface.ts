import { EventRef, PredRef } from "../types/schema";
import { Sym, Term, Atom, Cond } from "./core";

// Surface AST extends core with sugar constructs.

export type QuantifiedVar = { name: Sym };

export type BodyFrag =
  | { b: "atom"; atom: Atom }
  | { b: "cond"; cond: Cond }
  | { b: "and"; items: BodyFrag[] }
  | { b: "or"; items: BodyFrag[] }
  | { b: "xor"; a: BodyFrag; b2: BodyFrag }
  | { b: "exists"; frag: BodyFrag }
  | { b: "forall"; v: QuantifiedVar; domain: BodyFrag; pred: BodyFrag }
  | { b: "exact"; n: Term; frag: BodyFrag; by?: Sym[] }
  | { b: "at_least"; n: Term; frag: BodyFrag; by?: Sym[] }
  | { b: "at_most"; n: Term; frag: BodyFrag; by?: Sym[] };

export type SurfaceHead =
  | { h: "emit"; event: EventRef; args: Term[] }
  | { h: "emit_many"; event: EventRef; args: Term[]; n: Term }
  | { h: "derive"; pred: PredRef; args: Term[] };

export interface SurfaceRule {
  id: string;
  phase?: string;
  priority?: number;
  head: SurfaceHead;
  body: BodyFrag;
}
