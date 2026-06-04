/**
 * `mf check` — scan for `.mf` files (and `.md` files carrying the header),
 * report expired and expiring ones, and exit non-zero if anything is expired
 * or fails to parse.
 */

import { relative } from "node:path";
import { findRepoRoot } from "../repo/root.ts";
import { MfParseError, parseFile, type ParsedFile } from "../parser/index.ts";
import { scan } from "./scan.ts";

export interface CheckOptions {
  /** Directory to scan and use as the condition base. Defaults to repo root. */
  root?: string;
  /** Injectable clock for deterministic output. */
  now?: Date;
  warningWindowDays?: number;
}

interface ParseProblem {
  path: string;
  message: string;
}

export interface CheckResult {
  root: string;
  expired: ParsedFile[];
  expiring: ParsedFile[];
  valid: ParsedFile[];
  problems: ParseProblem[];
  /** 0 when nothing is expired or broken, 1 otherwise. */
  exitCode: number;
  /** Human-readable report. */
  output: string;
}

/** Runs a check and returns the structured result (no I/O side effects). */
export function runCheck(options: CheckOptions = {}): CheckResult {
  const root = options.root ?? findRepoRoot();
  const files = scan(root);

  const expired: ParsedFile[] = [];
  const expiring: ParsedFile[] = [];
  const valid: ParsedFile[] = [];
  const problems: ParseProblem[] = [];

  for (const path of files) {
    const isMf = path.endsWith(".mf");
    let parsed: ParsedFile;
    try {
      parsed = parseFile(path, {
        now: options.now,
        conditionBaseDir: root,
        warningWindowDays: options.warningWindowDays,
      });
    } catch (err) {
      // A `.md` with no header is just a regular Markdown file — skip it.
      // Anything else (including a `.mf` with no header) is a real problem.
      if (err instanceof MfParseError && err.code === "missing-header" && !isMf) {
        continue;
      }
      const message = err instanceof Error ? err.message : String(err);
      problems.push({ path, message });
      continue;
    }

    switch (parsed.state.kind) {
      case "expired":
        expired.push(parsed);
        break;
      case "expiring":
        expiring.push(parsed);
        break;
      case "valid":
        valid.push(parsed);
        break;
    }
  }

  const exitCode = expired.length > 0 || problems.length > 0 ? 1 : 0;
  const output = formatReport({ root, expired, expiring, valid, problems });
  return { root, expired, expiring, valid, problems, exitCode, output };
}

function formatReport(r: Omit<CheckResult, "exitCode" | "output">): string {
  const lines: string[] = [];
  const rel = (p: string) => relative(r.root, p) || p;

  if (r.expired.length > 0) {
    lines.push(`Expired (${r.expired.length}):`);
    for (const f of r.expired) {
      lines.push(`  ✗ ${rel(f.path)}${triggerSuffix(f)}`);
      if (f.metadata.reason) lines.push(`      ${f.metadata.reason}`);
    }
    lines.push("");
  }

  if (r.expiring.length > 0) {
    lines.push(`Expiring soon (${r.expiring.length}):`);
    for (const f of r.expiring) {
      const days = f.state.daysUntilExpiry;
      const when = days === undefined ? "" : ` — ${days} day${days === 1 ? "" : "s"} left`;
      lines.push(`  ⚠ ${rel(f.path)}${when}`);
      if (f.metadata.reason) lines.push(`      ${f.metadata.reason}`);
    }
    lines.push("");
  }

  if (r.problems.length > 0) {
    lines.push(`Problems (${r.problems.length}):`);
    for (const p of r.problems) {
      lines.push(`  ! ${rel(p.path)}: ${p.message}`);
    }
    lines.push("");
  }

  const summary =
    r.expired.length === 0 && r.problems.length === 0
      ? `All clear: ${r.valid.length} valid, ${r.expiring.length} expiring.`
      : `${r.expired.length} expired, ${r.expiring.length} expiring, ` +
        `${r.problems.length} problem(s), ${r.valid.length} valid.`;
  lines.push(summary);

  return lines.join("\n");
}

function triggerSuffix(f: ParsedFile): string {
  switch (f.state.triggeredBy) {
    case "date":
      return " — past expiry date";
    case "file_exists":
      return ` — ${f.metadata.expiresWhen?.file_exists} now exists`;
    case "file_absent":
      return ` — ${f.metadata.expiresWhen?.file_absent} is gone`;
    default:
      return "";
  }
}
