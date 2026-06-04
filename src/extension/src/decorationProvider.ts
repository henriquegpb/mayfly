import * as vscode from "vscode";
import { ParseCache, type CacheEntry } from "./parseCache.ts";

/**
 * Decorates `.mf` files in the explorer with their expiry state.
 *
 * The state itself ("valid" / "expiring" / "expired") is decided by the shared
 * parser via {@link ParseCache} — this provider only maps that state onto a
 * VS Code {@link vscode.FileDecoration} (badge + color + tooltip).
 *
 * Note: the FileDecoration API supports only badge/color/tooltip — there is no
 * strikethrough for the file tree. "Expired" is therefore shown dimmed (gray)
 * with an ✗ badge rather than struck through.
 */
export class MfDecorationProvider implements vscode.FileDecorationProvider {
  private readonly emitter = new vscode.EventEmitter<vscode.Uri | vscode.Uri[]>();
  readonly onDidChangeFileDecorations = this.emitter.event;

  constructor(private readonly cache: ParseCache) {}

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    if (!uri.fsPath.endsWith(".mf")) return undefined;
    const entry = this.cache.get(uri.fsPath);
    return decorationFor(entry);
  }

  /**
   * Re-evaluates the given files and notifies VS Code.
   *
   * Reparses eagerly (invalidate + get) so the cache — and therefore the next
   * expiry boundary the scheduler reads — is fresh by the time this returns,
   * rather than lazily on VS Code's next query.
   */
  refresh(uris: vscode.Uri[]): void {
    if (uris.length === 0) return;
    const now = new Date();
    for (const uri of uris) {
      this.cache.invalidate(uri.fsPath);
      this.cache.get(uri.fsPath, now);
    }
    this.emitter.fire(uris);
  }

  dispose(): void {
    this.emitter.dispose();
  }
}

function decorationFor(entry: CacheEntry): vscode.FileDecoration | undefined {
  switch (entry.kind) {
    case "valid":
      return undefined;

    case "expiring": {
      const days = entry.daysUntilExpiry;
      const when =
        days === undefined ? "soon" : `in ${days} day${days === 1 ? "" : "s"}`;
      const deco = new vscode.FileDecoration(
        "◴",
        `Expiring ${when}`,
        new vscode.ThemeColor("mayfly.expiringForeground"),
      );
      return deco;
    }

    case "expired": {
      const deco = new vscode.FileDecoration(
        "✗",
        `Expired — ${triggerReason(entry.triggeredBy)}`,
        new vscode.ThemeColor("mayfly.expiredForeground"),
      );
      return deco;
    }

    case "error":
      return new vscode.FileDecoration(
        "!",
        `Invalid .mf header: ${entry.error ?? "parse error"}`,
        new vscode.ThemeColor("errorForeground"),
      );
  }
}

function triggerReason(trigger: CacheEntry["triggeredBy"]): string {
  switch (trigger) {
    case "date":
      return "past its expiry date";
    case "file_exists":
      return "its expires_when file now exists";
    case "file_absent":
      return "its expires_when file is gone";
    default:
      return "condition met";
  }
}
