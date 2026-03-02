# ANTLR + Async Sink Pipeline Skeleton

This skeleton demonstrates the recommended architecture:

- **ANTLR4 listener/visitor remains synchronous**
- Listener emits **events** into an **AsyncEventQueue**
- An async consumer (`for await`) performs:
  - rule assembly
  - lowering
  - rewrite / stratify / typecheck
  - IR emission
  - I/O (writing JSON artifacts)

This pattern gives you:
- deterministic parsing order
- async-friendly compilation steps
- queue-based buffering (you control max size)

## Files
- `grammar/TwoWorldsRules.g4`: starter grammar (subset)
- `src/queue/AsyncEventQueue.ts`: async iterator queue
- `src/parser/ListenerSink.ts`: listener → queue sink
- `src/pipeline/compilePipeline.ts`: async consumer skeleton
- `src/pipeline/types.ts`: event & rule builder types
- `src/pipeline/exampleHooks.ts`: stub hooks that write an `out/rules.ir.json`

## Notes
- This repo does not include ANTLR runtime or generated parser code.
  In a real project:
  1) generate TS parser/lexer from `.g4`
  2) wire `ListenerSink` into the parse call
  3) run `compilePipeline` on the queue

## Next steps
- Generate parser/lexer via antlr4ts
- Implement RuleBuilderVisitor to produce your SurfaceRule AST
- Replace ListenerSinkAntlr placeholders with generated listener methods
- Plug RulescriptCompilerHooks into your real passes

## Lowering rules (infix → call)
- `a + b` → `call("add", [a,b])`
- `a - b` → `call("sub", [a,b])`
- `a * b` → `call("mul", [a,b])`
- `a / b` → `call("div", [a,b])`
- `x = expr` in conditions → `==` condition on variable `x`

See `src/parser/RuleBuilderVisitor.ts`.

## `not` lowering
This repo includes a minimal pass `src/compile/rewriteNot.ts` that lowers `not atom` into `not_exists(atom)`.

## Full rewrite pass
- `src/compile/rewriteFull.ts` lowers: not/exists/xor/forall/cardinality and performs DNF expansion.
- `src/compile/stratify.ts` checks stratified negation on derived predicates.
