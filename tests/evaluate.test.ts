import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluateState } from "../src/parser/evaluate.ts";
import type { Metadata } from "../src/parser/types.ts";

const NOW = new Date("2026-06-04T12:00:00.000Z");
const day = (iso: string) => new Date(iso);

function meta(overrides: Partial<Metadata>): Metadata {
  return { onExpire: "warn", ...overrides };
}

describe("evaluateState — date", () => {
  test("far future is valid", () => {
    const state = evaluateState(meta({ expires: day("2026-12-01T00:00:00Z") }), {
      now: NOW,
    });
    expect(state.kind).toBe("valid");
    expect(state.daysUntilExpiry).toBeGreaterThan(7);
  });

  test("within the 7-day window is expiring", () => {
    const state = evaluateState(meta({ expires: day("2026-06-08T12:00:00Z") }), {
      now: NOW,
    });
    expect(state.kind).toBe("expiring");
    expect(state.daysUntilExpiry).toBe(4);
  });

  test("past expiry is expired with date trigger", () => {
    const state = evaluateState(meta({ expires: day("2026-06-01T00:00:00Z") }), {
      now: NOW,
    });
    expect(state.kind).toBe("expired");
    expect(state.triggeredBy).toBe("date");
  });

  test("exactly now is expired (>= boundary)", () => {
    const state = evaluateState(meta({ expires: NOW }), { now: NOW });
    expect(state.kind).toBe("expired");
  });

  test("exactly at the window edge is expiring", () => {
    // 7 days out, to the millisecond.
    const expires = new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000);
    const state = evaluateState(meta({ expires }), { now: NOW });
    expect(state.kind).toBe("expiring");
  });

  test("just outside the window is valid", () => {
    const expires = new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000 + 1);
    const state = evaluateState(meta({ expires }), { now: NOW });
    expect(state.kind).toBe("valid");
  });

  test("custom warning window", () => {
    const state = evaluateState(meta({ expires: day("2026-06-20T12:00:00Z") }), {
      now: NOW,
      warningWindowDays: 30,
    });
    expect(state.kind).toBe("expiring");
  });
});

describe("evaluateState — conditions", () => {
  const dir = mkdtempSync(join(tmpdir(), "mf-eval-"));
  const present = "present.ts";
  writeFileSync(join(dir, present), "// here\n");

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test("file_exists: expired when the file is present", () => {
    const state = evaluateState(meta({ expiresWhen: { file_exists: present } }), {
      now: NOW,
      conditionBaseDir: dir,
    });
    expect(state.kind).toBe("expired");
    expect(state.triggeredBy).toBe("file_exists");
  });

  test("file_exists: valid when the file is absent", () => {
    const state = evaluateState(
      meta({ expiresWhen: { file_exists: "nope.ts" } }),
      { now: NOW, conditionBaseDir: dir },
    );
    expect(state.kind).toBe("valid");
  });

  test("file_absent: expired when the file is gone", () => {
    const state = evaluateState(
      meta({ expiresWhen: { file_absent: "gone.ts" } }),
      { now: NOW, conditionBaseDir: dir },
    );
    expect(state.kind).toBe("expired");
    expect(state.triggeredBy).toBe("file_absent");
  });

  test("file_absent: valid when the file still exists", () => {
    const state = evaluateState(
      meta({ expiresWhen: { file_absent: present } }),
      { now: NOW, conditionBaseDir: dir },
    );
    expect(state.kind).toBe("valid");
  });
});

describe("evaluateState — both present", () => {
  const dir = mkdtempSync(join(tmpdir(), "mf-both-"));
  writeFileSync(join(dir, "exists.ts"), "x");
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test("future date but condition met → expired by condition", () => {
    const state = evaluateState(
      meta({
        expires: day("2026-12-01T00:00:00Z"),
        expiresWhen: { file_exists: "exists.ts" },
      }),
      { now: NOW, conditionBaseDir: dir },
    );
    expect(state.kind).toBe("expired");
    expect(state.triggeredBy).toBe("file_exists");
  });

  test("past date but condition not met → expired by date", () => {
    const state = evaluateState(
      meta({
        expires: day("2026-06-01T00:00:00Z"),
        expiresWhen: { file_exists: "missing.ts" },
      }),
      { now: NOW, conditionBaseDir: dir },
    );
    expect(state.kind).toBe("expired");
    expect(state.triggeredBy).toBe("date");
  });

  test("neither triggered → valid", () => {
    const state = evaluateState(
      meta({
        expires: day("2026-12-01T00:00:00Z"),
        expiresWhen: { file_exists: "missing.ts" },
      }),
      { now: NOW, conditionBaseDir: dir },
    );
    expect(state.kind).toBe("valid");
  });
});
