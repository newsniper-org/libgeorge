
import fs from "fs";
import path from "path";
import { parseRulesetDir } from "../rulescriptCompiler/parse/rulesParser.js";
import { rewriteProgram } from "../rulescriptCompiler/compile/rewrite.js";
import { stratify } from "../rulescriptCompiler/compile/stratify.js";
import { compileProgramToIR } from "../rulescriptCompiler/compile/to_ir.js";

/**
 * Compile the shared ruleset (.rules) into RuleIR JSON for runtime use.
 *
 * Usage:
 *   node dist/tools/compileRuleset.js --ruleset ./ruleset --out ./ruleset_precompiled/shared_ruleset.ir.json
 *
 * Notes:
 * - This compiler is a pragmatic subset parser sufficient for this repository's ruleset.
 * - For full language support, replace the parser with a proper grammar-based one.
 */

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

const rulesetDir = arg("--ruleset") ?? "./ruleset";
const outPath = arg("--out") ?? "./ruleset_precompiled/shared_ruleset.ir.json";

const dataDir = path.join(rulesetDir, "data");
const rulesDir = path.join(rulesetDir, "rules");

const surface = [
  ...parseRulesetDir(dataDir),
  ...parseRulesetDir(rulesDir),
];

// Lower surface sugar -> core rules
const core = rewriteProgram(surface);

// Stratification check (only meaningful for derived predicates)
const st = stratify(core as any);
if (!st.ok) {
  console.error("Stratification failed:", st.error);
  process.exit(1);
}

// Compile to IR
const ir = compileProgramToIR(core as any);

// Ensure output dir exists
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(ir, null, 2), "utf-8");

console.log(`Compiled ${core.length} rules -> ${ir.length} IR rules`);
console.log(`Wrote: ${outPath}`);
