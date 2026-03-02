export type Sym = string & { readonly __brand: "Sym" };

export type Value =
  | { k: "int"; v: bigint }
  | { k: "float"; v: number }
  | { k: "str"; v: string }
  | { k: "bool"; v: boolean }
  | { k: "entity"; v: string }
  | { k: "tuple"; v: Value[] };

export type Binding = Map<Sym, Value>;

export type PredicateRef = string;

export type Expr =
  | { t: "var"; name: Sym }
  | { t: "lit"; value: Value }
  | { t: "bin"; op: "+" | "-" | "*" | "/" | "mod" | "==" | "!=" | "<" | "<=" | ">" | ">="; a: Expr; b: Expr }
  | { t: "call"; fn: string; args: Expr[] };

export type Atom = {
  pred: PredicateRef;
  args: Expr[];
};

export type RelPlan =
  | { op: "scan"; atom: Atom }
  | { op: "join"; lhs: RelPlan; rhs: RelPlan }
  | { op: "filter"; src: RelPlan; cond: Expr }
  | { op: "project"; src: RelPlan; vars: Sym[] }
  | { op: "distinct"; src: RelPlan }
  | {
      op: "group_by";
      src: RelPlan;
      keys: Sym[];
      aggs: { out: Sym; kind: "sum" | "count" | "min" | "max"; expr?: Expr }[];
    }
  | { op: "exists"; src: RelPlan; sub: RelPlan }
  | { op: "not_exists"; src: RelPlan; sub: RelPlan }
  | { op: "card"; src: RelPlan; sub: RelPlan; cmp: "==" | ">=" | "<="; n: Expr; by?: Sym[] }
