# Build instructions (Unified Monorepo)

## Install
```bash
npm install
```

## Typecheck / Build all
```bash
npm run check
npm run build
```

## Generate ANTLR parser and compile shared ruleset (IR + facts)
```bash
npm -w @libgeorge/rules-antlr-pipeline run build
npm -w @libgeorge/rules-antlr-pipeline run compile:ruleset -- --ruleset ./packages/shared-ruleset/ruleset --out ./packages/shared-ruleset/ruleset_precompiled
```

Outputs:
- `packages/shared-ruleset/ruleset_precompiled/shared_ruleset.ir.json`
- `packages/shared-ruleset/ruleset_precompiled/shared_facts.json`

## Run runtime demo (requires IR + facts)
In `packages/shared-runtime`, add a demo that loads the above artifacts and executes tickCycle.
(This monorepo includes runtime sources; you can wire a script next.)
