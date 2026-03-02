import { AsyncEventQueue } from "../queue/AsyncEventQueue.js";
import { ParseEvent, SourceSpan } from "../pipeline/types.js";

/**
 * ListenerSinkAntlr (skeleton)
 *
 * Replace `any` with generated listener/context types:
 *   - extends TwoWorldsRulesListener
 *   - uses ctx.start.line / ctx.start.charPositionInLine for spans
 *
 * Strategy:
 * - On entering a ruleStmt, emit ruleStart.
 * - On exiting a ruleStmt, emit head/body payloads (or emit a single assembled RuleUnit).
 *
 * This keeps ANTLR callbacks synchronous while enabling async compilation downstream.
 */
import { RuleBuilderVisitor } from "./RuleBuilderVisitor.js";

export class ListenerSinkAntlr /* extends TwoWorldsRulesListener */ {
  constructor(private q: AsyncEventQueue<ParseEvent>, private file: string) {}

  private span(line: number, col: number): SourceSpan {
    return { file: this.file, line, col };
  }

  // Called by ANTLR when a ruleStmt starts
  enterRuleStmt(ctx: any): void {
    this.q.push({ kind: "ruleStart", span: this.span(ctx.start.line, ctx.start.charPositionInLine) });
  }

  
exitFactStmt(ctx: any): void {
  const v = new RuleBuilderVisitor(this.file);
  const a = v.visitAtom(ctx.atom?.() ?? ctx.getChild?.(0));
  this.q.push({ kind: "fact", atom: { pred: a.pred, args: a.args }, span: this.span(ctx.start.line, ctx.start.charPositionInLine) } as any);
}

  exitRuleStmt(ctx: any): void {
  const v = new RuleBuilderVisitor(this.file);
  const rule = v.visitRuleStmt(ctx);
  this.q.push({ kind: "rule", rule, span: this.span(ctx.start.line, ctx.start.charPositionInLine) });
}

  visitErrorNode(node: any): void {
    const line = node.symbol?.line ?? 0;
    const col = node.symbol?.charPositionInLine ?? 0;
    this.q.push({ kind: "error", message: String(node.text ?? "error"), span: this.span(line, col) });
  }
}
