import { GlobalState, InvariantViolation, PlayerState } from "../core/state.js";
import { GameEvent } from "../core/events.js";
import { addMan, clampMinZero, man, subMan } from "../core/money.js";
import { CityId, PlayerId } from "../core/ids.js";

export interface ApplyOptions { strict?: boolean; }

export interface ApplyResult {
  state: GlobalState;
  violations: InvariantViolation[];
}

function getPlayer(s: GlobalState, p: PlayerId): PlayerState {
  const ps = s.players[p as unknown as string];
  if (!ps) throw new Error(`unknown player: ${p}`);
  return { ...ps, hand: [...ps.hand] };
}

function setPlayer(s: GlobalState, p: PlayerId, ps: PlayerState): void {
  s.players[p as unknown as string] = ps;
}

function getCity(s: GlobalState, c: CityId) {
  const cs = s.cities[c as unknown as string];
  if (!cs) throw new Error(`unknown city: ${c}`);
  return { ...cs };
}

function pushViolation(vs: InvariantViolation[], code: string, message: string, detail?: Record<string, unknown>): void {
  vs.push({ code, message, detail });
}

type MoneyParty = "market" | "government" | "relief" | PlayerId;

function transfer(state: GlobalState, from: MoneyParty, to: MoneyParty, amount: number, reason: string, vs: InvariantViolation[]): void {
  if (amount < 0) {
    pushViolation(vs, "NEG_AMOUNT", "transfer_money amount must be >=0", { amount, reason });
    return;
  }
  const a = man(amount);

  const debit = (who: typeof from) => {
    if (who === "market") state.marketMoney = subMan(state.marketMoney, a);
    else if (who === "government") state.governmentFund = subMan(state.governmentFund, a);
    else if (who === "relief") state.reliefFund = subMan(state.reliefFund, a);
    else {
      const p = getPlayer(state, who);
      p.money = subMan(p.money, a);
      setPlayer(state, who, p);
    }
  };
  const credit = (who: typeof to) => {
    if (who === "market") state.marketMoney = addMan(state.marketMoney, a);
    else if (who === "government") state.governmentFund = addMan(state.governmentFund, a);
    else if (who === "relief") state.reliefFund = addMan(state.reliefFund, a);
    else {
      const p = getPlayer(state, who);
      p.money = addMan(p.money, a);
      setPlayer(state, who, p);
    }
  };

  debit(from);
  credit(to);
}

function cloneModifiers(ms: any[]): any[] { return ms.map((m) => ({ ...m, ttl: { ...m.ttl } })); }

function addModifier(state: GlobalState, mod: any, violations: InvariantViolation[]): void {
  // minimal validation
  if (!mod.id || typeof mod.id !== "string") {
    pushViolation(violations, "BAD_MOD_ID", "modifier id required", { mod });
    return;
  }
  state.modifiers = cloneModifiers(state.modifiers);
  // prevent duplicate ids
  if (state.modifiers.find((m) => m.id === mod.id)) {
    pushViolation(violations, "DUP_MOD_ID", "duplicate modifier id", { id: mod.id });
    return;
  }
  state.modifiers.push({ ...mod, ttl: { ...mod.ttl } });
}

function consumeOnce(state: GlobalState, id: string): void {
  state.modifiers = cloneModifiers(state.modifiers);
  const m = state.modifiers.find((x) => x.id === id);
  if (!m) return;
  if (m.ttl.kind !== "once") return;
  m.ttl.remaining -= 1;
  if (m.ttl.remaining <= 0) {
    state.modifiers = state.modifiers.filter((x) => x.id !== id);
  }
}

function tickTurnModifiers(state: GlobalState): void {
  state.modifiers = cloneModifiers(state.modifiers);
  for (const m of state.modifiers) {
    if (m.ttl.kind === "turns") m.ttl.remaining -= 1;
  }
  state.modifiers = state.modifiers.filter((m) => !(m.ttl.kind === "turns" && m.ttl.remaining <= 0));
}

function clearModifiers(state: GlobalState, pred?: any): void {
  if (!pred) { state.modifiers = []; return; }
  state.modifiers = state.modifiers.filter((m) => {
    if (pred.kind && m.kind !== pred.kind) return true;
    if (pred.scope && m.scope !== pred.scope) return true;
    if (pred.targetPlayer && m.targetPlayer !== pred.targetPlayer) return true;
    return false; // match => remove
  });
}

export function applyEvent(prev: GlobalState, ev: GameEvent, opts: ApplyOptions = {}): ApplyResult {
  const state: GlobalState = {
    ...prev,
    players: { ...prev.players },
    cities: { ...prev.cities },
    decks: { ...prev.decks },
    modifiers: [...prev.modifiers],
  };

  const violations: InvariantViolation[] = [];
  const strict = !!opts.strict;
  const fail = (code: string, message: string, detail?: Record<string, unknown>) => {
    pushViolation(violations, code, message, detail);
    if (strict) throw new Error(`${code}: ${message}`);
  };

  switch (ev.type) {
    case "transfer_money": {
      transfer(state, ev.from, ev.to, ev.amount as unknown as number, ev.reason, violations);
      break;
    }

    case "set_pos": {
      const p = getPlayer(state, ev.player);
      p.pos = ev.tile;
      setPlayer(state, ev.player, p);
      break;
    }

    case "add_laps": {
      const p = getPlayer(state, ev.player);
      p.laps += ev.delta;
      if (p.laps < 0) fail("NEG_LAPS", "laps cannot be negative", { player: ev.player, laps: p.laps });
      setPlayer(state, ev.player, p);
      break;
    }

    case "set_jail": {
      const p = getPlayer(state, ev.player);
      const k = ev.remainingTurns | 0;
      if (k < 0 || k > 3) fail("BAD_JAIL_K", "jail remainingTurns must be 0..3", { k });
      p.status = k === 0 ? { kind: "normal" } : { kind: "jail", remainingTurns: k };
      setPlayer(state, ev.player, p);
      break;
    }

    case "set_rehab": {
      const p = getPlayer(state, ev.player);
      const k = ev.remainingTurns | 0;
      if (k < 0 || k > 3) fail("BAD_REHAB_K", "rehab remainingTurns must be 0..3", { k });
      p.status = k === 0 ? { kind: "normal" } : { kind: "rehab", remainingTurns: k };
      setPlayer(state, ev.player, p);
      break;
    }

    case "exit_rehab_to_start": {
      const p = getPlayer(state, ev.player);
      p.status = { kind: "normal" };
      p.pos = ev.startTile;
      setPlayer(state, ev.player, p);
      break;
    }

    case "add_city_houses": {
      const c = getCity(state, ev.city);
      c.houses += ev.delta;
      if (c.houses < 0) fail("NEG_HOUSES", "city houses cannot be negative", { city: ev.city, houses: c.houses });
      if (c.houses > 3) fail("TOO_MANY_HOUSES", "city houses cannot exceed 3", { city: ev.city, houses: c.houses });

      // warn if owner set but houses became 0
      if (c.houses === 0 && c.owner) {
        pushViolation(violations, "OWNER_WITH_ZERO_HOUSES", "city has owner but 0 houses; consider clear_city_owner", { city: ev.city, owner: c.owner });
      }
      state.cities[ev.city as unknown as string] = c;
      break;
    }

    case "set_city_owner": {
      const c = getCity(state, ev.city);
      c.owner = ev.owner;
      state.cities[ev.city as unknown as string] = c;
      break;
    }

    case "clear_city_owner": {
      const c = getCity(state, ev.city);
      delete c.owner;
      state.cities[ev.city as unknown as string] = c;
      break;
    }

    case "add_wage_bonus": {
      const p = getPlayer(state, ev.player);
      p.wageBonus = addMan(p.wageBonus, ev.delta);
      setPlayer(state, ev.player, p);
      break;
    }

    case "set_lotto_streak": {
      const p = getPlayer(state, ev.player);
      const k = ev.k | 0;
      if (k < 0 || k > 3) fail("BAD_LOTTO_K", "lotto streak must be 0..3", { k });
      p.lottoStreak = k;
      setPlayer(state, ev.player, p);
      break;
    }

    case "add_debt": {
      const p = getPlayer(state, ev.player);
      p.debt = addMan(p.debt, ev.delta);
      if ((p.debt as unknown as number) < 0) p.debt = clampMinZero(p.debt);
      setPlayer(state, ev.player, p);
      break;
    }

    case "forgive_debt": {
      const p = getPlayer(state, ev.player);
      p.debt = subMan(p.debt, ev.amount);
      if ((p.debt as unknown as number) < 0) p.debt = man(0);
      setPlayer(state, ev.player, p);
      break;
    }

    case "draw_card": {
      const d = state.decks[ev.deck as unknown as string];
      if (!d) fail("UNKNOWN_DECK", "unknown deck", { deck: ev.deck });
      else {
        const dd = { ...d, drawPile: [...d.drawPile], discardPile: [...d.discardPile] };
        const idx = dd.drawPile.indexOf(ev.card);
        if (idx === -1) pushViolation(violations, "CARD_NOT_IN_DRAW", "draw_card: card not in draw pile", { deck: ev.deck, card: ev.card });
        else dd.drawPile.splice(idx, 1);
        state.decks[ev.deck as unknown as string] = dd;
      }
      break;
    }

    case "discard_card": {
      const d = state.decks[ev.deck as unknown as string];
      if (!d) fail("UNKNOWN_DECK", "unknown deck", { deck: ev.deck });
      else {
        const dd = { ...d, drawPile: [...d.drawPile], discardPile: [...d.discardPile, ev.card] };
        state.decks[ev.deck as unknown as string] = dd;
      }
      break;
    }

    case "add_card_to_hand": {
      const p = getPlayer(state, ev.player);
      p.hand.push(ev.card);
      setPlayer(state, ev.player, p);
      break;
    }

    case "remove_card_from_hand": {
      const p = getPlayer(state, ev.player);
      const idx = p.hand.indexOf(ev.card);
      if (idx === -1) pushViolation(violations, "CARD_NOT_IN_HAND", "remove_card_from_hand: card not in hand", { player: ev.player, card: ev.card });
      else p.hand.splice(idx, 1);
      setPlayer(state, ev.player, p);
      break;
    }

case "add_modifier": {
  addModifier(state, ev.modifier, violations);
  break;
}
case "consume_modifier_once": {
  consumeOnce(state, ev.modifierId);
  break;
}
case "tick_modifiers": {
  tickTurnModifiers(state);
  break;
}
case "clear_modifiers": {
  clearModifiers(state, (ev as any).predicate);
  break;
}

    default: {
      const _exhaustive: never = ev;
      return { state, violations };
    }
  }

  return { state, violations };
}
