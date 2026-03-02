import { AsyncEventQueue } from "../queue/AsyncEventQueue.js";
import { CompilerHooks, ParseEvent, RuleUnit } from "./types.js";

export async function compilePipeline(
  q: AsyncEventQueue<ParseEvent>,
  hooks: CompilerHooks
): Promise<void> {
  const lowered: unknown[] = [];
  const facts: any[] = [];
  let cur: Partial<RuleUnit> | null = null;
  let ruleCounter = 0;

  for await (const ev of q) {
    switch (ev.kind) {
      case "rule": {
        lowered.push(await hooks.lowerRule((ev as any).rule));
        break;
      }
      case "fact": {
        facts.push((ev as any).atom);
        break;
      }

      case "ruleStart":
        if (cur) throw new Error(`nested ruleStart at ${fmt(ev)}`);
        cur = { span: ev.span };
        break;
      case "head":
        if (!cur) throw new Error(`head outside rule at ${fmt(ev)}`);
        cur.head = ev.head;
        break;
      case "body":
        if (!cur) throw new Error(`body outside rule at ${fmt(ev)}`);
        cur.body = ev.body;
        break;
      case "ruleEnd":
        if (!cur) throw new Error(`ruleEnd without ruleStart at ${fmt(ev)}`);
        if (cur.head === undefined || cur.body === undefined) {
          throw new Error(`incomplete rule at ${fmt(ev)} (missing head/body)`);
        }
        const rule: RuleUnit = {
          id: `${ev.span.file}:${++ruleCounter}`,
          head: cur.head,
          body: cur.body,
          span: cur.span!,
        };
        lowered.push(await hooks.lowerRule(rule));
        cur = null;
        break;
      case "error":
        throw new Error(`parse error at ${fmt(ev)}: ${ev.message}`);
    }
  }

  await hooks.stratify(lowered);
  await hooks.typecheck(lowered);

  const ir = await hooks.compileToIR(lowered);
  await hooks.emitArtifacts({ ir, facts });
}

function fmt(ev: { span: { file: string; line: number; col: number } }): string {
  return `${ev.span.file}:${ev.span.line}:${ev.span.col}`;
}
