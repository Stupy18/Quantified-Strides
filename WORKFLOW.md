# Dev Workflow — QuantifiedStrides

---

## Branch Strategy

```
main              ← production-ready. humans merge here. never commit directly.
dev               ← integration branch. all feature PRs target here.
  ├── feature/<name>    ← one per feature. branch from dev.
  └── fix/<name>        ← one per bug fix. branch from dev.
research          ← data science. notebooks, ML experiments, analysis.
                    merges to dev when findings trigger implementation.
```

### Rules

- **Never commit directly to `main` or `dev`.** Always branch + PR.
- Branch from `dev`, not `main`, for all feature and fix work.
- `research` → `dev` when a notebook finding needs implementation. Keep exploratory work in `research`.
- Delete branches after merge.
- One branch per logical unit of work. Don't stack unrelated changes on the same branch.

---

## Branch Naming

```
feature/rec-engine-v2              ← new features
feature/mobile-today-tab           ← mobile features
fix/mobile-white-screen            ← bug fixes
fix/dashboard-hrv-null             ← specific bug fixes
research/environmental-baseline    ← notebook / data science
research/sleep-readiness-model     ← ML experiments
```

Lowercase, hyphens only, no underscores. Short and descriptive.

---

## Commit Rules

- **Tense:** present imperative — `add`, `fix`, `update`, `remove`. Not `added`, `fixed`, `adding`.
- **Scope:** one logical change per commit. Don't mix unrelated changes.
- **Spec reference:** if a commit implements a spec, say so:
  ```
  implement signal assembly per RECOMMENDATION_PROTOCOL §3
  wire compute_sleep_readiness into dashboard service
  ```
- **Never skip pre-commit hooks** (`--no-verify` is banned unless explicitly approved by Vlad).
- **No secrets in commits.** `.env` is in `.gitignore`. Never commit API keys.

---

## PR Rules

Every PR must have:

1. **Description:** what changed and why — not a summary of the diff. The diff is visible; the *why* is not.
2. **`CURRENT.md` updated:** move the item from In Progress to Recently Completed.
3. **`docs/DECISIONS.md` updated:** if any algorithmic choice was made during implementation.
4. **New Flyway migration** if the schema changed. Never edited committed migrations.
5. **Tests pass** (when tests exist for the affected area).

PR title format: `[area] short description`
```
[mobile] fix white screen — add SafeAreaProvider to root layout
[backend] wire sleep readiness into dashboard service
[intelligence] implement plan-to-actual divergence tracking
[research] add environmental response baseline notebook
```

---

## Merge Rules

| From → To | Who | Requirements |
|---|---|---|
| `feature/*` → `dev` | Anyone | One review (human or `/review` agent output reviewed by human) |
| `fix/*` → `dev` | Anyone | One review |
| `research` → `dev` | Vlad | Research owner must explain findings to implementer before merge |
| `dev` → `main` | Vlad only | All target features merged, `/changelog-generator` run, changelog reviewed |

---

## Migration Rules (non-negotiable)

1. **All schema changes = new migration file.** Never edit a committed file.
2. **Naming:** `V{N}__{description}.sql` — integer version, double underscore.
   ```
   V004__add_training_load_daily.sql
   V005__add_competitions_table.sql
   ```
3. **Test before PR:** verify it runs clean on a fresh DB:
   ```bash
   docker compose down -v && docker compose up -d
   # watch flyway service complete without errors
   docker logs quantifiedstrides_flyway
   ```
4. **Non-destructive only.** No `DROP COLUMN` or `DROP TABLE` without explicit Vlad approval.
5. Flyway checksums every file on every run. A changed committed migration = broken stack for everyone.

---

## Release Process

1. All target features merged to `dev` and manually tested
2. Run `/review` on the `dev` → `main` diff
3. Run `/changelog-generator` — review and edit the output
4. PR `dev` → `main` — Vlad approves and merges
5. Tag the release:
   ```bash
   git tag v{major}.{minor}.{patch}
   git push origin --tags
   ```
6. Update `CURRENT.md` — move released items to Recently Completed

---

## Local Dev Quick Reference

```bash
# Full stack (recommended)
docker compose up -d --build

# DB only (for hot-reload dev)
docker compose up -d db

# Backend hot-reload
cd QuantifiedStrides && source .venv/bin/activate
uvicorn main:app --reload --port 8000

# Frontend hot-reload
cd frontend && npm run dev

# Mobile
cd mobile/mobile && npx expo start

# Reset DB completely
docker compose down -v && docker compose up -d
```

**Windows note:** if Docker build fails with symlink errors (`.venv/lib64`, `node_modules/.bin`), delete those local folders before running Docker. Docker installs deps fresh from `requirements.txt` / `package.json`.