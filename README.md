# Two Worlds — Unified Monorepo

Packages:

- `@libgeorge/rulescript-compiler` — compiler library (rewrite/stratify/compileProgramToIR)
- `@libgeorge/rules-antlr-pipeline` — ANTLR parser + async pipeline; emits IR and facts JSON
- `@libgeorge/shared-runtime` — deterministic runtime (facts bridge + rulescriptRuntime + reducer + simulation scaffolding)
- `shared-ruleset` — shared ruleset sources and compiled artifacts

Workflow:
1. Build/generate parser and compile ruleset
2. Load IR+facts in runtime and run simulations
