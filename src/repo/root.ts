/**
 * Finds the repository root by walking up the tree looking for `.git`.
 *
 * Used as the base for resolving `expires_when` paths, so `mf check` yields the
 * same result regardless of which subdirectory it runs from. Has no external
 * dependencies, so the VS Code extension can reuse it too.
 */

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * Walks up from `startDir` looking for a `.git` entry. Returns the directory
 * containing it, or `startDir` (resolved) if none is found.
 */
export function findRepoRoot(startDir: string = process.cwd()): string {
  let dir = resolve(startDir);

  while (true) {
    if (existsSync(resolve(dir, ".git"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      // Reached the filesystem root without finding `.git`.
      return resolve(startDir);
    }
    dir = parent;
  }
}
