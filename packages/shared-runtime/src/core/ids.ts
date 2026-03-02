export type PlayerId = string & { readonly __brand: "PlayerId" };
export type CityId = string & { readonly __brand: "CityId" };
export type CardId = string & { readonly __brand: "CardId" };
export type DeckId = string & { readonly __brand: "DeckId" };

export type TileIndex = number & { readonly __brand: "TileIndex" };
export function tile(n: number): TileIndex {
  if (!Number.isInteger(n) || n < 0) throw new Error(`invalid tile: ${n}`);
  return n as TileIndex;
}
