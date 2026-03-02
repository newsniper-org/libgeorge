import { GlobalState } from "../core/state.js";
import { GameEvent } from "../core/events.js";
import { Fact } from "./factsBridge.js";

/**
 * RulesEngineAdapter (skeleton)
 * ----------------------------
 * This adapter connects:
 *  - fact tuples produced by factsBridge.ts
 *  - the Datalog-like DSL ruleset in `ruleset/`
 *  - to a runnable `tickFacts(...) -> GameEvent[]`
 *
 * Integration modes:
 * (A) Precompile mode (recommended):
 *   - Compile `.rules` into `RuleIR[]` offline
 *   - Serialize IR to JSON
 *   - Load IR JSON at runtime and evaluate against facts each tick
 *
 * (B) On-the-fly compile mode:
 *   - Parse/rewrite/stratify/typecheck/compile at runtime (heavier)
 *
 * This file implements mode (A) cleanly and leaves mode (B) as an extension.
 */

// ---- Minimal IR types (mirrors the rulescript IR) ----
export type Sym = string;

export type Value =
  | { k: "int"; v: bigint }
  | { k: "float"; v: number }
  | { k: "str"; v: string }
  | { k: "bool"; v: boolean }
  | { k: "entity"; v: string }
  | { k: "tuple"; v: Value[] };

export type Expr =
  | { t: "var"; name: Sym }
  | { t: "lit"; value: Value }
  | { t: "bin"; op: "+" | "-" | "*" | "/" | "mod" | "==" | "!=" | "<" | "<=" | ">" | ">="; a: Expr; b: Expr }
  | { t: "call"; fn: string; args: Expr[] };

export type Atom = { pred: string; args: Expr[] };

export type RelPlan =
  | { op: "scan"; atom: Atom }
  | { op: "join"; lhs: RelPlan; rhs: RelPlan }
  | { op: "filter"; src: RelPlan; cond: Expr }
  | { op: "project"; src: RelPlan; vars: Sym[] }
  | { op: "distinct"; src: RelPlan }
  | { op: "group_by"; src: RelPlan; keys: Sym[]; aggs: { out: Sym; kind: "sum" | "count" | "min" | "max"; expr?: Expr }[] }
  | { op: "exists"; src: RelPlan; sub: RelPlan }
  | { op: "not_exists"; src: RelPlan; sub: RelPlan }
  | { op: "card"; src: RelPlan; sub: RelPlan; cmp: "==" | ">=" | "<="; n: Expr; by?: Sym[] };

export type EventTerm = { type: string; args: Expr[]; meta?: Record<string, Expr> };

export type EffProg =
  | { e: "pure" }
  | { e: "seq"; a: EffProg; b: EffProg }
  | { e: "guard"; cond: Expr }
  | { e: "tell"; item: any }
  | { e: "emit"; event: EventTerm }
  | { e: "emit_many"; event: EventTerm; n: Expr }
  | { e: "choose_det"; candidates: RelPlan; orderBy: Expr[]; take: number; then: EffProg };

export interface RuleIR {
  ruleId: string;
  phase?: string;
  priority?: number;
  body: RelPlan;
  per: EffProg;
}

// ---- Runtime evaluation hooks ----
export interface RulescriptRuntime {
  /**
   * Evaluate precompiled IR against facts, producing events as terms.
   *
   * This corresponds to the rulescript runtime (FactStore + evalRel + runEff).
   */
  evalTick(ir: RuleIR[], facts: Fact[]): { events: { type: string; args: unknown[]; n?: bigint }[] };
}

export interface AdapterOptions {
  irJson: RuleIR[];
  runtime: RulescriptRuntime;
}

/**
 * A minimal adapter that runs **precompiled IR**.
 */
export class PrecompiledRulesEngine {
  private ir: RuleIR[];
  private rt: RulescriptRuntime;

  constructor(opts: AdapterOptions) {
    this.ir = opts.irJson;
    this.rt = opts.runtime;
  }

  tickFacts(_state: GlobalState, facts: Fact[]): GameEvent[] {
    const out = this.rt.evalTick(this.ir, facts);
    return out.events.map(eventTermToGameEvent);
  }
}

// ---- Event mapping ----
export function eventTermToGameEvent(e: { type: string; args: unknown[]; n?: bigint }): GameEvent {
  switch (e.type) {
    case "transfer_money": {
      const [from, to, amount, reason] = e.args as any[];
      return { type: "transfer_money", from, to, amount, reason };
    }
    case "set_pos": {
      const [player, tile, mode] = e.args as any[];
      return { type: "set_pos", player, tile, mode };
    }
    case "add_laps": {
      const [player, delta, reason] = e.args as any[];
      return { type: "add_laps", player, delta, reason };
    }
    case "set_in_jail": {
      const [player, turns] = e.args as any[];
      return { type: "set_jail", player, remainingTurns: turns };
    }
    case "clear_jail": {
      const [player] = e.args as any[];
      return { type: "set_jail", player, remainingTurns: 0 };
    }
    case "set_in_rehab": {
      const [player, used] = e.args as any[];
      return { type: "set_rehab", player, remainingTurns: Math.max(0, 3 - (used ?? 0)) };
    }
    case "clear_rehab": {
      const [player] = e.args as any[];
      return { type: "set_rehab", player, remainingTurns: 0 };
    }
    case "add_city_houses": {
      const [city, delta] = e.args as any[];
      return { type: "add_city_houses", city, delta, reason: "dsl" };
    }
    case "set_city_owner": {
      const [city, owner] = e.args as any[];
      return { type: "set_city_owner", city, owner };
    }
    case "clear_city_owner": {
      const [city] = e.args as any[];
      return { type: "clear_city_owner", city };
    }
    case "set_lotto_streak": {
      const [player, k] = e.args as any[];
      return { type: "set_lotto_streak", player, k };
    }
    case "add_wage_bonus": {
      const [player, delta, reason] = e.args as any[];
      return { type: "add_wage_bonus", player, delta, reason: reason ?? "dsl" };
    }
    case "add_debt": {
      const [player, delta, reason] = e.args as any[];
      return { type: "add_debt", player, delta, reason: reason ?? "dsl" };
    }
    case "pay_debt": {
      const [player, amount, reason] = e.args as any[];
      return { type: "add_debt", player, delta: (-(amount as any)) as any, reason: reason ?? "pay_debt" };
    }
    case "forgive_debt": {
      const [player, amount, reason] = e.args as any[];
      return { type: "forgive_debt", player, amount, reason: reason ?? "dsl" };
    }
    case "add_card_to_hand": {
      const [player, card] = e.args as any[];
      return { type: "add_card_to_hand", player, card };
    }
    case "remove_card_from_hand": {
      const [player, card] = e.args as any[];
      return { type: "remove_card_from_hand", player, card };
    }
    case "add_modifier": {
      const [modifier] = e.args as any[];
      return { type: "add_modifier", modifier } as any;
    }
    case "consume_modifier_once": {
      const [id] = e.args as any[];
      return { type: "consume_modifier_once", modifierId: id } as any;
    }
    case "tick_modifiers": {
      const [reason] = e.args as any[];
      return { type: "tick_modifiers", reason: reason ?? "tick" } as any;
    }
    case "clear_modifiers": {
      const [predicate] = e.args as any[];
      return { type: "clear_modifiers", predicate } as any;
    }
    default:
      throw new Error(`Unmapped DSL event type: ${e.type}`);
  }
}
