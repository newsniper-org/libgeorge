export type Sym = string;

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
  pred: string;       // we will normalize to name/arity like "foo/3" in lowering
  args: Term[];
}

export type Cond =
  | { c: "true" }
  | { c: "false" }
  | { c: "call"; fn: string; args: Term[] }
  | { c: "and"; items: Cond[] };
