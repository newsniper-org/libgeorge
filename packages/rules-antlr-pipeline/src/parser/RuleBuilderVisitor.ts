import { Atom, Cond, Term, Sym } from "../ast/core.js";
import { BodyFrag, SurfaceHead, SurfaceRule } from "../ast/surface.js";

/**
 * RuleBuilderVisitor (implemented against `any` contexts)
 * ------------------------------------------------------
 * This visitor expects antlr4ts-style contexts:
 * - ctx.getChild(i).text
 * - ctx.childCount
 * - ctx.start.line / charPositionInLine
 *
 * Replace `any` with generated context types in production.
 *
 * Lowering policy:
 * - IDENT(...) => Atom pred normalized as "name/arity"
 * - expr infix => Term.call:
 *    a+b  -> call("add",[a,b])
 *    a-b  -> call("sub",[a,b])
 *    a*b  -> call("mul",[a,b])
 *    a/b  -> call("div",[a,b])
 *    a mod b -> call("mod",[a,b])  (if you add 'mod' keyword)
 * - comparisons => Cond.call(op,[lhs,rhs]) where op in {==,!=,<,<=,>,>=}
 * - assignment IDENT '=' expr => Cond.call("==",[var(IDENT), expr])
 * - boolean and/or inside expr/cond => Cond.call("and"/"or",[...]) (consistent with existing IR runtime)
 * - not atom => BodyFrag.not(atom)
 * - exists(body) => BodyFrag.exists(BodyFrag.and([...]) or single)
 */
export class RuleBuilderVisitor {
  constructor(private file: string) {}

  private sym(s: string): Sym { return s as any; }

  visitRuleStmt(ctx: any): SurfaceRule {
    const headCtx = ctx.head?.() ?? ctx.getChild?.(0);
    const bodyCtx = ctx.body?.() ?? ctx.getChild?.(2);
    const head = this.visitHead(headCtx);
    const body = this.visitBody(bodyCtx);

    const line = ctx.start?.line ?? 0;
    const col = ctx.start?.charPositionInLine ?? 0;

    return {
      id: `${this.file}:${line}:${col}`,
      head,
      body,
      span: { file: this.file, line, col },
    };
  }

  visitHead(ctx: any): SurfaceHead {
    // grammar: emitHead | deriveHead
    const text = ctx.text ?? ctx.getText?.() ?? "";
    if (text.startsWith("emit(") || ctx.emitHead) {
      // emit(atom, expr)
      const emitCtx = ctx.emitHead?.() ?? ctx; // could be emitHead itself
      // children: 'emit' '(' atom ',' expr ')'
      const atomCtx = emitCtx.atom?.(0) ?? emitCtx.getChild?.(2);
      const tickCtx = emitCtx.expr?.() ?? emitCtx.getChild?.(4);
      const atom = this.visitAtom(atomCtx);
      const tick = this.visitExpr(tickCtx);
      return { h: "emit", event: atom.pred, args: atom.args, tick };
    }
    const atom = this.visitAtom(ctx.atom?.() ?? ctx);
    return { h: "derive", pred: atom.pred, args: atom.args };
  }

  visitBody(ctx: any): BodyFrag {
    const items: BodyFrag[] = [];
    // body: bodyItem (',' bodyItem)*
    // We iterate children and pick bodyItem contexts if available
    const count = ctx.bodyItem ? ctx.bodyItem.length : 0;
    if (count) {
      for (let i = 0; i < count; i++) items.push(this.visitBodyItem(ctx.bodyItem(i)));
    } else {
      // fallback: parse by splitting top-level commas in ctx children
      const parts = this.splitByComma(ctx);
      for (const part of parts) items.push(this.visitBodyItem(part));
    }
    if (items.length === 1) return items[0];
    return { b: "and", items };
  }

  visitBodyItem(ctx: any): BodyFrag {
    const text = ctx.text ?? ctx.getText?.() ?? "";
    if (text.startsWith("not ")) {
      const atomCtx = ctx.atom?.() ?? ctx.getChild?.(1);
      return { b: "not", frag: { b: "atom", atom: this.visitAtom(atomCtx) } };
    }
    if (text.startsWith("exists(")) {
      const bodyCtx = ctx.body?.() ?? ctx.getChild?.(2);
      return { b: "exists", frag: this.visitBody(bodyCtx) };
    }
    if (text.startsWith("exact(") || text.startsWith("at_least(") || text.startsWith("at_most(")) {
      const kind = text.startsWith("exact(") ? "exact" : text.startsWith("at_least(") ? "at_least" : "at_most";
      const nCtx = ctx.expr?.(0) ?? ctx.getChild?.(2);
      const bodyCtx = ctx.body?.() ?? ctx.getChild?.(5); // ('(' body ')')
      const n = this.visitExpr(nCtx);
      const frag = this.visitBody(bodyCtx);
      const by = this.extractByList(ctx);
      return { b: kind as any, n, frag, by };
    }
    if (text.startsWith("forall(")) {
      const vTok = ctx.IDENT?.() ?? ctx.getChild?.(2);
      const v = { name: this.sym(vTok.text ?? vTok.getText?.() ?? "P") };
      const dom = ctx.body?.(0) ?? ctx.getChild?.(4);
      const pred = ctx.body?.(1) ?? ctx.getChild?.(6);
      return { b: "forall", v, domain: this.visitBody(dom), pred: this.visitBody(pred) };
    }
    // atom
    if (ctx.atom || text.includes("(")) {
      const atomCtx = ctx.atom?.() ?? ctx;
      // Heuristic: cond contexts also include comparisons; prefer cond if operators appear
            return { b: "atom", atom: this.visitAtom(atomCtx) };
    }
    // cond
    const condCtx = ctx.cond?.() ?? ctx;
    return { b: "cond", cond: this.visitCond(condCtx) };
  }

  visitAtom(ctx: any): Atom {
    const nameTok = ctx.IDENT?.() ?? ctx.getChild?.(0);
    const name = (nameTok.text ?? nameTok.getText?.() ?? "").trim();
    const args: Term[] = [];
    // atom: IDENT '(' (expr (',' expr)*)? ')'
    const exprCount = ctx.expr ? ctx.expr.length : 0;
    if (exprCount) {
      for (let i = 0; i < exprCount; i++) args.push(this.visitExpr(ctx.expr(i)));
    } else {
      // fallback: parse inside parentheses by naive split (not recommended)
    }
    const pred = `${name}/${args.length}`;
    return { pred, args };
  }

  visitCond(ctx: any): Cond {
    const text = ctx.text ?? ctx.getText?.() ?? "";
    // assignment IDENT '=' expr
    if (text.includes("=") && !text.includes("==") && !text.includes("!=") && !text.includes(">=") && !text.includes("<=")) {
      const left = { t: "var", name: this.sym(ctx.IDENT?.()?.text ?? ctx.getChild?.(0).text) } as Term;
      const rhs = this.visitExpr(ctx.expr?.() ?? ctx.getChild?.(2));
      return { c: "call", fn: "==", args: [left, rhs] };
    }
    // comparison
    const lhs = this.visitExpr(ctx.expr?.(0) ?? ctx.getChild?.(0));
    const opTok = ctx.getChild?.(1);
    const op = (opTok?.text ?? "").trim();
    const rhs = this.visitExpr(ctx.expr?.(1) ?? ctx.getChild?.(2));
    return { c: "call", fn: op, args: [lhs, rhs] };
  }

  visitExpr(ctx: any): Term {
    // We lower expression tree by inspecting node shape.
    // In antlr4ts, each rule has its own context type; here we use ctx.text-based heuristics.
    const text = ctx.text ?? ctx.getText?.() ?? "";
    // literals
    if (/^[0-9]+$/.test(text)) return { t: "lit", lit: { t: "int", v: BigInt(text) } };
    if (/^[0-9]+\.[0-9]+$/.test(text)) return { t: "lit", lit: { t: "float", v: Number(text) } };
    if (text.startsWith("\"") && text.endsWith("\"")) return { t: "lit", lit: { t: "str", v: text.slice(1, -1).replace(/\\"/g, "\"") } };

    // parenthesized
    if (text.startsWith("(") && text.endsWith(")")) {
      const inner = ctx.expr?.() ?? ctx.getChild?.(1);
      if (inner) return this.visitExpr(inner);
    }

    // function call IDENT(...)
    if (ctx.callExpr || (ctx.IDENT && ctx.getChildCount?.() >= 3 && ctx.getChild?.(1).text === "(")) {
      const fnTok = ctx.IDENT?.() ?? ctx.getChild?.(0);
      const fn = fnTok.text ?? fnTok.getText?.();
      const args: Term[] = [];
      const exprCount = ctx.expr ? ctx.expr.length : 0;
      if (exprCount) for (let i = 0; i < exprCount; i++) args.push(this.visitExpr(ctx.expr(i)));
      return { t: "call", fn, args };
    }

    // unary +/-
    const first = ctx.getChild?.(0)?.text;
    if (first === "-" || first === "+") {
      const inner = this.visitExpr(ctx.getChild(1));
      if (first === "+") return inner;
      // -x => sub(0,x)
      return { t: "call", fn: "sub", args: [{ t: "lit", lit: { t: "int", v: 0n } }, inner] as any };
    }

    // binary ops: rely on childCount == 3 pattern
    const cc = ctx.getChildCount?.() ?? 0;
    if (cc === 3) {
      const a = this.visitExpr(ctx.getChild(0));
      const op = ctx.getChild(1).text;
      const b = this.visitExpr(ctx.getChild(2));
      const fn = op === "+" ? "add"
        : op === "-" ? "sub"
        : op === "*" ? "mul"
        : op === "/" ? "div"
        : op;
      return { t: "call", fn, args: [a, b] };
    }

    // identifier
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(text)) {
      // uppercase => variable
      if (text[0] === text[0].toUpperCase()) return { t: "var", name: this.sym(text) };
      // otherwise treat as symbol/entity string literal
      return { t: "lit", lit: { t: "str", v: text } };
    }

    // fallback: treat as string literal to preserve determinism
    return { t: "lit", lit: { t: "str", v: text } };
  }

  private splitByComma(ctx: any): any[] {
    // best-effort: use children
    const out: any[] = [];
    if (!ctx.getChildCount) return [ctx];
    let acc: any[] = [];
    for (let i = 0; i < ctx.getChildCount(); i++) {
      const ch = ctx.getChild(i);
      if (ch.text === ",") {
        out.push({ text: acc.map((x: any) => x.text).join(" "), getChildCount: () => acc.length, getChild: (j: number) => acc[j] });
        acc = [];
      } else {
        acc.push(ch);
      }
    }
    if (acc.length) out.push({ text: acc.map((x: any) => x.text).join(" "), getChildCount: () => acc.length, getChild: (j: number) => acc[j] });
    return out;
  }

  private extractByList(ctx: any): Sym[] | undefined {
    const text = ctx.text ?? ctx.getText?.() ?? "";
    const m = /by=\[([A-Za-z0-9_,\s]+)\]/.exec(text);
    if (!m) return undefined;
    return m[1].split(",").map(s => this.sym(s.trim())).filter(Boolean);
  }
}
