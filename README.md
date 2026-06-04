# mf

**Markdown that expires.**

`.mf` is a Markdown file with a shelf life. You write it like any `.md`, but a
small header declares when its contents stop being true. Once expired, tools —
editors, CI, and AI agents — treat it as if it no longer exists.

```
---
expires: 2026-09-01
on_expire: warn
reason: "remove after the v2 API launch"
---

# Temporary context for the AI agent

Don't refactor `src/auth/old.ts` until the migration lands.
```

## Why

Some things in a repo have a shelf life but nobody removes them on time: TODO
notes that fossilize, "temporary" workarounds that live for years, and — the
case `mf` cares about most — AI context files (`.cursor/rules`, `AGENTS.md`)
that go stale and start *misleading* the agent instead of helping it.

Today the only fix is remembering to delete things. Humans forget. `mf` makes
the shelf life explicit and machine-readable.

## What makes it different

Existing TODO linters only know how to fail a build on a date. `mf` is built
for a different world:

- **AI context first.** It's designed for the era of agents reading whole repos.
- **Expire by repo state, not just dates.** `expires_when` ties expiry to a
  fact about the repo ("until this file exists", "once this one is gone"),
  because context goes stale when the *code* changes, not on a calendar.
- **Soft expire.** Expiry is a signal, not destruction. Nothing gets deleted.

## Status

Early. The format is specified in [`SPEC.md`](./SPEC.md). `mf check` works
today; the rest of the CLI is in development.

## Install

`mf` builds to a single standalone binary with no runtime dependencies. From a
checkout:

```sh
bun install
bun run build      # → dist/mf
```

Put it on your `PATH` (or symlink it) to use `mf` anywhere:

```sh
sudo ln -s "$PWD/dist/mf" /usr/local/bin/mf
```

## Usage

Run `mf check` from anywhere inside your repo. It scans for `.mf` files (and
`.md` files that carry the header), reports what's expired or expiring, and
exits non-zero if anything is expired — so it drops straight into CI or a
pre-commit hook.

```sh
mf check
```

```
Expired (1):
  ✗ docs/legacy-notes.mf — past expiry date
      remove after the v2 API launch

Expiring soon (1):
  ⚠ AGENTS.md — 4 days left

1 expired, 1 expiring, 0 problem(s), 1 valid.
```

Paths in `expires_when` are resolved from the repository root, so `mf check`
gives the same result regardless of which subdirectory you run it from. During
development you can also run it without building: `bun run mf check`.

## Roadmap (V1)

- [x] `mf check` — report expired / expiring files (exit code for CI)
- [ ] `mf snooze <file> +30d` — extend an expiry with one command
- [ ] pre-commit hook
- [ ] VS Code extension (icon + expired-state styling)

## License

MIT
