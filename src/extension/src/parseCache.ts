import { dirname } from "node:path";
import { findRepoRoot } from "../../repo/root.ts";
import { MfParseError, parseFile, type MfState } from "../../parser/index.ts";

/**
 * Per-file cache of parse results, plus the bookkeeping needed to refresh
 * decorations exactly when time crosses an expiry boundary — without polling
 * or reparsing the repo on every keystroke.
 *
 * All expiry decisions come from the shared parser ({@link parseFile}); this
 * module only caches the result and tracks the future instants at which a
 * file's state can change on its own.
 */

export type EntryKind = MfState["kind"] | "error";

export interface CacheEntry {
  kind: EntryKind;
  /** Days until expiry, for the "expiring" tooltip. */
  daysUntilExpiry?: number;
  /** Which condition fired, for the "expired" tooltip. */
  triggeredBy?: MfState["triggeredBy"];
  /** Error message when kind === "error". */
  error?: string;
  /** ms epoch when this file becomes "expired" (date-driven), if known. */
  expiresAt?: number;
  /** ms epoch when this file enters the "expiring" window (date-driven), if known. */
  expiringAt?: number;
}

const WARNING_WINDOW_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export class ParseCache {
  private readonly entries = new Map<string, CacheEntry>();
  /** Cache of git-root lookups keyed by directory, so we don't walk per file. */
  private readonly repoRootByDir = new Map<string, string>();

  /** Returns the cached entry for a path, parsing on a miss. */
  get(fsPath: string, now: Date = new Date()): CacheEntry {
    const existing = this.entries.get(fsPath);
    if (existing) return existing;

    const entry = this.parse(fsPath, now);
    this.entries.set(fsPath, entry);
    return entry;
  }

  /** Drops a single file's cached result (e.g. after it changed on disk). */
  invalidate(fsPath: string): void {
    this.entries.delete(fsPath);
  }

  /** Drops everything (e.g. after a broad create/delete that may affect conditions). */
  clear(): void {
    this.entries.clear();
  }

  /** All paths currently cached — used to fan out a global refresh. */
  knownPaths(): string[] {
    return [...this.entries.keys()];
  }

  /**
   * The soonest future instant (ms epoch) at which any cached file changes
   * state on its own (enters "expiring" or "expired"), or undefined if no
   * cached file has an upcoming date boundary.
   */
  nextBoundary(now: Date = new Date()): number | undefined {
    const nowMs = now.getTime();
    let soonest: number | undefined;
    for (const entry of this.entries.values()) {
      for (const t of [entry.expiringAt, entry.expiresAt]) {
        if (t !== undefined && t > nowMs && (soonest === undefined || t < soonest)) {
          soonest = t;
        }
      }
    }
    return soonest;
  }

  private parse(fsPath: string, now: Date): CacheEntry {
    const conditionBaseDir = this.repoRoot(dirname(fsPath));
    try {
      const parsed = parseFile(fsPath, {
        now,
        conditionBaseDir,
        warningWindowDays: WARNING_WINDOW_DAYS,
      });
      const entry: CacheEntry = {
        kind: parsed.state.kind,
        daysUntilExpiry: parsed.state.daysUntilExpiry,
        triggeredBy: parsed.state.triggeredBy,
      };
      // Record date boundaries so the scheduler can wake us at the right moment.
      // Conditions (file_exists/file_absent) are event-driven via watchers, not time.
      if (parsed.metadata.expires) {
        const expiresMs = parsed.metadata.expires.getTime();
        entry.expiresAt = expiresMs;
        entry.expiringAt = expiresMs - WARNING_WINDOW_DAYS * MS_PER_DAY;
      }
      return entry;
    } catch (err) {
      if (err instanceof MfParseError) {
        return { kind: "error", error: err.message };
      }
      // Unreadable file / unexpected error — surface it as an error decoration.
      return { kind: "error", error: err instanceof Error ? err.message : String(err) };
    }
  }

  private repoRoot(dir: string): string {
    const cached = this.repoRootByDir.get(dir);
    if (cached) return cached;
    const root = findRepoRoot(dir);
    this.repoRootByDir.set(dir, root);
    return root;
  }
}
