import { RuleIR } from "./rulesEngineAdapter.js";

/**
 * Load precompiled IR JSON via fetch.
 *
 * - In browsers/Workers: pass a URL (or `new URL(..., import.meta.url)`).
 * - In Node: use Node 18+ where `fetch` is available, or provide your own loader.
 */
export async function loadIrJson(url: string): Promise<RuleIR[]> {
  if (typeof fetch !== "function") {
    throw new Error("fetch is not available; provide a custom IR loader for this environment");
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Failed to fetch IR JSON: ${r.status}`);
  return (await r.json()) as RuleIR[];
}
