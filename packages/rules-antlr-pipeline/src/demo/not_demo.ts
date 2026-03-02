import { RuleBuilderVisitor } from "../parser/RuleBuilderVisitor.js";
import { lowerNotOnly } from "../compile/rewriteNot.js";

// This is a lightweight smoke test showing the intended lowering.
// In real usage, `RuleBuilderVisitor` receives ANTLR contexts.
const rule = {
  id: "r1",
  head: { h: "emit", event: "foo/1", args: [{ t: "var", name: "P" }], tick: { t: "var", name: "T" } },
  body: { b: "and", items: [
    { b: "atom", atom: { pred: "player/1", args: [{ t: "var", name: "P" }] } },
    { b: "not", frag: { b: "atom", atom: { pred: "in_jail/3", args: [{ t: "var", name: "P" }, { t: "var", name: "T" }, { t: "var", name: "K" }] } } }
  ] }
} as any;

const lowered = lowerNotOnly(rule);
console.log(JSON.stringify(lowered, null, 2));
