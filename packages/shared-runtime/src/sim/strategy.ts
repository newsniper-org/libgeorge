import { GlobalState } from "../core/state.js";
import { PlayerCommand, EnvInput } from "../core/inputs.js";

export interface Strategy {
  decide(state: GlobalState): PlayerCommand[];
}

export interface EnvModel {
  sample(state: GlobalState): EnvInput[];
}
