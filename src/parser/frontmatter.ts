/**
 * Extracts and validates the YAML frontmatter header of a `.mf` file.
 *
 * Pure: takes a content string, returns the normalized metadata and the
 * Markdown body. Throws MfParseError when the header is missing or invalid.
 */

import { parse as parseYaml } from "yaml";
import { MfParseError, type ExpiresWhen, type Metadata, type OnExpire } from "./types.ts";

/**
 * Matches a leading frontmatter block delimited by `---` lines, tolerant of
 * CRLF and of an optional leading BOM. Group 1 is the raw YAML, group 2 is the
 * remaining body.
 */
const FRONTMATTER_RE = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n([\s\S]*)|$)/;

const VALID_ON_EXPIRE: readonly OnExpire[] = ["warn", "ignore", "hide"];
const ALLOWED_WHEN_KEYS = new Set(["file_exists", "file_absent"]);

export interface Frontmatter {
  metadata: Metadata;
  body: string;
}

/**
 * Parses the frontmatter of a `.mf`/`.md` document.
 *
 * @throws MfParseError if no header is present, the YAML is malformed, or the
 *   header fails validation.
 */
export function parseFrontmatter(content: string): Frontmatter {
  const match = FRONTMATTER_RE.exec(content);
  if (!match) {
    throw new MfParseError(
      "no frontmatter header found (expected a leading `---` block)",
      "missing-header",
    );
  }

  const rawYaml = match[1] ?? "";
  const body = match[2] ?? "";

  let parsed: unknown;
  try {
    parsed = parseYaml(rawYaml);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new MfParseError(`malformed YAML in frontmatter: ${detail}`);
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new MfParseError("frontmatter must be a YAML mapping");
  }

  const header = parsed as Record<string, unknown>;
  const metadata = buildMetadata(header);
  return { metadata, body };
}

function buildMetadata(header: Record<string, unknown>): Metadata {
  const hasExpires = header.expires !== undefined && header.expires !== null;
  const hasWhen = header.expires_when !== undefined && header.expires_when !== null;

  if (!hasExpires && !hasWhen) {
    throw new MfParseError("header must declare `expires`, `expires_when`, or both");
  }

  const metadata: Metadata = {
    onExpire: normalizeOnExpire(header.on_expire),
  };

  if (hasExpires) {
    metadata.expires = normalizeExpires(header.expires);
  }
  if (hasWhen) {
    metadata.expiresWhen = normalizeExpiresWhen(header.expires_when);
  }
  if (header.reason !== undefined && header.reason !== null) {
    metadata.reason = String(header.reason);
  }

  return metadata;
}

function normalizeOnExpire(value: unknown): OnExpire {
  if (value === undefined || value === null) return "warn";
  if (typeof value === "string" && (VALID_ON_EXPIRE as readonly string[]).includes(value)) {
    return value as OnExpire;
  }
  throw new MfParseError(
    `invalid \`on_expire\`: ${JSON.stringify(value)} (expected one of ${VALID_ON_EXPIRE.join(", ")})`,
  );
}

function normalizeExpires(value: unknown): Date {
  // The `yaml` package parses ISO timestamps (date-only or with offset) into
  // Date objects. Date-only values become UTC midnight, matching the spec.
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new MfParseError("`expires` is not a valid date");
    }
    return value;
  }
  if (typeof value === "string") {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new MfParseError(`\`expires\` is not a valid ISO 8601 date: ${JSON.stringify(value)}`);
    }
    return date;
  }
  throw new MfParseError(`\`expires\` must be a date, got ${typeof value}`);
}

function normalizeExpiresWhen(value: unknown): ExpiresWhen {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new MfParseError("`expires_when` must be a mapping");
  }

  const when = value as Record<string, unknown>;
  const keys = Object.keys(when);

  const unsupported = keys.filter((k) => !ALLOWED_WHEN_KEYS.has(k));
  if (unsupported.length > 0) {
    throw new MfParseError(
      `unsupported \`expires_when\` condition(s) in V1: ${unsupported.join(", ")} ` +
        `(only file_exists and file_absent are supported)`,
    );
  }
  if (keys.length === 0) {
    throw new MfParseError("`expires_when` must declare at least one condition");
  }

  const result: ExpiresWhen = {};
  if (when.file_exists !== undefined) {
    result.file_exists = requireNonEmptyString("file_exists", when.file_exists);
  }
  if (when.file_absent !== undefined) {
    result.file_absent = requireNonEmptyString("file_absent", when.file_absent);
  }
  return result;
}

function requireNonEmptyString(field: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new MfParseError(`\`expires_when.${field}\` must be a non-empty string path`);
  }
  return value;
}
