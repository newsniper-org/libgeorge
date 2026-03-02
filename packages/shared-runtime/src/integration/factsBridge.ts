import { GlobalState } from "../core/state.js";
import { PlayerCommand, EnvInput } from "../core/inputs.js";
import { computeMultiplierProducts } from "./modifierBridge.js";

/**
 * A lightweight "facts bridge" skeleton.
 *
 * The ruleset is Datalog-like. It expects facts described in `ruleset/rules/00_api.rules`.
 * This bridge converts runtime objects into fact tuples for the RulesEngine.
 *
 * Fact representation:
 * - We use a simple JSON-friendly format: [pred, ...args]
 * - The RulesEngine adapter should turn these into its internal fact store.
 *
 * IMPORTANT:
 * - Keep this deterministic. Never rely on JS object iteration order unless you sort keys.
 */

export type Fact = [string, ...unknown[]];

export interface BridgeOptions {
  tick: number;
}

// ----------- State -> Facts -----------

export function stateToFacts(state: GlobalState, opts: BridgeOptions): Fact[] {
  const T = opts.tick;
  const facts: Fact[] = [];

  // players
  const pids = Object.keys(state.players).sort();
  for (const pid of pids) facts.push(["player", pid]);

  facts.push(["initial_player_count", state.initialPlayerCount]);

  // market/government/relief entities are constants in DSL; still ok to provide
  facts.push(["market", "market"]);
  facts.push(["government", "government"]);
  facts.push(["relief_pool", "relief_pool"]);

  // funds
  facts.push(["gov_fund", T, state.governmentFund]);
  facts.push(["relief_fund", T, state.reliefFund]);
  facts.push(["market_fund", T, state.marketMoney]);

  // player state
  for (const pid of pids) {
    const p = state.players[pid];
    facts.push(["pos", pid, T, p.pos]);
    facts.push(["laps", pid, T, p.laps]);
    facts.push(["cash", pid, T, p.money]);
    facts.push(["debt", pid, T, p.debt]);
    if (p.status.kind === "jail") facts.push(["in_jail", pid, T, p.status.remainingTurns]);
    if (p.status.kind === "rehab") {
      facts.push(["offboard", pid, T]);
      facts.push(["in_rehab", pid, T, 3 - p.status.remainingTurns]); // convention: turnsUsed
    }
    if (p.wageBonus > 0) facts.push(["graduated", pid, T]); // simplified: wageBonus implies graduated
    facts.push(["lotto_streak", pid, T, p.lottoStreak]);
    // held cards
    for (const card of p.hand) facts.push(["hand_card", pid, T, card]);
  }

  // cities
  const cids = Object.keys(state.cities).sort();
  for (const cid of cids) {
    const c = state.cities[cid];
    if (c.owner) facts.push(["city_owner", cid, T, c.owner]);
    facts.push(["city_houses", cid, T, c.houses]);
  }

  // decks (optional)
  const dids = Object.keys(state.decks).sort();
  for (const did of dids) {
    const d = state.decks[did];
    // expose draw/discard ordering deterministically
    for (let i = 0; i < d.drawPile.length; i++) facts.push(["deck_draw_at", did, i, d.drawPile[i]]);
    for (let i = 0; i < d.discardPile.length; i++) facts.push(["deck_discard_at", did, i, d.discardPile[i]]);
  }

  // modifiers -> facts
  facts.push(...modifiersToFacts(state, opts));

  // multiplier products -> facts (for ruleset helpers)
  facts.push(...multiplierProductsToFacts(state, opts));

  return facts;
}

export function modifiersToFacts(state: GlobalState, opts: BridgeOptions): Fact[] {
  const T = opts.tick;
  const facts: Fact[] = [];
  // deterministic order
  const mods = [...state.modifiers].sort((a, b) => a.id.localeCompare(b.id));
  for (const m of mods) {
    facts.push([
      "modifier",
      m.id,
      m.kind,
      m.scope,
      m.targetPlayer ?? "_",
      m.value,
      m.ttl.kind,
      m.ttl.remaining,
      m.source ?? "_",
    ]);
  }
  return facts;
}

export function multiplierProductsToFacts(state: GlobalState, opts: BridgeOptions): Fact[] {
  const facts: Fact[] = [];
  const prods = computeMultiplierProducts(state);
  const pids = Object.keys(state.players).sort();
  for (const pid of pids) {
    facts.push(["rent_multiplier", pid, prods.rent[pid] ?? 1.0]);
    facts.push(["fees_multiplier", pid, prods.fees[pid] ?? 1.0]);
    facts.push(["cash_multiplier", pid, prods.cash[pid] ?? 1.0]);
  }
  return facts;
}

// ----------- Inputs -> Facts -----------

/**
 * Convert typed commands/env inputs into DSL facts expected by 00_api.rules.
 *
 * We encode all inputs at the current tick T.
 */
export function inputsToFacts(cmds: PlayerCommand[], env: EnvInput[], opts: BridgeOptions): Fact[] {
  const T = opts.tick;
  const out: Fact[] = [];

  for (const c of cmds) {
    switch (c.kind) {
      case "request_basic_income":
        out.push(["cmd_request_basic_income", c.by, T]);
        break;
      case "build_house":
        out.push(["cmd_build", c.by, T, c.city, c.count]);
        break;
      case "sell_house":
        out.push(["cmd_sell_house", c.by, T, c.city, c.count]);
        break;
      case "play_lotto":
        out.push(["cmd_play_lotto", c.by, T, c.guess]);
        break;
      case "lotto_continue":
        out.push(["cmd_lotto_continue", c.by, T, c.choice]);
        break;
      case "use_card":
        out.push(["cmd_use_card", c.by, T, c.card]);
        break;
    }
  }

  for (const e of env) {
    switch (e.kind) {
      case "dice":
        // DSL expects roll(P,T,D1,D2) and turn(P,T); the adapter should add turn(...) elsewhere.
        out.push(["roll", "_active", T, e.d1, e.d2]);
        break;
      case "lotto_result":
        out.push(["lotto_result", "_active", T, e.outcome]);
        break;
    }
  }

  return out;
}
