import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCheck } from "../src/cli/check.ts";

const NOW = new Date("2026-06-04T12:00:00.000Z");

/** Builds a fake repo with a `.git` marker and the given files. */
function makeRepo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "mf-check-"));
  mkdirSync(join(root, ".git"));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

const fm = (lines: string[]) => lines.join("\n") + "\n";

describe("runCheck", () => {
  const roots: string[] = [];
  const repo = (files: Record<string, string>) => {
    const r = makeRepo(files);
    roots.push(r);
    return r;
  };
  afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

  test("groups expired, expiring, and valid; exits non-zero on expired", () => {
    const root = repo({
      "expired.mf": fm(["---", "expires: 2026-06-01", 'reason: "old"', "---", "body"]),
      "expiring.mf": fm(["---", "expires: 2026-06-08", "---", "body"]),
      "valid.mf": fm(["---", "expires: 2026-12-01", "---", "body"]),
    });

    const result = runCheck({ root, now: NOW });
    expect(result.expired.map((f) => f.path.endsWith("expired.mf"))).toEqual([true]);
    expect(result.expiring).toHaveLength(1);
    expect(result.valid).toHaveLength(1);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Expired (1)");
    expect(result.output).toContain("old");
    expect(result.output).toContain("Expiring soon (1)");
  });

  test("plain .md without a header is ignored", () => {
    const root = repo({
      "README.md": "# Just docs\nNothing to expire.\n",
      "ok.mf": fm(["---", "expires: 2026-12-01", "---"]),
    });
    const result = runCheck({ root, now: NOW });
    expect(result.problems).toHaveLength(0);
    expect(result.valid).toHaveLength(1);
    expect(result.exitCode).toBe(0);
  });

  test(".md WITH a header is parsed", () => {
    const root = repo({
      "context.md": fm(["---", "expires: 2026-06-01", "---", "stale context"]),
    });
    const result = runCheck({ root, now: NOW });
    expect(result.expired).toHaveLength(1);
    expect(result.exitCode).toBe(1);
  });

  test("a .mf with a broken header is a problem and exits non-zero", () => {
    const root = repo({
      "broken.mf": fm(["---", "reason: only a reason", "---", "body"]),
      "noheader.mf": "no frontmatter at all\n",
    });
    const result = runCheck({ root, now: NOW });
    expect(result.problems).toHaveLength(2);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Problems (2)");
  });

  test("expires_when paths resolve from repo root regardless of layout", () => {
    const root = repo({
      "docs/note.mf": fm([
        "---",
        "expires_when:",
        '  file_exists: "src/new-api.ts"',
        "---",
        "remove when the new api lands",
      ]),
      "src/new-api.ts": "export const api = 1;\n",
    });
    const result = runCheck({ root, now: NOW });
    expect(result.expired).toHaveLength(1);
    expect(result.expired[0]?.state.triggeredBy).toBe("file_exists");
  });

  test("all-clear exits zero", () => {
    const root = repo({
      "valid.mf": fm(["---", "expires: 2027-01-01", "---", "fresh"]),
    });
    const result = runCheck({ root, now: NOW });
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("All clear");
  });
});
