import { GlobalState } from "../core/state.js";
import { EnvInput, PlayerCommand } from "../core/inputs.js";
import { EnvModel, Strategy } from "./strategy.js";

export class NoopStrategy implements Strategy {
  decide(_state: GlobalState): PlayerCommand[] { return []; }
}

export class NoopEnv implements EnvModel {
  sample(_state: GlobalState): EnvInput[] { return []; }
}
