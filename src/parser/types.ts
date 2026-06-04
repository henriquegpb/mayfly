/**
 * Public types for the `.mf` parser core.
 *
 * This module is standalone: it has no dependencies on the CLI or the editor
 * extension, so both consumers can import it.
 */

/** What happens when a file expires. See SPEC.md "on_expire behaviors". */
export type OnExpire = "warn" | "ignore" | "hide";

/**
 * The repo-state conditions supported in V1. Both are local file reads.
 * Exactly the keys allowed; future conditions (git, network) are rejected.
 */
export interface ExpiresWhen {
  /** Expires once this path exists, relative to the condition base dir. */
  file_exists?: string;
  /** Expires once this path is gone, relative to the condition base dir. */
  file_absent?: string;
}

/** The normalized, validated frontmatter header. */
export interface Metadata {
  /** Expiry instant. Date-only values are UTC midnight. */
  expires?: Date;
  /** Repo-state expiry condition. */
  expiresWhen?: ExpiresWhen;
  /** Defaults to "warn". */
  onExpire: OnExpire;
  /** Free text: why this exists and why it expires. */
  reason?: string;
}

export type MfStateKind = "valid" | "expiring" | "expired";

/** What caused the file to be (or be heading toward) expired. */
export type TriggerKind = "date" | "file_exists" | "file_absent";

export interface MfState {
  kind: MfStateKind;
  /** Set when kind is "expired": which condition fired first. */
  triggeredBy?: TriggerKind;
  /**
   * For date-driven states only: whole days from `now` until `expires`.
   * Negative when already past. Undefined for condition-only files.
   */
  daysUntilExpiry?: number;
}

export interface ParsedFile {
  path: string;
  metadata: Metadata;
  body: string;
  state: MfState;
}

/** Options for evaluating a file's state. */
export interface EvalOptions {
  /** Current instant; injectable for testing. Defaults to `new Date()`. */
  now?: Date;
  /** Base dir for resolving `expires_when` relative paths (the repo root). */
  conditionBaseDir?: string;
  /** Days before `expires` that a file enters the "expiring" state. */
  warningWindowDays?: number;
}

/**
 * Why a parse failed.
 * - "missing-header": no frontmatter block at all. A `.md` file like this is
 *   simply not an `.mf` document and can be skipped.
 * - "invalid": a header is present but malformed or fails validation.
 */
export type MfParseErrorCode = "missing-header" | "invalid";

/** Thrown when a header is missing, malformed, or invalid. */
export class MfParseError extends Error {
  readonly code: MfParseErrorCode;
  constructor(message: string, code: MfParseErrorCode = "invalid") {
    super(message);
    this.name = "MfParseError";
    this.code = code;
  }
}
