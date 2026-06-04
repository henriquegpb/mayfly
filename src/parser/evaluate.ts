/**
 * Evaluates the state of a `.mf` file from its metadata.
 *
 * Conditions (`expires_when`) are local file reads resolved against
 * `conditionBaseDir`. The date check uses an injectable `now` so the same
 * logic is deterministic in tests.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { EvalOptions, Metadata, MfState } from "./types.ts";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_WARNING_WINDOW_DAYS = 7;

/**
 * Computes the current state of a file given its metadata.
 *
 * Expiry rules (SPEC.md "States"):
 * - A condition that is met expires the file immediately.
 * - A past `expires` date expires the file.
 * - Within the warning window of `expires`, the file is "expiring".
 * - If both `expires` and `expires_when` are present, whichever triggers
 *   first wins. The "expiring" window is driven only by the date.
 */
export function evaluateState(metadata: Metadata, options: EvalOptions = {}): MfState {
  const now = options.now ?? new Date();
  const baseDir = options.conditionBaseDir ?? process.cwd();
  const windowDays = options.warningWindowDays ?? DEFAULT_WARNING_WINDOW_DAYS;

  // Conditions short-circuit: a met condition means expired right now.
  if (metadata.expiresWhen) {
    const { file_exists, file_absent } = metadata.expiresWhen;
    if (file_exists !== undefined && existsSync(resolve(baseDir, file_exists))) {
      return { kind: "expired", triggeredBy: "file_exists" };
    }
    if (file_absent !== undefined && !existsSync(resolve(baseDir, file_absent))) {
      return { kind: "expired", triggeredBy: "file_absent" };
    }
  }

  if (metadata.expires) {
    const expiresMs = metadata.expires.getTime();
    const nowMs = now.getTime();
    const daysUntilExpiry = Math.floor((expiresMs - nowMs) / MS_PER_DAY);

    if (nowMs >= expiresMs) {
      return { kind: "expired", triggeredBy: "date", daysUntilExpiry };
    }
    if (nowMs >= expiresMs - windowDays * MS_PER_DAY) {
      return { kind: "expiring", daysUntilExpiry };
    }
    return { kind: "valid", daysUntilExpiry };
  }

  // Condition-only file whose condition has not been met yet.
  return { kind: "valid" };
}
