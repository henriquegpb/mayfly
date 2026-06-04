/**
 * Public API of the `.mf` parser core.
 *
 * Standalone: no CLI or editor dependencies. Both the `mf` CLI and the VS Code
 * extension import from here.
 */

import { readFileSync } from "node:fs";
import { parseFrontmatter } from "./frontmatter.ts";
import { evaluateState } from "./evaluate.ts";
import type { EvalOptions, Metadata, MfState, ParsedFile } from "./types.ts";

export type {
  EvalOptions,
  ExpiresWhen,
  Metadata,
  MfState,
  MfStateKind,
  OnExpire,
  ParsedFile,
  TriggerKind,
} from "./types.ts";
export { MfParseError } from "./types.ts";
export { parseFrontmatter } from "./frontmatter.ts";
export { evaluateState } from "./evaluate.ts";

export interface ParsedContent {
  metadata: Metadata;
  body: string;
  state: MfState;
}

/** Parses raw document content and evaluates its state. */
export function parseContent(content: string, options: EvalOptions = {}): ParsedContent {
  const { metadata, body } = parseFrontmatter(content);
  const state = evaluateState(metadata, options);
  return { metadata, body, state };
}

/**
 * Reads a file from disk and parses it.
 *
 * @throws MfParseError if the header is missing or invalid.
 */
export function parseFile(path: string, options: EvalOptions = {}): ParsedFile {
  const content = readFileSync(path, "utf8");
  const { metadata, body, state } = parseContent(content, options);
  return { path, metadata, body, state };
}
