# OpenSpec Workflow Guide — QuantifiedStrides

> How to take a piece of work from story → spec → implementation → archive using the OpenSpec tool and Claude Code.
> This guide is derived from the first live use of this workflow (Story 001 — Rec Engine v2.0 Schema Foundation, 2026-05-19).

---

## What Is OpenSpec?

OpenSpec is a structured change-management layer that lives in `openspec/` at the project root. It enforces a spec-first development discipline: before any code is written, the *why*, *what*, and *how* are written and locked into artifact files. Claude Code reads those files during implementation, so the work is grounded in explicit decisions rather than inference.

It integrates with this project's existing workflow: feature branches, Flyway migrations, CURRENT.md, and PROTOCOL.md all apply in exactly the same way — OpenSpec just adds a before-and-after documentation layer around implementation.

---

## Directory Layout

```
openspec/
  config.yaml                         ← OpenSpec project config (committed once, don't touch)
  specs/
    <capability>/
      spec.md                         ← Main living spec for a capability (synced from changes)
  changes/
    <change-name>/                    ← Active or in-progress change
      .openspec.yaml                  ← Change metadata (auto-generated)
      proposal.md                     ← WHY this change exists
      design.md                       ← HOW it will be implemented
      specs/
        <capability>/
          spec.md                     ← Delta spec (ADDED/MODIFIED/REMOVED requirements)
      tasks.md                        ← Implementation checklist
    archive/
      YYYY-MM-DD-<change-name>/       ← Completed changes archived here
```

---

## When to Use OpenSpec

Use OpenSpec for any change that:
- Touches multiple files or layers (schema + backend + frontend)
- Has dependencies other stories will block on
- Requires a spec to be written before implementation can start
- Needs to be reviewed by another team member before merging

You do NOT need OpenSpec for:
- A trivial bug fix with an obvious root cause
- Wiring an already-validated, self-contained function
- A single-file refactor

If a task has a story document (like Story 001), use OpenSpec.

---

## The Full Lifecycle

```
Story / idea arises
       ↓
/openspec-propose         ← writes all spec artifacts in one step
       ↓
/openspec-apply-change    ← implements tasks, marks checkboxes as done
       ↓
Validate (Docker, tests)
       ↓
/openspec-archive-change  ← syncs spec to openspec/specs/, moves change to archive/
       ↓
Open PR (feature/* → dev)
       ↓
Update CURRENT.md
```

Each step is a Claude Code skill. Steps are resumable: if you close a session mid-apply, run `/openspec-apply-change` again and it picks up from the remaining unchecked tasks.

---

## Step 1: Propose — `/openspec-propose`

**What it does:** Creates the change directory and generates all four artifacts in dependency order:
`proposal.md` → `design.md` + `specs/<capability>/spec.md` → `tasks.md`

**How to invoke:**

```
/openspec-propose
```

Claude will ask what you want to build. You can:
- Describe it in plain text
- Paste a story file path (e.g., `C:\Users\...\001.rec-engine-schema-foundation.md`)

**What Claude does under the hood:**

```bash
openspec new change "<kebab-case-name>"
openspec status --change "<name>" --json       # get artifact build order
openspec instructions <artifact-id> --change "<name>" --json  # for each artifact
```

**Artifact dependency order (spec-driven schema):**

```
proposal.md          ← no dependencies, always first
    ↓
design.md            ← reads proposal
specs/<cap>/spec.md  ← reads proposal (parallel with design)
    ↓
tasks.md             ← reads design + specs
```

**What each artifact contains:**

| Artifact | Content |
|---|---|
| `proposal.md` | WHY (problem/opportunity), WHAT changes (bullet list), CAPABILITIES (new or modified — drives spec file names), IMPACT (affected layers) |
| `design.md` | Context, Goals/Non-Goals, Decisions (key choices + alternatives), Risks/Trade-offs, Migration plan, Open questions |
| `specs/<cap>/spec.md` | Requirements (`### Requirement: <name>`) each with at least one scenario (`#### Scenario:` with WHEN/THEN) |
| `tasks.md` | Numbered groups of checkboxes (`- [ ] X.Y description`) in dependency order |

**Tip — the Capabilities section in proposal.md is the contract:**
Every capability listed under `### New Capabilities` becomes one `specs/<name>/spec.md` file. Get the names right here; they propagate everywhere.

---

## Step 2: Implement — `/openspec-apply-change`

**What it does:** Reads all context files, works through the pending tasks in `tasks.md`, marks each `- [ ]` → `- [x]` as completed, and pauses on blockers.

**How to invoke:**

```
/openspec-apply-change
```

If there is only one active change, it auto-selects it. Otherwise it prompts.

**What Claude does under the hood:**

```bash
openspec status --change "<name>" --json
openspec instructions apply --change "<name>" --json  # returns contextFiles + task list
```

It reads every file listed under `contextFiles` (proposal, design, specs, tasks) before touching any code.

**Pausing:** Claude pauses if:
- A task is ambiguous → it asks before implementing
- Docker/tests are required but not available → it reports the blocker and stops
- An implementation reveals a design issue → it suggests updating the design artifact

When paused, fix the blocker and re-run `/openspec-apply-change` — it resumes from the first unchecked task.

**Validation tasks:**
Include validation tasks (e.g., `4.1 Run docker compose down -v && docker compose up -d`) at the end of `tasks.md`. These cannot be skipped and are the gate for the PR. If Docker is not running when `/openspec-apply-change` is called, the implementation tasks complete but validation is left unchecked and the PR is blocked.

---

## Step 3: Archive — `/openspec-archive-change`

**What it does:**
1. Checks artifact and task completion (warns but doesn't block if incomplete)
2. Assesses delta specs — compares `changes/<name>/specs/` against `openspec/specs/`
3. Optionally syncs delta specs to the main `openspec/specs/` directory
4. Moves `changes/<name>/` to `changes/archive/YYYY-MM-DD-<name>/`

**How to invoke:**

```
/openspec-archive-change
```

**Spec sync — the important step:**

If your change introduced a new capability, the delta spec (`changes/<name>/specs/<cap>/spec.md`) needs to be promoted to the main spec (`openspec/specs/<cap>/spec.md`). Archive will prompt:

- `Sync now (Recommended)` — promotes the delta to main spec, then archives
- `Archive without syncing` — archives only (use if the spec is intentionally temporary)

For a new capability (no existing main spec), sync converts the `## ADDED Requirements` header to `## Requirements` and writes the file to `openspec/specs/<cap>/spec.md`.

For a modified capability (existing main spec), sync applies the delta changes (ADDED/MODIFIED/REMOVED) to the existing file.

**After archiving:** the change directory is gone from `changes/` — it lives in `archive/` with a date prefix. OpenSpec will no longer list it as an active change.

---

## Integration with Project Protocol

### Git — feature branch first, always

Before writing any code, create a feature branch:

```bash
git checkout -b feature/<change-name>   # branch from dev
```

All commits for the change go on this branch. Never write migration files on `dev` directly.

### Committing migration files

Stage only the change-related files:
```bash
git add QuantifiedStrides/db/flyway/V006__*.sql
git add QuantifiedStrides/db/flyway/V007__*.sql
git add openspec/
git commit -m "add rec engine v2.0 schema foundation (V006-V008)"
```

Do not stage unrelated modified files (`settings.local.json`, `.env`, `package-lock.json`, etc.).

### Flyway validation before PR (non-negotiable)

Per `WORKFLOW.md §Migration Rules`, every migration must be validated on a fresh DB before the PR opens:

```bash
docker compose down -v && docker compose up -d
docker logs -f <flyway-container-name>
# Must exit 0. Any error = fix the migration before continuing.
```

Also verify on an existing DB at the current highest version:
```bash
docker compose up -d   # without down -v — applies pending migrations only
```

Both must succeed. The PR cannot open until both pass.

### CURRENT.md — end of every session

Per `PROTOCOL.md §Mandatory Session Rules`, update `CURRENT.md` before closing:

- Move the change into **In Progress** with branch name and status (`Validation pending`, `PR open`, etc.)
- Update the **Active Branches** table
- If the change completed and PR merged, move it to **Recently Completed**

```markdown
| Rec engine v2.0 — Story 001 schema | — | `feature/rec-engine-schema-foundation` | Validation pending | V006/V007/V008 written. Blocked on Docker validation. PR after flyway exits 0. |
```

### PR requirements (from `WORKFLOW.md`)

Before opening the PR from `feature/<name>` → `dev`:

- [ ] Description: what changed and why (not a summary of the diff)
- [ ] `CURRENT.md` updated — item moved to In Progress or Recently Completed
- [ ] `docs/DECISIONS.md` updated if any algorithmic choice was made
- [ ] New Flyway migration files present, validated on fresh + existing DB
- [ ] Tests pass (when tests exist for the affected area)

PR title format: `[area] short description`
```
[backend] add rec engine v2.0 schema foundation (V006-V008)
```

---

## Gotchas From This Session

### `IF NOT EXISTS` on pre-existing columns

When `ALTER TABLE exercises ADD COLUMN IF NOT EXISTS skill_level ...` is used but `skill_level` already exists with a different type (e.g., `VARCHAR(15)` in V001 vs `SMALLINT` in the spec), the `IF NOT EXISTS` makes the statement a no-op — the old column type is preserved silently. This is correct behavior for a non-destructive migration, but the type mismatch becomes technical debt. Document it and plan a type-change migration separately if it matters for application code.

### Seeding in migration files — use `ON CONFLICT DO NOTHING`

Catalog seeds (e.g., `movement_patterns`, `strength_phase_catalog`) should use:
```sql
INSERT INTO ... VALUES ... ON CONFLICT (<pk>) DO NOTHING;
```
This makes the seed idempotent if the migration is somehow re-applied manually. Flyway's checksum protection prevents re-runs of committed files, but the defensive pattern costs nothing.

### Validation tasks left unchecked at archive time

It's acceptable to archive with validation tasks incomplete — the archive is a documentation action, not a release gate. The PR is the gate. The unchecked tasks serve as a record of what was deferred.

### Docker container name varies

`docker logs <name>` requires knowing the exact container name. Check with:
```bash
docker ps --format "{{.Names}}" | grep flyway
```

### Delta spec format — four hashtags for scenarios

Scenario headers in spec files **must** use exactly four hashtags (`####`). Three hashtags breaks the OpenSpec parser silently:
```markdown
#### Scenario: Fresh database migration    ← correct
### Scenario: Fresh database migration     ← wrong, silently broken
```

---

## Quick Reference

### Skills

| Skill | When |
|---|---|
| `/openspec-propose` | You have a story or an idea and want to generate all artifacts at once |
| `/openspec-apply-change` | You want to implement pending tasks from an existing change |
| `/openspec-archive-change` | Implementation is done (or deferred), ready to close out the change |
| `/opsx:explore` | Thinking through a problem before proposing — use when requirements are unclear |

### CLI Commands (Claude uses these internally)

```bash
openspec new change "<name>"
openspec list --json
openspec status --change "<name>" --json
openspec instructions <artifact-id> --change "<name>" --json
openspec instructions apply --change "<name>" --json
```

### Artifact order

```
proposal → design + specs → tasks → [apply] → archive
```

### Full session checklist

```
Before starting:
  [ ] Read CURRENT.md
  [ ] If stale, update CURRENT.md before doing anything else
  [ ] Create feature branch: git checkout -b feature/<change-name>

During:
  [ ] /openspec-propose — generate all artifacts
  [ ] /openspec-apply-change — implement tasks
  [ ] Validate (Docker must be running for migration tasks)

End of session:
  [ ] /openspec-archive-change — sync spec + archive
  [ ] Commit all files on feature branch
  [ ] Update CURRENT.md with status + branch
  [ ] Open PR when validation passes (feature/* → dev)
```

---

## Adding OpenSpec to AGENTS.md

When this workflow becomes standard, add a row to the **Which Agent for What** table in `AGENTS.md`:

```
| Spec-driven feature work | `/openspec-propose` → `/openspec-apply-change` → `/openspec-archive-change` | Any change with a story doc or cross-layer scope |
```
