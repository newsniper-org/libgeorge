import { Rule } from "../ast/core";
import { PredRef } from "../types/schema";

export interface StratificationResult {
  ok: boolean;
  // map predicate -> stratum number (0..)
  strata?: Map<PredRef, number>;
  // if not ok
  error?: {
    message: string;
    cycle?: PredRef[];
  };
}

type Edge = { from: PredRef; to: PredRef; neg: boolean };

function headPred(r: Rule): PredRef | null {
  return r.head.h === "derive" ? r.head.pred : null;
}

function collectBodyPreds(r: Rule): { pos: PredRef[]; neg: PredRef[] } {
  const pos: PredRef[] = [];
  const neg: PredRef[] = [];

  for (const at of r.body.atoms) pos.push(at.pred);

  for (const ex of r.body.exists ?? []) {
    const preds = ex.atoms.map((a) => a.pred);
    if (ex.kind === "exists") pos.push(...preds);
    else neg.push(...preds);
  }


for (const card of r.body.cards ?? []) {
  for (const at of card.atoms) pos.push(at.pred);
  for (const ex of card.exists ?? []) {
    const preds = ex.atoms.map((a) => a.pred);
    if (ex.kind === "exists") pos.push(...preds);
    else neg.push(...preds);
  }
}

  // NOTE: cond can call builtins; no predicate refs there in this core.
  return { pos, neg };
}

export function stratify(rules: Rule[]): StratificationResult {
  const edges: Edge[] = [];
  const nodes = new Set<PredRef>();

  for (const r of rules) {
    const hp = headPred(r);
    if (!hp) continue;
    nodes.add(hp);

    const { pos, neg } = collectBodyPreds(r);
    for (const p of pos) {
      nodes.add(p);
      edges.push({ from: hp, to: p, neg: false });
    }
    for (const p of neg) {
      nodes.add(p);
      edges.push({ from: hp, to: p, neg: true });
    }
  }

  // If no derived predicates, trivially stratified.
  if (nodes.size === 0) return { ok: true, strata: new Map() };

  // Build adjacency for SCC.
  const adj = new Map<PredRef, PredRef[]>();
  const radj = new Map<PredRef, PredRef[]>();
  for (const n of nodes) {
    adj.set(n, []);
    radj.set(n, []);
  }
  for (const e of edges) {
    adj.get(e.from)?.push(e.to);
    radj.get(e.to)?.push(e.from);
  }

  // Kosaraju SCC.
  const visited = new Set<PredRef>();
  const order: PredRef[] = [];
  function dfs1(u: PredRef) {
    visited.add(u);
    for (const v of adj.get(u) ?? []) if (!visited.has(v)) dfs1(v);
    order.push(u);
  }
  for (const n of nodes) if (!visited.has(n)) dfs1(n);

  const comp = new Map<PredRef, number>();
  const comps: PredRef[][] = [];
  function dfs2(u: PredRef, cid: number, bucket: PredRef[]) {
    comp.set(u, cid);
    bucket.push(u);
    for (const v of radj.get(u) ?? []) if (!comp.has(v)) dfs2(v, cid, bucket);
  }
  for (let i = order.length - 1; i >= 0; i--) {
    const n = order[i];
    if (comp.has(n)) continue;
    const bucket: PredRef[] = [];
    const cid = comps.length;
    dfs2(n, cid, bucket);
    comps.push(bucket);
  }

  // Check for any negative edge inside an SCC.
  for (const e of edges) {
    const c1 = comp.get(e.from);
    const c2 = comp.get(e.to);
    if (c1 !== undefined && c2 !== undefined && c1 === c2 && e.neg) {
      const cycle = comps[c1];
      return {
        ok: false,
        error: {
          message: `Not stratifiable: negative dependency cycle in SCC containing ${cycle.join(", ")}`,
          cycle,
        },
      };
    }
  }

  // Assign strata via longest-path on SCC DAG with neg edges adding +1.
  const dagAdj = new Map<number, { to: number; neg: boolean }[]>();
  for (let i = 0; i < comps.length; i++) dagAdj.set(i, []);
  for (const e of edges) {
    const a = comp.get(e.from)!;
    const b = comp.get(e.to)!;
    if (a === b) continue;
    dagAdj.get(a)!.push({ to: b, neg: e.neg });
  }

  // Topological order of SCC DAG using DFS.
  const visC = new Set<number>();
  const topo: number[] = [];
  function dfsC(u: number) {
    visC.add(u);
    for (const ed of dagAdj.get(u) ?? []) if (!visC.has(ed.to)) dfsC(ed.to);
    topo.push(u);
  }
  for (let i = 0; i < comps.length; i++) if (!visC.has(i)) dfsC(i);

  const stratumC = new Map<number, number>();
  for (const u of topo) {
    // u is in postorder; process in that order is fine if we relax until fixed point
    // We'll instead compute in reverse topo for longest path.
    stratumC.set(u, 0);
  }
  topo.reverse();
  for (const u of topo) {
    const su = stratumC.get(u) ?? 0;
    for (const ed of dagAdj.get(u) ?? []) {
      const inc = ed.neg ? 1 : 0;
      const sv = stratumC.get(ed.to) ?? 0;
      if (sv < su + inc) stratumC.set(ed.to, su + inc);
    }
  }

  const strata = new Map<PredRef, number>();
  for (let cid = 0; cid < comps.length; cid++) {
    const s = stratumC.get(cid) ?? 0;
    for (const n of comps[cid]) strata.set(n, s);
  }

  return { ok: true, strata };
}
