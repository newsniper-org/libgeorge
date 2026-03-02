export type Man = number & { readonly __brand: "Man" }; // 1 == 1만

export function man(n: number): Man {
  if (!Number.isFinite(n)) throw new Error(`invalid man: ${n}`);
  if (!Number.isInteger(n)) throw new Error(`man must be integer: ${n}`);
  return n as Man;
}

export function addMan(a: Man, b: Man): Man { return man((a as number) + (b as number)); }
export function subMan(a: Man, b: Man): Man { return man((a as number) - (b as number)); }
export function mulMan(a: Man, k: number): Man { return man((a as number) * k); }

export function clampMinZero(a: Man): Man { return man(Math.max(0, a as number)); }
