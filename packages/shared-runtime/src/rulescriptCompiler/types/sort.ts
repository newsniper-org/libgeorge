export type SortId = string & { readonly __brand: "SortId" };

export type Sort =
  | { kind: "prim"; name: "Int" | "Float" | "Bool" | "String" }
  | { kind: "time"; name: "Time" | "Turn" | "Step" }
  | { kind: "entity"; name: string } // e.g. "PlayerId", "TileId", "Money"
  | { kind: "tuple"; items: Sort[] };

export function sortEq(a: Sort, b: Sort): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "prim":
    case "time":
    case "entity":
      return (a as any).name === (b as any).name;
    case "tuple": {
      const aa = a.items;
      const bb = (b as any).items as Sort[];
      return aa.length === bb.length && aa.every((s, i) => sortEq(s, bb[i]));
    }
  }
}
