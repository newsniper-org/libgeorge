import fs from "fs/promises";
import path from "path";
import type { CompilerHooks, RuleUnit } from "./types.js";

import type { SurfaceRule } from "@libgeorge/rulescript-compiler";
import { rewriteProgram, stratify as stratifyCore, compileProgramToIR } from "@libgeorge/rulescript-compiler";

export function makeRulescriptHooks(outDir: string): CompilerHooks {
  const surface: SurfaceRule[] = [];

  return {
    async lowerRule(rule: RuleUnit) {
      surface.push(rule as any);
      return rule;
    },

    async stratify(_program: unknown[]) {
      const core = rewriteProgram(surface as any);
      const st = stratifyCore(core as any);
      if (!st.ok) throw new Error(st.error?.message ?? "stratify failed");
    },

    async typecheck(_program: unknown[]) {
      // optional
    },

    async compileToIR(_program: unknown[]) {
      const core = rewriteProgram(surface as any);
      return compileProgramToIR(core as any);
    },

    async emitArtifacts(artifact: { ir: unknown; facts: any[] }) {
      await fs.mkdir(outDir, { recursive: true });
      await fs.writeFile(path.join(outDir, "shared_ruleset.ir.json"), JSON.stringify(artifact.ir, null, 2), "utf-8");
      await fs.writeFile(path.join(outDir, "shared_facts.json"), JSON.stringify(artifact.facts, null, 2), "utf-8");
    },
  };
}
