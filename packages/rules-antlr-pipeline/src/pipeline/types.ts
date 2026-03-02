export type SourceSpan = { file: string; line: number; col: number };

export type FactAtom = { pred: string; args: unknown[] };

export type ParseEvent =
  | { kind: "ruleStart"; span: SourceSpan }
  | { kind: "head"; head: unknown; span: SourceSpan }
  | { kind: "body"; body: unknown; span: SourceSpan }
  | { kind: "ruleEnd"; span: SourceSpan }
  | { kind: "error"; message: string; span: SourceSpan };

export interface RuleUnit {
  id: string;
  head: unknown;
  body: unknown;
  span: SourceSpan;
}

export interface CompilerHooks {
  lowerRule(rule: RuleUnit): Promise<unknown>;
  typecheck(program: unknown[]): Promise<void>;
  stratify(program: unknown[]): Promise<void>;
  compileToIR(program: unknown[]): Promise<unknown>;
  emitArtifacts(artifact: { ir: unknown; facts: FactAtom[] }): Promise<void>;
}
