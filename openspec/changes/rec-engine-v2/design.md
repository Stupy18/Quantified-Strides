## Context

`intelligence/recommend.py` currently assembles signals inline and returns a freeform dict — no typed contract, no safety gates, no plan awareness, no exercise solver. `RECOMMENDATION_PROTOCOL.md` v2.0 defines the production engine. This design covers the architectural choices needed to implement it within the existing FastAPI / SQLAlchemy / Flyway stack.

Existing relevant code: `intelligence/recommend.py`, `intelligence/training_load.py`, `intelligence/recovery.py`, `services/intelligence/recommendation_service.py`, `services/dashboard_service.py`, `repos/workout_repo.py`, `ingestion/workout.py`.

## Goals / Non-Goals

**Goals:**
- Implement all signal computations from §3 of the spec with correct null/cold-start handling.
- Enforce safety gates (§4) before any session selection logic runs.
- Replace the current freeform recommendation dict with a typed `DailyRecommendation` Pydantic model.
- Add the CSP-based exercise solver (§7) and zone-speed running prescription (§8).
- Ship schema migrations for all 14 new tables and column additions.
- Wire post-sync jobs to compute `trimp`, `terrain_type`, `fatigue_index`, `hr_stability_last_10min`.
- Add plan generator infrastructure (§14–§16) including the catalog tables and weekly template engine.

**Non-Goals:**
- Frontend rendering of the new recommendation output (separate change).
- Claude API narrative layer — spec §0 explicitly excludes this.
- RAG pipeline changes.
- Per-user Garmin credential encryption (separate backlog item).

## Decisions

### 1. Signal assembly as a separate pre-step

**Decision:** Extract all signal computation into `intelligence/signal_assembly.py`. `build_recommendation()` receives a pre-assembled signals dict; it does not query the DB.

**Rationale:** The spec's input contract (§ "Input contract") is a signals dict, not a DB session. Keeping assembly separate makes the engine unit-testable without a live database and allows the dashboard service to cache assembled signals across multiple recommendation calls in the same request.

**Alternative considered:** Pass a DB session into `build_recommendation()` and query inside. Rejected: couples the engine to DB internals and prevents independent testing.

### 2. Flyway migrations — one version per logical group

**Decision:** Migrations `V003` through `V010` (approximate), each targeting a related set of tables. Suggested grouping: V003 = user_profile columns + workouts columns; V004 = `training_load_daily` + `movement_patterns` + `pattern_fatigue_ledger`; V005 = `exercises` ontology columns + `exercise_relationships` + `exercise_session_log` + `user_1rm_cache`; V006 = `competitions` + `menstrual_cycles` + `biomechanics_baselines`; V007 = `injuries` extensions; V008 = plan catalog tables (`plan_types`, `plan_goal_tiers`, `plan_type_phases`, `session_type_catalog`, `plan_session_templates`, `strength_phase_catalog`, `strength_phase_exercises`); V009 = `training_plans` + `training_plan_weeks`; V010 = seed rows for catalogs.

**Rationale:** Grouping related tables in one migration reduces the number of files; splitting by domain keeps each file reviewable. Never combine unrelated schema changes in one version.

**Rule:** Never edit a committed migration file. If a column needs changing after merge, add a new version.

### 3. CSP solver over greedy selection

**Decision:** Use a constraint satisfaction approach (Python `python-constraint` or hand-rolled backtracker) to select exercises rather than a greedy score sort.

**Rationale:** The exercise selection problem has hard constraints (pattern freshness gates, CNS budget cap, equipment availability, injury blocks) that a greedy sort cannot guarantee satisfaction of. A CSP backtracks when constraints are violated, guaranteeing a valid selection or an explicit "no solution" fallback.

**Alternative considered:** Greedy sort by composite score with post-filter. Rejected: can produce invalid solutions when multiple constraints interact (e.g., all high-CNS exercises are fresh but exceed budget together).

**Fallback:** If CSP finds no solution, relax non-safety constraints in order (drop optional exercises, allow higher budget) and re-solve. If still unsolvable, return a minimal bodyweight session.

### 4. `training_load_daily` precomputation

**Decision:** Compute ATL/CTL/TSB/ACWR/ramp_rate after each sync and write to `training_load_daily`. Dashboard requests read from this table, not from raw TRIMP series.

**Rationale:** Computing the full EWMA series on every dashboard request over 90 days of workouts is O(n) per request and blocks the async event loop for non-trivial users. Precomputation makes the dashboard read O(1).

**Trade-off:** Training load values shown on dashboard will lag by at most one sync cycle (typically < 1 minute for Garmin sync). This is acceptable — the user is not watching load change in real time.

### 5. Background jobs via FastAPI lifespan + APScheduler

**Decision:** Use APScheduler (already available or add as dep) registered in the FastAPI lifespan context for: monthly zone speed calibration, quarterly max HR update, HRV baseline re-establishment trigger.

**Rationale:** These jobs are too infrequent to warrant a full Celery setup. APScheduler running in-process is sufficient for a single-server deployment.

**Risk:** If the server restarts, in-progress jobs are lost. Mitigation: jobs are idempotent (rerunning produces the same result) and designed to be retriggered on next schedule tick.

## Risks / Trade-offs

- **Cold-start (< 14 clean HRV readings):** `compute_hrv_status()` returns `'no_data'` and safety gates skip the HRV check. Engine still runs on remaining signals. Mitigation: shown in spec §10 degradation table.
- **TRIMP requires HR:** Workouts without avg_hr produce `trimp = None`, excluding that session from ATL/CTL. For users who don't wear HR monitors, training load metrics will be underestimated. No mitigation in v2 — documented as known limitation.
- **Pattern fatigue ledger cold-start (< 5 session entries):** CSP solver approximates residual from `muscle_freshness`. The approximation is coarser — may produce suboptimal (but valid) exercise selection. Documented as HEURISTIC in spec.
- **Migration ordering risk:** Foreign keys between new tables (e.g., `strength_phase_exercises` → `strength_phase_catalog`) require catalog seed rows before data rows. Enforced by migration grouping (V008 schema + seed in one file, V009 references it).
- **`environment.py` hardcoded user_id=1:** Known pre-existing bug. Out of scope for this change but noted — sync pipeline extension must not replicate this pattern.

## Migration Plan

1. Run Flyway migrations V003–V010 (non-destructive — all additive).
2. Deploy updated ingestion pipeline — new sync now computes and persists `trimp`, `terrain_type`, `fatigue_index`, `hr_stability_last_10min`. Old synced workouts missing these columns get `NULL` (handled by null rules in signal assembly).
3. Backfill `workouts.trimp` for existing rows via `scripts/backfill_trimp.py` (to be written).
4. Backfill `training_load_daily` via `scripts/backfill_training_load.py` (to be written).
5. Deploy updated recommendation engine. Dashboard service updated to use typed output.
6. APScheduler jobs registered — first zone speed calibration runs on next tick.

**Rollback:** Migrations are additive; old engine code can be restored without schema rollback. If a migration must be reverted, add a new `V{n}__rollback_*.sql` — never edit committed files.

## Open Questions

- **`python-constraint` vs hand-rolled CSP:** Confirm whether `python-constraint` is acceptable as a new dependency or if a hand-rolled backtracker is preferred to keep the dependency surface minimal.
- **APScheduler vs Celery:** Confirm single-server assumption holds for the foreseeable future. If horizontal scaling is anticipated, switch to Celery + Redis before implementing background jobs.
- **Zone speed calibration threshold:** Spec states "< 5 qualifying runs per zone → null". Confirm 5 is the right minimum for Vlad's current data volume (may need to drop to 3 for zones rarely trained in).
- **Plan generator v1 scope:** Spec covers marathon, half-marathon, 10k, 5k, trail 50k, standalone strength, standalone hypertrophy. Confirm which plan types are in-scope for v1 vs. deferred.