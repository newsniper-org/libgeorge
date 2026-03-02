import { CompilerHooks, RuleUnit } from "./types.js";
import fs from "fs/promises";
import path from "path";

export function makeExampleHooks(outDir: string): CompilerHooks {
  return {
    async lowerRule(rule: RuleUnit) { return rule; },
    async stratify(_program: unknown[]) {},
    async typecheck(_program: unknown[]) {},
    async compileToIR(program: unknown[]) {
      return { rules: program, compiledAt: new Date().toISOString() };
    },
    async emitArtifacts(artifact: { ir: unknown; facts: any[] }) {
      await fs.mkdir(outDir, { recursive: true });
      await fs.writeFile(path.join(outDir, "rules.ir.json"), JSON.stringify(artifact.ir, null, 2), "utf-8");
      await fs.writeFile(path.join(outDir, "facts.json"), JSON.stringify(artifact.facts, null, 2), "utf-8");
    },
  };
}
