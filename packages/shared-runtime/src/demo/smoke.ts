import { man } from "../core/money.js";
import { tile } from "../core/ids.js";
import { GlobalState } from "../core/state.js";
import { applyMany } from "../runtime/apply.js";
import { GameEvent } from "../core/events.js";

const s0: GlobalState = {
  tick: 0 as any,
  activePlayer: "P1" as any,
  players: {
    P1: { id: "P1" as any, pos: tile(0), laps: 0, money: man(400), debt: man(0), wageBonus: man(0), status: { kind: "normal" }, lottoStreak: 0, hand: [] },
    P2: { id: "P2" as any, pos: tile(0), laps: 0, money: man(400), debt: man(0), wageBonus: man(0), status: { kind: "normal" }, lottoStreak: 0, hand: [] },
  },
  cities: {
    mokpo: { id: "mokpo" as any, houses: 0, groupId: 1 },
  },
  marketMoney: man(0),
  governmentFund: man(0),
  reliefFund: man(0),
  decks: {
    change_cards_shared: { id: "change_cards_shared" as any, drawPile: [], discardPile: [] },
  },
  modifiers: [],
  initialPlayerCount: 2,
};

const events: GameEvent[] = [
  { type: "transfer_money", from: "market", to: "P1" as any, amount: man(200), reason: "wage" },
  { type: "transfer_money", from: "P1" as any, to: "government", amount: man(70), reason: "utilities" },
  { type: "set_pos", player: "P1" as any, tile: tile(1), mode: "walk" },
  { type: "add_city_houses", city: "mokpo" as any, delta: 1, reason: "build" },
  { type: "set_city_owner", city: "mokpo" as any, owner: "P1" as any },
];

const r = applyMany(s0, events, { strict: false });
console.log("violations:", r.violations);
console.log("P1 money:", r.state.players["P1"].money);
console.log("gov fund:", r.state.governmentFund);
console.log("mokpo houses:", r.state.cities["mokpo"].houses, "owner:", r.state.cities["mokpo"].owner);
