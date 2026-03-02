import fs from "fs";
import path from "path";
import { CharStreams, CommonTokenStream } from "antlr4ts";
import { ParseTreeWalker } from "antlr4ts/tree/ParseTreeWalker.js";

import { TwoWorldsRulesLexer } from "../generated/TwoWorldsRulesLexer.js";
import { TwoWorldsRulesParser } from "../generated/TwoWorldsRulesParser.js";

import { AsyncEventQueue } from "../queue/AsyncEventQueue.js";
import { ParseEvent } from "../pipeline/types.js";
import { ListenerSinkAntlr } from "./ListenerSinkAntlr.js";

export function parseFileToQueue(filePath: string, queue: AsyncEventQueue<ParseEvent>): void {
  const input = CharStreams.fromString(fs.readFileSync(filePath, "utf-8"));
  const lexer = new TwoWorldsRulesLexer(input);
  const tokens = new CommonTokenStream(lexer as any);
  const parser = new TwoWorldsRulesParser(tokens as any);

  const tree = (parser as any).program();
  const sink = new ListenerSinkAntlr(queue, filePath);

  ParseTreeWalker.DEFAULT.walk(sink as any, tree);
}

export function parseRulesDirToQueueNoEnd(dirPath: string, queue: AsyncEventQueue<ParseEvent>): void {
  const files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".rules")).sort();
  for (const f of files) parseFileToQueue(path.join(dirPath, f), queue);
}

export function parseRulesDirToQueue(dirPath: string, queue: AsyncEventQueue<ParseEvent>): void {
  const files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".rules")).sort();
  for (const f of files) parseFileToQueue(path.join(dirPath, f), queue);
  queue.end();
}
