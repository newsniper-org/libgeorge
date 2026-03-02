import { Man } from "./money.js";
import { CardId, CityId, DeckId, PlayerId, TileIndex } from "./ids.js";

export type TurnIndex = number & { readonly __brand: "TurnIndex" };
export type Tick = number & { readonly __brand: "Tick" };

export type PlayerStatus =
  | { kind: "normal" }
  | { kind: "jail"; remainingTurns: number } // 1..3
  | { kind: "rehab"; remainingTurns: number }; // 1..3

export type ModifierScope = "global" | "player";

export type ModifierKind =
  | "rentExempt"          // Boolean
  | "hospitalFree"        // Boolean (1-use)
  | "feesMultiplier"      // Number multiplier for fees
  | "rentMultiplier"      // Number multiplier for rent
  | "cashMultiplier";     // Number multiplier for cash (e.g., lose half)

export type ModifierTtl =
  | { kind: "once"; remaining: number }
  | { kind: "turns"; remaining: number };

export interface Modifier {
  id: string;                 // stable unique id for debugging
  kind: ModifierKind;
  scope: ModifierScope;
  // If scope=player, targetPlayer is required
  targetPlayer?: PlayerId;
  // simple scalar/boolean value
  value: number | boolean;
  ttl: ModifierTtl;
  source?: string;            // e.g., card slug
}

export interface PlayerState {
  id: PlayerId;
  pos: TileIndex;
  laps: number;              // accumulated laps
  money: Man;
  debt: Man;
  wageBonus: Man;            // +100만 => man(100)
  status: PlayerStatus;
  lottoStreak: number;       // 0..3
  hand: CardId[];            // hold-type cards
}

export interface CityState {
  id: CityId;
  owner?: PlayerId;          // owner if houses>0
  houses: number;            // 0..3
  groupId: number;           // u32-like in TS
}

export interface DeckState {
  id: DeckId;
  drawPile: CardId[];
  discardPile: CardId[];
}

export interface GlobalState {
  tick: Tick;
  activePlayer: PlayerId;
  players: Record<string, PlayerState>;
  cities: Record<string, CityState>;

  marketMoney: Man;
  governmentFund: Man;       // 토지기금
  reliefFund: Man;           // 구제기금
  decks: Record<string, DeckState>;

  // active modifiers (global + per-player)
  modifiers: Modifier[];

  initialPlayerCount: number;
}

export interface InvariantViolation {
  code: string;
  message: string;
  detail?: Record<string, unknown>;
}
