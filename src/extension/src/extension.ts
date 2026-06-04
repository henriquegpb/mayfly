import * as vscode from "vscode";
import { ParseCache } from "./parseCache.ts";
import { MfDecorationProvider } from "./decorationProvider.ts";

/**
 * Mayfly extension entry point.
 *
 * Registers the `.mf` decoration provider and keeps it fresh through three
 * mechanisms, none of which reparse the repo on every keystroke:
 *   1. a per-URI cache in {@link ParseCache} (parse only on miss);
 *   2. file watchers (the `.mf` itself, plus a broad create/delete watcher for
 *      `expires_when` conditions); and
 *   3. a single timer scheduled to the nearest future expiry boundary.
 */

const GLOBAL_REFRESH_DEBOUNCE_MS = 300;
// setTimeout overflows past ~24.8 days; cap and reschedule if a boundary is further out.
const MAX_TIMER_MS = 2_147_483_647;

export function activate(context: vscode.ExtensionContext): void {
  const cache = new ParseCache();
  const provider = new MfDecorationProvider(cache);

  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(provider),
    provider,
  );

  let boundaryTimer: ReturnType<typeof setTimeout> | undefined;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const toUris = (paths: string[]) => paths.map((p) => vscode.Uri.file(p));

  /** Re-evaluate every known `.mf` and reschedule the boundary timer. */
  const refreshAll = (): void => {
    provider.refresh(toUris(cache.knownPaths()));
    scheduleNextBoundary();
  };

  function scheduleNextBoundary(): void {
    if (boundaryTimer) {
      clearTimeout(boundaryTimer);
      boundaryTimer = undefined;
    }
    const next = cache.nextBoundary();
    if (next === undefined) return;

    const delay = Math.max(0, Math.min(next - Date.now(), MAX_TIMER_MS));
    boundaryTimer = setTimeout(() => {
      boundaryTimer = undefined;
      // A boundary was crossed (or we hit the cap): re-evaluate and reschedule.
      refreshAll();
    }, delay);
  }

  const scheduleGlobalRefresh = (): void => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      refreshAll();
    }, GLOBAL_REFRESH_DEBOUNCE_MS);
  };

  // 1. Watch the .mf files themselves: a change/create/delete affects only that file.
  const mfWatcher = vscode.workspace.createFileSystemWatcher("**/*.mf");
  const onMfChanged = (uri: vscode.Uri) => {
    provider.refresh([uri]);
    scheduleNextBoundary();
  };
  mfWatcher.onDidChange(onMfChanged);
  mfWatcher.onDidCreate(onMfChanged);
  mfWatcher.onDidDelete((uri) => {
    cache.invalidate(uri.fsPath);
    scheduleNextBoundary();
  });

  // 2. Broad watcher for create/delete only: an arbitrary file appearing or
  //    disappearing may flip an `expires_when` condition. Debounced, and cheap
  //    because we only re-decorate known `.mf` files.
  const repoWatcher = vscode.workspace.createFileSystemWatcher(
    "**/*",
    false, // create
    true, // ignore change events
    false, // delete
  );
  repoWatcher.onDidCreate(scheduleGlobalRefresh);
  repoWatcher.onDidDelete(scheduleGlobalRefresh);

  context.subscriptions.push(mfWatcher, repoWatcher, {
    dispose() {
      if (boundaryTimer) clearTimeout(boundaryTimer);
      if (debounceTimer) clearTimeout(debounceTimer);
    },
  });

  // Re-prime when the set of workspace folders changes.
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => void prime()),
  );

  /** Eagerly parse existing `.mf` files so decorations and the timer are ready. */
  async function prime(): Promise<void> {
    const files = await vscode.workspace.findFiles("**/*.mf");
    provider.refresh(files); // parses + populates the cache + notifies VS Code
    scheduleNextBoundary();
  }

  void prime();
}

export function deactivate(): void {
  // Timers and watchers are disposed via context.subscriptions.
}
