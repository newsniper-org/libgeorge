import { GameEvent } from "../core/events.js";
import { man } from "../core/money.js";
import { tile } from "../core/ids.js";

/**
 * Card effect interpreter skeleton.
 *
 * The DSL ruleset provides:
 * - data/cards_shared_slugs.rules: card_slug(CardId,"camelCaseSlug")
 * - data/cards_shared_effects.rules: card_effect(CardId, Kind, ParamsJson)
 *
 * This interpreter assumes the RulesEngine materializes `card_effect/3` into runtime structures
 * (e.g., by exporting them as JSON or returning them via a query).
 *
 * Determinism note:
 * - If an effect requires a player choice (e.g., move_warp to any tile),
 *   the choice must come from an explicit command input, never from randomness.
 */

export type CardEffect =
  | { kind: "grant_cash"; amount: number }
  | { kind: "pay_cash"; to: "market" | "government" | "relief"; amount: number }
  | { kind: "move_warp"; tile: number | null; target?: string }
  | { kind: "exempt"; scope: "rent" | "fees" | "hospital"; ttl: { kind: "once" | "turns"; n: number } }
  | { kind: "multiplier"; scope: "rent" | "fees"; value: number; ttl: { kind: "once" | "turns"; n: number } }
  | { kind: "jail_release" }
  | { kind: "wage_bonus"; delta: number }
  | { kind: "cash_multiplier"; value: number }
  | { kind: "remove_building"; count: number; policy: "choice" }
  | { kind: "destroy_building_each"; cities: string[]; count_each: number }
  | { kind: "remove_building_group_choice"; count_each: number }
  | { kind: "swap_city" }
  | { kind: "swap_with_offset" }
  ;

export interface CardChoiceInput {
  // for move_warp tile==null
  chosenTile?: number;
  // for remove_building policy=choice
  chosenCity?: string;
  // for group choice removals
  chosenGroupId?: number;
  // for swap effects
  chosenTargetPlayer?: string;
}

export function compileCardEffectsToEvents(
  playerId: string,
  effects: CardEffect[],
  choice: CardChoiceInput = {}
): GameEvent[] {
  const evs: GameEvent[] = [];
  for (const e of effects) {
    switch (e.kind) {
      case "grant_cash":
        evs.push({ type: "transfer_money", from: "market", to: playerId as any, amount: man(e.amount), reason: "card_grant_cash" });
        break;
      case "pay_cash":
        evs.push({ type: "transfer_money", from: playerId as any, to: e.to as any, amount: man(e.amount), reason: "card_pay_cash" });
        break;
      case "move_warp": {
        const t = (e.tile ?? choice.chosenTile);
        if (t == null) throw new Error("move_warp requires chosenTile when tile is null");
        evs.push({ type: "set_pos", player: playerId as any, tile: tile(t), mode: "warp" });
        break;
      }
      case "jail_release":
        evs.push({ type: "set_jail", player: playerId as any, remainingTurns: 0 });
        break;
      case "wage_bonus":
        evs.push({ type: "add_wage_bonus", player: playerId as any, delta: man(e.delta), reason: "card_wage_bonus" });
        break;
      // TODO: multiplier/exempt/modifiers require a status/modifier subsystem; keep as integration TODO.
      default:
        // For now, leave unhandled effects for the higher-level integration.
        break;
    }
  }
  return evs;
}
