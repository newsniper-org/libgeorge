
import { Binding, Expr, Value } from "../ir/rel";
import { valueEq } from "./facts";

function asBool(v: Value): boolean {
  if (v.k !== "bool") throw new Error(`Expected Bool, got ${v.k}`);
  return v.v;
}
function asInt(v: Value): bigint {
  if (v.k !== "int") throw new Error(`Expected Int, got ${v.k}`);
  return v.v;
}
function asFloat(v: Value): number {
  if (v.k === "float") return v.v;
  if (v.k === "int") return Number(v.v);
  throw new Error(`Expected Float/Int, got ${v.k}`);
}

export function evalExpr(expr: Expr, b: Binding): Value {
  switch (expr.t) {
    case "lit": return expr.value;
    case "var": {
      const v = b.get(expr.name);
      if (!v) throw new Error(`Unbound var: ${expr.name}`);
      return v;
    }
    case "bin": {
      const a = evalExpr(expr.a, b);
      const c = evalExpr(expr.b, b);
      switch (expr.op) {
        case "==": return { k: "bool", v: valueEq(a, c) };
        case "!=": return { k: "bool", v: !valueEq(a, c) };
        case "<": return { k: "bool", v: asFloat(a) < asFloat(c) };
        case "<=": return { k: "bool", v: asFloat(a) <= asFloat(c) };
        case ">": return { k: "bool", v: asFloat(a) > asFloat(c) };
        case ">=": return { k: "bool", v: asFloat(a) >= asFloat(c) };
        case "+": return { k: "float", v: asFloat(a) + asFloat(c) };
        case "-": return { k: "float", v: asFloat(a) - asFloat(c) };
        case "*": return { k: "float", v: asFloat(a) * asFloat(c) };
        case "/": return { k: "float", v: asFloat(a) / asFloat(c) };
        case "mod": return { k: "int", v: asInt(a) % asInt(c) };
      }
    }
    case "call": {
      // minimal builtins
      if (expr.fn === "and") {
        for (const arg of expr.args) {
          if (!asBool(evalExpr(arg, b))) return { k: "bool", v: false };
        }
        return { k: "bool", v: true };
      }
      if (expr.fn === "or") {
        for (const arg of expr.args) {
          if (asBool(evalExpr(arg, b))) return { k: "bool", v: true };
        }
        return { k: "bool", v: false };
      }
      throw new Error(`Unknown builtin call: ${expr.fn}`);
    }
  }
}

export function evalBool(expr: Expr, b: Binding): boolean {
  const v = evalExpr(expr, b);
  if (v.k !== "bool") throw new Error(`Expected Bool result, got ${v.k}`);
  return v.v;
}

export function evalInt(expr: Expr, b: Binding): bigint {
  const v = evalExpr(expr, b);
  if (v.k === "int") return v.v;
  if (v.k === "float") return BigInt(Math.trunc(v.v));
  throw new Error(`Expected Int-ish result, got ${v.k}`);
}
