import { Sort } from "./sort";

export type TVarId = number & { readonly __brand: "TVarId" };

export type TypeExpr =
  | { k: "sort"; s: Sort }
  | { k: "var"; v: TVarId }
  | { k: "tuple"; items: TypeExpr[] };
