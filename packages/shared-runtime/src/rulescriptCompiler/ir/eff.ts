import { Expr, RelPlan, Value } from "./rel";

export type EventTerm = {
  type: string;
  args: Expr[];
  meta?: Record<string, Expr>;
};

export type LogItem =
  | { k: "rule_fired"; ruleId: string; binding: [string, Value][] }
  | { k: "explain"; msg: string; data?: [string, Value][] };

export type EffProg =
  | { e: "pure" }
  | { e: "seq"; a: EffProg; b: EffProg }
  | { e: "guard"; cond: Expr }
  | { e: "tell"; item: LogItem }
  | { e: "emit"; event: EventTerm }
  | { e: "emit_many"; event: EventTerm; n: Expr }
  | {
      e: "choose_det";
      candidates: RelPlan;
      orderBy: Expr[];
      take: number;
      then: EffProg;
    };

export interface RuleIR {
  ruleId: string;
  body: RelPlan;
  per: EffProg;
  phase?: string;
  priority?: number;
}
