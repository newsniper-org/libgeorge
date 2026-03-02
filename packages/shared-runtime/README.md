# Two Worlds (Shared) Runtime Skeleton v1

This repo provides a **deterministic reducer** (state machine) skeleton for applying the events emitted by the DSL ruleset.

Scope:
- Event type definitions
- Core game state representation (money, debt, positions, laps, jail/rehab, city ownership/houses, deck/hand)
- `applyEvent(...)` reducer with invariants and guardrails
- Minimal "command input" / "environment input" typing
- Smoke demo that applies a few events

Not included:
- DSL parser / evaluator (rulescript engine)
- Networking/UI


## Documentation
- See `docs/ko/` and `docs/en/`.

## Simulation
- `src/sim/` provides simulation + metrics skeleton.
- Plug your DSL RulesEngine into `RulesEngine.tick(...)`.


## RulesEngine Adapter
This repo expects a fact-based RulesEngine (`tickFacts`).
See `src/integration/rulesEngineAdapter.ts` for a precompiled-IR adapter skeleton (`PrecompiledRulesEngine`).


## Built-in minimal RulescriptRuntime
A minimal in-process runtime is provided at `src/rulescriptRuntime/`.
It can evaluate precompiled RuleIR against facts.

Usage:
- Compile ruleset to RuleIR[] offline (precompile step).
- Create `new PrecompiledRulesEngine({ irJson, runtime: rulescriptRuntime })`.


## Compile ruleset to precompiled IR

Run:

- `npm run build`
- `npm run compile:ruleset`

This produces `ruleset_precompiled/shared_ruleset.ir.json`.

Then you can load it and run with:

```ts
import { PrecompiledRulesEngine } from "./integration/rulesEngineAdapter.js";
import { rulescriptRuntime } from "./rulescriptRuntime/index.js";

const ir = /* load JSON */;
const engine = new PrecompiledRulesEngine({ irJson: ir, runtime: rulescriptRuntime });
```
