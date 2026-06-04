# CLAUDE.md

Context for AI agents working in this repo.

## What this project is

`mf` is a file format and toolchain for **Markdown that expires**. A `.mf` file
is Markdown with a YAML frontmatter header declaring when its contents stop
being true. After expiry, tools treat the file as if it no longer exists.

The full format is in `SPEC.md`. **Read it before writing any code.** The spec
is the source of truth; the code implements it.

## Core principles (do not violate)

- **Soft expire only.** `mf` never deletes files. Expiry is a signal.
- **Offline and fast.** V1 conditions are local file reads only. No network,
  no git calls, no API calls.
- **Boring base.** `.mf` is just Markdown + YAML frontmatter. Don't invent new
  syntax.
- **Don't inflate scope.** See the "Out of scope (V1)" section in SPEC.md and
  respect it. No inline blocks, no `review_by`, no network conditions yet.

## Tech stack

- **Language:** TypeScript.
- **Runtime/build:** Bun (compiles to a single standalone binary).
- **Why:** the VS Code extension must be TS, so the CLI is TS too — the parser
  is shared between CLI and extension. One language, one codebase.

## Architecture (intended)

- `src/parser/` — reads a file, extracts frontmatter, evaluates state.
  This is the shared core, used by both the CLI and the extension.
- `src/cli/` — the `mf` command (`check`, `snooze`).
- `src/extension/` — the VS Code extension (later).

The parser must be a standalone module with no CLI or editor dependencies, so
both consumers can import it.

## State model

A file is **valid**, **expiring** (within 7 days of an `expires` date), or
**expired** (past its date, or its `expires_when` condition is met). If both
`expires` and `expires_when` are present, whichever triggers first wins.

## First task

Build the parser + `mf check`. Start here:

1. The parser: given a file path, return its state and metadata.
2. `mf check`: scan for `.mf` files (and `.md` files with the header), report
   expired and expiring ones, exit non-zero if anything is expired.
