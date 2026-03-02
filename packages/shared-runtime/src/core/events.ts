import { Man } from "./money.js";
import { CardId, CityId, DeckId, PlayerId, TileIndex } from "./ids.js";

export type GameEvent =
  | { type: "transfer_money"; from: "market" | "government" | "relief" | PlayerId; to: "market" | "government" | "relief" | PlayerId; amount: Man; reason: string }

  | { type: "set_pos"; player: PlayerId; tile: TileIndex; mode: "walk" | "warp" }
  | { type: "add_laps"; player: PlayerId; delta: number; reason: string }

  | { type: "set_jail"; player: PlayerId; remainingTurns: number }  // 0 => leave jail
  | { type: "set_rehab"; player: PlayerId; remainingTurns: number } // 0 => leave rehab
  | { type: "exit_rehab_to_start"; player: PlayerId; startTile: TileIndex }

  | { type: "add_city_houses"; city: CityId; delta: number; reason: string }
  | { type: "set_city_owner"; city: CityId; owner: PlayerId }
  | { type: "clear_city_owner"; city: CityId }

  | { type: "add_wage_bonus"; player: PlayerId; delta: Man; reason: string }

  | { type: "set_lotto_streak"; player: PlayerId; k: number }

  | { type: "add_debt"; player: PlayerId; delta: Man; reason: string }
  | { type: "forgive_debt"; player: PlayerId; amount: Man; reason: string }

  | { type: "draw_card"; player: PlayerId; deck: DeckId; card: CardId }
  | { type: "discard_card"; deck: DeckId; card: CardId }
  | { type: "add_card_to_hand"; player: PlayerId; card: CardId }
  | { type: "remove_card_from_hand"; player: PlayerId; card: CardId }

| { type: "add_modifier"; modifier: {
    id: string;
    kind: "rentExempt" | "hospitalFree" | "feesMultiplier" | "rentMultiplier" | "cashMultiplier";
    scope: "global" | "player";
    targetPlayer?: PlayerId;
    value: number | boolean;
    ttl: { kind: "once" | "turns"; remaining: number };
    source?: string;
  } }
| { type: "consume_modifier_once"; modifierId: string }
| { type: "tick_modifiers"; reason: string }  // decrement turn-based TTL by 1
| { type: "clear_modifiers"; predicate?: { kind?: string; scope?: string; targetPlayer?: PlayerId } }
;
