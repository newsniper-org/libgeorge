# Precompiled IR

This folder is a placeholder for precompiled RuleIR JSON artifacts.

Recommended workflow:
1) Use the rulescript compiler (from your separate compiler project) to compile:
   - `ruleset/data/*.rules`
   - `ruleset/rules/*.rules`
   into `RuleIR[]` JSON.
2) Save as `shared_ruleset.ir.json` here.
3) Load via `loadIrJson()` or bundle it into your app.

The adapter expects the IR to emit event terms with types used in `ruleset/rules/00_api.rules`.
