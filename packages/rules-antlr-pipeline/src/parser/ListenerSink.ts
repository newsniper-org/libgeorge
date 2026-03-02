import { AsyncEventQueue } from "../queue/AsyncEventQueue.js";
import { ParseEvent, SourceSpan } from "../pipeline/types.js";

export class ListenerSink {
  constructor(private q: AsyncEventQueue<ParseEvent>, private file: string) {}

  private span(line: number, col: number): SourceSpan {
    return { file: this.file, line, col };
  }

  onRuleStart(line: number, col: number): void {
    this.q.push({ kind: "ruleStart", span: this.span(line, col) });
  }

  onHead(head: unknown, line: number, col: number): void {
    this.q.push({ kind: "head", head, span: this.span(line, col) });
  }

  onBody(body: unknown, line: number, col: number): void {
    this.q.push({ kind: "body", body, span: this.span(line, col) });
  }

  onRuleEnd(line: number, col: number): void {
    this.q.push({ kind: "ruleEnd", span: this.span(line, col) });
  }

  onError(message: string, line: number, col: number): void {
    this.q.push({ kind: "error", message, span: this.span(line, col) });
  }

  end(): void {
    this.q.end();
  }
}
