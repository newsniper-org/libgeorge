import { RuleIR, RulescriptRuntime } from "../integration/rulesEngineAdapter.js";
import { Fact } from "../integration/factsBridge.js";
import { evalTick } from "./runtime.js";

export const rulescriptRuntime: RulescriptRuntime = {
  evalTick(ir: RuleIR[], facts: Fact[]) {
    return evalTick(ir, facts);
  }
};
