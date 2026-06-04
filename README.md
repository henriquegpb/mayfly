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

Early. The format is specified in [`SPEC.md`](./SPEC.md). The CLI is in
development.

## Roadmap (V1)

- [ ] `mf check` — report expired / expiring files (exit code for CI)
- [ ] `mf snooze <file> +30d` — extend an expiry with one command
- [ ] pre-commit hook
- [ ] VS Code extension (icon + expired-state styling)

## License

MIT
