/**
 * Recursively scans a directory for candidate `.mf` and `.md` files.
 *
 * Skips `node_modules`, `.git`, and other dot-directories so the walk stays
 * fast and doesn't descend into vendored or VCS internals.
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";

const SKIP_DIRS = new Set(["node_modules", ".git"]);

/** Returns absolute paths of all `.mf` and `.md` files under `root`. */
export function scan(root: string): string[] {
  const found: string[] = [];
  walk(root, found);
  return found;
}

function walk(dir: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    // Unreadable directory (permissions, race) — skip rather than crash.
    return;
  }

  for (const entry of entries) {
    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      walk(full, out);
    } else if (entry.isFile()) {
      if (entry.name.endsWith(".mf") || entry.name.endsWith(".md")) {
        out.push(full);
      }
    }
  }
}
