import { GlobalState } from "../core/state.js";
import { GameEvent } from "../core/events.js";
import { man } from "../core/money.js";
import { Fact } from "./factsBridge.js";

export const mockEngine = {
  tickFacts(state: GlobalState, _facts: Fact[]): GameEvent[] {
    // Example: always give active player wage 200 (만)
    return [
      { type: "transfer_money", from: "market", to: state.activePlayer, amount: man(200), reason: "mock_wage" }
    ];
  }
};
