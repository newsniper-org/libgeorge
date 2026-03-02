import path from "path";
import fs from "fs";
import { AsyncEventQueue } from "../queue/AsyncEventQueue.js";
import { compilePipeline } from "../pipeline/compilePipeline.js";
import { makeRulescriptHooks } from "../pipeline/RulescriptCompilerHooks.js";
import { parseRulesDirToQueue, parseRulesDirToQueueNoEnd } from "../parser/AntlrWiring.js";
import type { ParseEvent } from "../pipeline/types.js";

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

const rulesetDir = arg("--ruleset") ?? path.resolve(process.cwd(), "../../ruleset");
const outDir = arg("--out") ?? path.resolve(process.cwd(), "../../ruleset_precompiled");
const dataDir = path.join(rulesetDir, "data");
const rulesDir = path.join(rulesetDir, "rules");

if (!fs.existsSync(rulesDir)) {
  console.error(`Rules dir not found: ${rulesDir}`);
  process.exit(1);
}

async function main() {
  const q = new AsyncEventQueue<ParseEvent>(50_000);
  const consumer = compilePipeline(q, makeRulescriptHooks(outDir));
  if (fs.existsSync(dataDir)) parseRulesDirToQueueNoEnd(dataDir, q);
  parseRulesDirToQueue(rulesDir, q);
  await consumer;
  console.log(`Wrote ${path.join(outDir, "shared_ruleset.ir.json")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
