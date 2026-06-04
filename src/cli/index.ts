#!/usr/bin/env bun
/**
 * `mf` CLI entrypoint. V1 ships a single command: `check`.
 */

import { runCheck } from "./check.ts";

function main(argv: string[]): number {
  const command = argv[0];

  switch (command) {
    case undefined:
    case "check": {
      const result = runCheck();
      console.log(result.output);
      return result.exitCode;
    }
    case "-h":
    case "--help":
    case "help":
      printUsage();
      return 0;
    default:
      console.error(`mf: unknown command "${command}"\n`);
      printUsage();
      return 2;
  }
}

function printUsage(): void {
  console.log(
    [
      "mf — Markdown that expires",
      "",
      "Usage:",
      "  mf check    Scan for .mf files and report expired/expiring content",
      "  mf help     Show this help",
    ].join("\n"),
  );
}

process.exitCode = main(process.argv.slice(2));
