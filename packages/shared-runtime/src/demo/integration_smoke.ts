import { GlobalState } from "../core/state.js";
import { man } from "../core/money.js";
import { tile } from "../core/ids.js";
import { tickCycle } from "../integration/tick.js";
import { mockEngine } from "../integration/mockEngine.js";

const state: GlobalState = {
  tick: 0 as any,
  activePlayer: "P1" as any,
  players: {
    P1: { id: "P1" as any, pos: tile(0), laps: 0, money: man(400), debt: man(0), wageBonus: man(0), status: { kind: "normal" }, lottoStreak: 0, hand: [] },
  },
  cities: {},
  marketMoney: man(0),
  governmentFund: man(0),
  reliefFund: man(0),
  decks: {},
  modifiers: [],
  initialPlayerCount: 1,
};

const { state: next } = tickCycle(state, mockEngine as any, [], []);
console.log("After tick money:", next.players["P1"].money);
