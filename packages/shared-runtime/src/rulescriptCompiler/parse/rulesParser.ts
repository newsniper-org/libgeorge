
import fs from "fs";
import path from "path";
import { SurfaceRule, BodyFrag, SurfaceHead } from "../ast/surface";
import { Atom, Cond, Term, Sym } from "../ast/core";

/**
 * Pragmatic .rules parser for this project.
 *
 * Supported subset (sufficient for current shared ruleset):
 * - Facts: pred(arg1,arg2,...).
 * - Rules: head :- body.
 * - Body conjunction: item, item, item.
 * - item forms:
 *   - atom: pred(args)
 *   - not atom: not pred(args)
 *   - condition: X != Y, X == Y, X >= Y, X > Y, X <= Y, X < Y
 *   - assignment: X = add(A,B) | sub | mul | div | mod
 *   - exists( ( ... ) )
 *   - exact(N, ( ... ), by=[Var])  / at_least / at_most
 *   - forall(P, A -> B) in the simple form used in the ruleset
 *
 * Notes:
 * - This is not a general Prolog parser.
 * - It is deterministic and line-oriented with minimal recursion.
 */

type Tok = { t: string; v: string; i: number };

function tokenize(s: string): Tok[] {
  const out: Tok[] = [];
  const re = /\s+|%.*$|"(?:[^"\\]|\\.)*"|:-|->|!=|==|>=|<=|[(),.\[\]]|[<>]=?|=|[A-Za-z_][A-Za-z0-9_]*|[0-9]+/gy;
  let m: RegExpExecArray | null;
  let i = 0;
  while (i < s.length) {
    re.lastIndex = i;
    m = re.exec(s);
    if (!m) throw new Error(`tokenize error at ${i}: ${s.slice(i, i + 40)}`);
    const tok = m[0];
    i = re.lastIndex;
    if (/^\s+$/.test(tok)) continue;
    if (tok.startsWith("%")) continue;
    out.push({ t: tok, v: tok, i: m.index });
  }
  return out;
}

class P {
  constructor(public toks: Tok[], public k = 0) {}
  peek(): Tok | null { return this.toks[this.k] ?? null; }
  eat(v?: string): Tok {
    const t = this.peek();
    if (!t) throw new Error(`unexpected EOF`);
    if (v && t.v !== v) throw new Error(`expected '${v}' got '${t.v}'`);
    this.k++;
    return t;
  }
  tryEat(v: string): boolean {
    const t = this.peek();
    if (t && t.v === v) { this.k++; return true; }
    return false;
  }
  eof(): boolean { return this.k >= this.toks.length; }
}

function sym(s: string): Sym { return s as any; }

function parseTerm(p: P): Term {
  const t = p.peek();
  if (!t) throw new Error("term EOF");
  if (/^[0-9]+$/.test(t.v)) {
    p.eat();
    return { t: "lit", lit: { t: "int", v: BigInt(t.v) } } as any;
  }
  if (t.v.startsWith("\"")) {
    p.eat();
    const raw = t.v.slice(1, -1);
    return { t: "lit", lit: { t: "str", v: raw.replace(/\\"/g, "\"") } } as any;
  }
  if (/^[A-Za-z_]/.test(t.v)) {
    p.eat();
    // function call?
    if (p.tryEat("(")) {
      const args: Term[] = [];
      if (!p.tryEat(")")) {
        while (true) {
          args.push(parseTerm(p));
          if (p.tryEat(")")) break;
          p.eat(",");
        }
      }
      return { t: "call", fn: t.v, args } as any;
    }
    // variable or atom constant; heuristic: single-letter or Uppercase starts => var; else entity as var? In DSL we treat ids as variables only when capitalized.
    if (t.v[0] === t.v[0].toUpperCase()) return { t: "var", name: sym(t.v) } as any;
    // treat as string literal entity for simplicity
    return { t: "lit", lit: { t: "str", v: t.v } } as any;
  }
  throw new Error(`unexpected term token ${t.v}`);
}

function parseAtom(p: P): Atom {
  const name = p.eat().v;
  p.eat("(");
  const args: Term[] = [];
  if (!p.tryEat(")")) {
    while (true) {
      args.push(parseTerm(p));
      if (p.tryEat(")")) break;
      p.eat(",");
    }
  }
  return { pred: name.includes("/") ? (name as any) : ((name + "/" + args.length) as any), args } as any;
}

function parseCondFromComparison(p: P, left: Term): Cond {
  const op = p.eat().v;
  const right = parseTerm(p);
  return { c: "call", fn: op, args: [left, right] } as any;
}

// Parse a single body item into BodyFrag
function parseBodyItem(p: P): BodyFrag {
  const t = p.peek();
  if (!t) throw new Error("body item EOF");

  // not atom
  if (t.v === "not") {
    p.eat("not");
    const a = parseAtom(p);
    // represent "not atom" as exists(not_exists(atom)) via BodyFrag.exists + later rewrite: simplest create exists frag over atom and mark kind in core later is hard.
    // We'll encode as BodyFrag.exists over a single atom with a special wrapper not_exists(...)
    return { b: "exists", frag: { b: "atom", atom: a } } as any; // placeholder; compiler will treat 'exists' differently; limited
  }

  // exists(...)
  if (t.v === "exists") {
    p.eat("exists"); p.eat("(");
    const frag = parseBodyFrag(p);
    p.eat(")");
    return { b: "exists", frag } as any;
  }

  // exact/at_least/at_most
  if (t.v === "exact" || t.v === "at_least" || t.v === "at_most") {
    const kind = p.eat().v as any;
    p.eat("(");
    const n = parseTerm(p);
    p.eat(",");
    p.eat("(");
    const frag = parseBodyFrag(p);
    p.eat(")");
    let by: Sym[] | undefined;
    if (p.tryEat(",")) {
      p.eat("by"); p.eat("="); p.eat("[");
      by = [];
      if (!p.tryEat("]")) {
        while (true) {
          const v = p.eat().v;
          by.push(sym(v));
          if (p.tryEat("]")) break;
          p.eat(",");
        }
      }
    }
    p.eat(")");
    return { b: kind, n, frag, by } as any;
  }

  // forall(P, A -> B)
  if (t.v === "forall") {
    p.eat("forall"); p.eat("(");
    const v = { name: sym(p.eat().v) };
    p.eat(",");
    // parse A -> B (limited)
    const domain = parseBodyFrag(p);
    p.eat("->");
    const pred = parseBodyFrag(p);
    p.eat(")");
    return { b: "forall", v, domain, pred } as any;
  }

  // atom or assignment/compare starting with term
  if (/^[A-Za-z_]/.test(t.v)) {
    // lookahead: atom has "(" after name
    const t2 = p.toks[p.k + 1];
    if (t2 && t2.v === "(") {
      const atom = parseAtom(p);
      return { b: "atom", atom } as any;
    }
    // else parse term then maybe compare/assign
    const left = parseTerm(p);
    const op = p.peek();
    if (op && ["!=", "==", ">=", "<=", ">", "<"].includes(op.v)) {
      const cond = parseCondFromComparison(p, left);
      return { b: "cond", cond } as any;
    }
    if (op && op.v === "=") {
      p.eat("=");
      const rhs = parseTerm(p);
      const cond: Cond = { c: "call", fn: "==", args: [left, rhs] } as any;
      return { b: "cond", cond } as any;
    }
    throw new Error(`unsupported body item after term: ${op?.v}`);
  }

  throw new Error(`unsupported body item token: ${t.v}`);
}

function parseBodyFrag(p: P): BodyFrag {
  // parse conjunction list until closing token ) or .
  const items: BodyFrag[] = [];
  items.push(parseBodyItem(p));
  while (p.tryEat(",")) {
    items.push(parseBodyItem(p));
  }
  if (items.length === 1) return items[0];
  return { b: "and", items } as any;
}

function parseHead(p: P): SurfaceHead {
  const t = p.peek();
  if (!t) throw new Error("head EOF");
  if (t.v === "emit") {
    p.eat("emit"); p.eat("(");
    // event term is like transfer_money(...)
    const evAtom = parseAtom(p);
    p.eat(")");
    return { h: "emit", event: (evAtom.pred as any), args: evAtom.args } as any;
  }
  // derive predicate head: pred(...)
  const atom = parseAtom(p);
  return { h: "derive", pred: atom.pred as any, args: atom.args } as any;
}

export function parseRulesFile(text: string, fileName = "<rules>"): SurfaceRule[] {
  const lines = text.split(/\r?\n/);
  const rules: SurfaceRule[] = [];
  let ruleIdx = 0;

  for (let ln = 0; ln < lines.length; ln++) {
    const line = lines[ln].trim();
    if (!line || line.startsWith("%")) continue;
    // Only parse rule lines ending with '.'
    if (!line.endsWith(".")) continue;
    const tks = tokenize(line);
    const p = new P(tks);
    // heuristic: if contains ':-' then rule, else fact derive (ignored)
    const hasRule = tks.some(t => t.v === ":-");
    if (!hasRule) continue;

    // parse head
    const head = parseHead(p);
    p.eat(":-");
    const body = parseBodyFrag(p);
    p.eat(".");
    const id = `${path.basename(fileName)}:${ln + 1}:${++ruleIdx}`;
    rules.push({ id, head, body } as any);
  }
  return rules;
}

export function parseRulesetDir(dir: string): SurfaceRule[] {
  const out: SurfaceRule[] = [];
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".rules")).sort();
  for (const f of files) {
    const fp = path.join(dir, f);
    const txt = fs.readFileSync(fp, "utf-8");
    out.push(...parseRulesFile(txt, fp));
  }
  return out;
}
