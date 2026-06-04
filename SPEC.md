# `.mf` — Markdown that expires

**Version:** 0.1 (draft)
**Status:** Request for comments

## What it is

`.mf` is Markdown with an expiration date. A `.mf` file is a regular Markdown
file with a YAML frontmatter header that declares when its contents stop being
true. After expiry, tools (editors, linters, CI, AI agents) treat the file as
if it no longer exists.

The format is intentionally boring: if you know Markdown, you know `.mf`. The
only new thing is the expiration semantics.

```
---
expires: 2026-09-01
on_expire: warn
reason: "remove after the v2 API launch"
---

# Temporary context for the AI agent

The legacy auth flow in `src/auth/old.ts` is still wired up.
Don't refactor it until the migration lands.
```

## Why

Some things in a repo have a shelf life but nobody removes them on time:

- TODO/FIXME notes that turn into fossils
- "Temporary" workarounds that live for years
- AI context files (`.cursor/rules`, `AGENTS.md`, etc.) that go stale and
  start *misleading* the agent instead of helping it

Today the only fix is human discipline, and humans forget. `.mf` makes the
shelf life explicit and machine-readable.

## The header

The frontmatter is YAML, the same shape already used by Cursor rules and
AGENTS.md, so it slots into an existing convention rather than inventing a new
one.

### Fields

| Field         | Required | Meaning                                                        |
|---------------|----------|----------------------------------------------------------------|
| `expires`     | one of\* | A date (ISO 8601). Content expires at this instant.            |
| `expires_when`| one of\* | A condition tied to repo state (see below).                    |
| `on_expire`   | no       | What happens on expiry: `warn` (default), `ignore`, `hide`.    |
| `reason`      | no       | Free text. Why this exists and why it expires.                 |

\* A file must declare `expires`, `expires_when`, or both. If both are present,
the file is expired when *either* condition is met (whichever comes first).

### `expires` (date)

The simple case. ISO 8601. Always interpreted as UTC if no offset is given, to
avoid the "midnight where?" trap.

```
expires: 2026-09-01
expires: 2026-09-01T00:00:00-03:00
```

### `expires_when` (repo state) — the important one

Content doesn't usually go stale on a calendar. It goes stale when the *code*
changes. `expires_when` ties expiry to a fact about the repo instead of a date.

**V1 supports two conditions (both are local file reads, no network):**

```
expires_when:
  file_exists: "src/new-api.ts"     # expires once the new file lands
```

```
expires_when:
  file_absent: "legacy/old-auth.ts" # expires once the legacy file is gone
```

Future conditions (documented, not yet implemented): dependency added/removed,
branch merged, PR closed, CI status. These need git/network access and are
deliberately out of scope for V1 to keep the tool offline and fast.

### `on_expire` behaviors

- `warn` (default): file still exists, but `mf check` reports it and tools
  surface it as expired. Nothing is deleted.
- `ignore`: AI agents and tools treat the content as absent. Soft expire.
- `hide`: editors visually de-emphasize it (strikethrough, dimmed).

`.mf` never deletes files on its own. Expiry is a *signal*, not destruction.
Git never forgets anyway, so hard deletion is pointless and dangerous.

## States

A `.mf` file is in one of three states:

1. **Valid** — not yet expired.
2. **Expiring** — within a warning window (default 7 days) of its `expires`
   date. Surfaced so it's seen *before* it becomes a problem.
3. **Expired** — past its date or its condition is met.

## How an AI agent should treat `.mf`

This is the part no existing format specifies.

- Before using the contents of a `.mf` file as context, an agent checks its
  state.
- If **expired**, the agent treats the file as if it were not in the repo. It
  does not act on its instructions and does not surface its claims as current.
- If **expiring**, the agent may use it but should treat it as soon-to-be-stale.
- Expiry is evaluated at read time against the current date and repo state.

## Out of scope (V1)

- Inline block expiry (`@expires` around a code snippet) — file-level only first.
- `review_by` (flag for human review without expiring) — planned, not in V1.
- Network/git conditions in `expires_when` — planned, not in V1.
- Hard deletion / encryption — not a goal. Soft expire only.

## Extension

`.mf` is a distinct file extension, not just a `.md` with an `expires:` header.

The distinct extension is what enables:

- A dedicated file icon, so expiring content is identifiable at a glance.
- Editor treatment (strikethrough / dimming when expired).
- An ecosystem signal: the extension itself says "this content has a shelf life."

For adoption, the parser also accepts the same frontmatter header in any `.md`
file. So `.mf` is the first-class citizen, but no one has to rename files to
start using the convention.

## Open questions

- Default warning window: 7 days. Configurable?
- Timezone default: UTC. Confirmed.
