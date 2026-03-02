import { Rule } from "../ast/coreRule.js";

export interface StratificationResult {
  ok: boolean;
  strata?: Map<string, number>;
  error?: { message: string; cycle?: string[] };
}

type Edge = { from: string; to: string; neg: boolean };

function headPred(r: Rule): string | null {
  return r.head.h === "derive" ? r.head.pred : null;
}

function collectBodyPreds(r: Rule): { pos: string[]; neg: string[] } {
  const pos: string[] = [];
  const neg: string[] = [];
  for (const at of r.body.atoms) pos.push(at.pred);
  for (const ex of r.body.exists ?? []) {
    const preds = ex.atoms.map((a) => a.pred);
    if (ex.kind === "exists") pos.push(...preds); else neg.push(...preds);
  }
  for (const card of r.body.cards ?? []) {
    for (const at of card.atoms) pos.push(at.pred);
    for (const ex of card.exists ?? []) {
      const preds = ex.atoms.map((a) => a.pred);
      if (ex.kind === "exists") pos.push(...preds); else neg.push(...preds);
    }
  }
  return { pos, neg };
}

export function stratify(rules: Rule[]): StratificationResult {
  const edges: Edge[] = [];
  const nodes = new Set<string>();

  for (const r of rules) {
    const hp = headPred(r);
    if (!hp) continue;
    nodes.add(hp);
    const { pos, neg } = collectBodyPreds(r);
    for (const p of pos) { nodes.add(p); edges.push({ from: hp, to: p, neg: false }); }
    for (const p of neg) { nodes.add(p); edges.push({ from: hp, to: p, neg: true }); }
  }

  if (nodes.size === 0) return { ok: true, strata: new Map() };

  const adj = new Map<string, string[]>();
  const radj = new Map<string, string[]>();
  for (const n of nodes) { adj.set(n, []); radj.set(n, []); }
  for (const e of edges) { adj.get(e.from)!.push(e.to); radj.get(e.to)!.push(e.from); }

  const visited = new Set<string>();
  const order: string[] = [];
  function dfs1(u: string) { visited.add(u); for (const v of adj.get(u)!) if (!visited.has(v)) dfs1(v); order.push(u); }
  for (const n of nodes) if (!visited.has(n)) dfs1(n);

  const comp = new Map<string, number>();
  const comps: string[][] = [];
  function dfs2(u: string, cid: number, bucket: string[]) {
    comp.set(u, cid); bucket.push(u);
    for (const v of radj.get(u)!) if (!comp.has(v)) dfs2(v, cid, bucket);
  }
  for (let i = order.length - 1; i >= 0; i--) {
    const n = order[i];
    if (comp.has(n)) continue;
    const bucket: string[] = [];
    dfs2(n, comps.length, bucket);
    comps.push(bucket);
  }

  for (const e of edges) {
    const c1 = comp.get(e.from)!;
    const c2 = comp.get(e.to)!;
    if (c1 === c2 && e.neg) {
      const cycle = comps[c1];
      return { ok: false, error: { message: `Not stratifiable: negative dependency cycle in SCC containing ${cycle.join(", ")}`, cycle } };
    }
  }

  const dagAdj = new Map<number, { to: number; neg: boolean }[]>();
  for (let i = 0; i < comps.length; i++) dagAdj.set(i, []);
  for (const e of edges) {
    const a = comp.get(e.from)!;
    const b = comp.get(e.to)!;
    if (a === b) continue;
    dagAdj.get(a)!.push({ to: b, neg: e.neg });
  }

  const visC = new Set<number>();
  const topo: number[] = [];
  function dfsC(u: number) { visC.add(u); for (const ed of dagAdj.get(u)!) if (!visC.has(ed.to)) dfsC(ed.to); topo.push(u); }
  for (let i = 0; i < comps.length; i++) if (!visC.has(i)) dfsC(i);
  topo.reverse();

  const stratumC = new Map<number, number>();
  for (let i = 0; i < comps.length; i++) stratumC.set(i, 0);
  for (const u of topo) {
    const su = stratumC.get(u)!;
    for (const ed of dagAdj.get(u)!) {
      const inc = ed.neg ? 1 : 0;
      const sv = stratumC.get(ed.to)!;
      if (sv < su + inc) stratumC.set(ed.to, su + inc);
    }
  }

  const strata = new Map<string, number>();
  for (let cid = 0; cid < comps.length; cid++) {
    const s = stratumC.get(cid)!;
    for (const n of comps[cid]) strata.set(n, s);
  }
  return { ok: true, strata };
}
