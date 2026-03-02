import { AsyncEventQueue } from "../queue/AsyncEventQueue.js";
import { ListenerSink } from "../parser/ListenerSink.js";
import { compilePipeline } from "../pipeline/compilePipeline.js";
import { makeRulescriptHooks } from "../pipeline/RulescriptCompilerHooks.js";

async function main() {
  const q = new AsyncEventQueue<any>(1000);
  const sink = new ListenerSink(q, "example.rules");

  // Simulated callbacks (replace with ANTLR walker + ListenerSinkAntlr)
  sink.onRuleStart(1, 0);
  sink.onHead({ emit: "transfer_money", args: ["P", "government", 30, "utility_fee"] }, 1, 0);
  sink.onBody({ atoms: ["arrive(P,T,4)", "tile_special(4,waterworks)"] }, 1, 20);
  sink.onRuleEnd(1, 80);
  sink.end();

  await compilePipeline(q, makeRulescriptHooks("./out"));
  console.log("done: wrote out/shared_ruleset.ir.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
