## Context

The current intelligence layer computes ATL/CTL/TSB from raw HR-zone TRIMP on every dashboard request, looking back up to 120 days each time. This is a performance anti-pattern that will only worsen as data accumulates. TRIMP itself is an Edwards zone-weighted estimate, not Banister's formula, so it doesn't account for sex-specific metabolic response and cannot support the HRV quality filter that relies on knowing whether a preceding day was genuinely easy. The HRV baseline is a contaminated rolling window (7 days of all readings, including post-hard-session suppression) that makes suppressed days look normal during heavy blocks. Biomechanics fatigue index and pattern fatigue residuals are not yet implemented — both are required inputs for the §3.1 signal registry.

Story 001 (schema foundation) added the required columns (`workouts.trimp`, `workouts.fatigue_index`, `workouts.terrain_type`, `workouts.hr_stability_last_10min`, `training_load_daily`, `user_profile.hrv_baseline_mean/sd`, `user_profile.zone_speeds`, `pattern_fatigue_ledger`, `biomechanics_baselines`). This story wires up computation into all of them.

## Goals / Non-Goals

**Goals:**
- TRIMP computed via Banister's sex-specific formula and written to `workouts.trimp` post-sync
- ATL/CTL/TSB/ACWR/ramp_rate precomputed post-sync and stored in `training_load_daily`; dashboard reads from the table
- HRV baseline accumulated from clean-day readings only; stored in `user_profile`; `compute_hrv_status()` uses stored baseline
- Biomechanics fatigue index written to `workouts.fatigue_index` post-sync when baseline exists
- `workouts.hr_stability_last_10min` written post-sync for running sessions
- Zone speeds calibration written to `user_profile.zone_speeds` when ≥ 5 qualifying runs
- Pattern fatigue residuals computed in-memory at request time from `pattern_fatigue_ledger`
- `intelligence/signal_assembly.py` → `assemble_signals()` is the single entry point for building the full signal dict

**Non-Goals:**
- Safety gate logic (Story 003)
- Recommendation engine output (Story 004)
- Frontend display changes
- Per-athlete TRIMP threshold calibration
- Max HR computation (quarterly cron, Story 003+)
- 1RM cache updates (handled by strength service on set insert)
- Cycle phase / female athlete protocol (Story 003+)

## Decisions

### 1. TRIMP formula: Banister sex-specific over Edwards zone-weights

**Decision:** Replace `_trimp_for_date()` Edwards zone-weight TRIMP with `compute_trimp()` using Banister's formula `duration_min × HRr × k × exp(y × HRr)`.

**Why:** Banister accounts for the nonlinear physiological cost at high intensities via the exponential term. Edwards zone-weighted TRIMP is a cruder approximation that can't distinguish between two sessions with the same total zone-seconds but different HR profiles. The HRV quality filter requires knowing whether a day was "easy" (TRIMP ≤ 50) — Banister scores map more reliably to actual stress level than Edwards for this threshold comparison.

**Alternatives considered:** Keep Edwards for backwards compatibility and add a new `banister_trimp` column. Rejected — maintaining two parallel TRIMP columns creates confusion and the existing Edwards scores in the DB are not relied on by any external system.

**Migration note:** Existing `workouts.trimp` rows from Story 001 migration are all NULL (new column). Backfill is out of scope for this story — the precomputed `training_load_daily` will bootstrap from whatever TRIMP values exist at sync time. A backfill script can populate historical TRIMP later.

### 2. ATL/CTL/TSB storage: upsert post-sync, read from table on dashboard

**Decision:** After every successful `POST /api/v1/sync/garmin`, call `upsert_training_load_daily()` which runs `compute_load_metrics()` over the last 90 days of TRIMP and writes one row for today. Dashboard and recommendation engine read from `training_load_daily` instead of recomputing.

**Why:** Dashboard request latency becomes O(1) DB lookup instead of O(n) computation over 120 days × 4 async queries per day. More importantly, signal values become stable between syncs — a recommendation made at 9am will use the same load state as one made at 11am unless the user syncs in between.

**Alternatives considered:** Compute on every request with caching. Rejected — cache invalidation is harder to reason about and still doesn't avoid the fan-out reads on cache miss.

**Failure isolation:** If sync fails mid-pipeline (after TRIMP is written but before `training_load_daily` upsert), the prior row is stale but not wrong. The next successful sync corrects it. `training_load_daily` is never deleted — only upserted.

### 3. HRV baseline: stored per-athlete vs rolling window

**Decision:** Accumulate HRV baseline from clean-day readings only, store `(mean, sd)` in `user_profile.hrv_baseline_mean / hrv_baseline_sd`. `compute_hrv_status()` takes these stored values rather than recomputing the window.

**Why:** A rolling window is contaminated by the training stress it is measuring — suppressed HRV during a heavy block shifts the mean down, making genuinely poor days appear normal. The stored clean-day baseline reflects true resting HRV and doesn't degrade during periods of high training load.

**Clean-day criterion:** Preceding day TRIMP is `NULL` (rest) or ≤ 50 (≈ 60–70 min easy Z2). This requires `workouts.trimp` to be populated first.

**Accumulation trigger:** Called after `upsert_training_load_daily()` succeeds — at that point, TRIMP values for all synced workouts are available to classify each day.

### 4. Signal assembly: single `assemble_signals()` entry point

**Decision:** `intelligence/signal_assembly.py` is a new module containing `assemble_signals(user_id, today, repos...)` that calls every signal computation function and returns a complete dict. No key is omitted; missing signals are `None`.

**Why:** The §3.1 signal registry defines a contract between computation and consumption. If any key is absent, `build_recommendation()` (Story 004) would need defensive checks for missing keys rather than simply checking for `None`. A central assembly function also makes testing straightforward — one function to mock/assert.

**Alternatives considered:** Keep signals assembled ad-hoc inside each service that needs them. Rejected — the recommendation engine needs all signals simultaneously; ad-hoc assembly would scatter the collection logic.

### 5. Biomechanics fatigue index: post-sync, NULL without baseline

**Decision:** `compute_fatigue_index()` is called post-sync only for running workouts that have a matching row in `biomechanics_baselines` for their `terrain_type`. If no baseline exists, `workouts.fatigue_index` is left `NULL` — no error raised, no fallback fabricated.

**Why:** A fatigue index computed against a non-existent baseline has no validity. The `NULL` value propagates cleanly through the safety gate logic (gate skipped when signal is `None`). Once sufficient runs accumulate and `biomechanics_baselines` is populated (monthly cron, Story 003+), the index starts appearing naturally.

### 6. Pattern fatigue residuals: in-memory at request, not stored

**Decision:** `compute_pattern_fatigue_residuals()` reads `pattern_fatigue_ledger` rows and computes residuals in-memory per request. Not stored.

**Why:** Residuals are a function of current time — they decay continuously. Storing a snapshot would go stale immediately and require per-minute updates. The ledger itself is sparse (one row per pattern per session day), so the in-memory computation is cheap.

**Cold-start:** < 5 ledger entries for a pattern → approximate from `muscle_freshness` map using `(1 − mean(freshness[primary_muscles])) × 3.0`.

## Risks / Trade-offs

**[Risk] TRIMP NULL gap after migration** → Mitigation: `training_load_daily` rows written after Story 002 ships will have complete TRIMP. A backfill script (separate from this story) can populate historical values. Safety gates check for `< 3 sessions` before flagging a load problem, so sparse early data does not trigger false alerts.

**[Risk] HRV baseline cold-start (< 14 clean readings)** → Mitigation: `compute_hrv_status()` returns `'no_data'` when `hrv_baseline_mean` is `NULL`. All safety gates that key on HRV status are skipped in `'no_data'` state (Story 003 requirement). No gate fires falsely.

**[Risk] `biomechanics_baselines` empty until monthly cron runs** → Mitigation: `workouts.fatigue_index` stays `NULL`. The signal registry treats `NULL` as `None`; the solver doesn't break on absent signals.

**[Risk] Sync failure mid-pipeline leaves TRIMP written but `training_load_daily` stale** → Mitigation: `upsert_training_load_daily()` is the last step before sync returns success. If it fails, the sync endpoint returns 500 and the next retry will recompute and upsert correctly. The prior row remains valid until overwritten.

**[Trade-off] Pattern fatigue cold-start approximation is a HEURISTIC** → The `(1 − mean(freshness)) × 3.0` formula maps muscle freshness to a fake residual unit. This is intentional and documented as `# HEURISTIC` in code. It prevents the solver from treating a fresh-off-heavy-leg-day athlete as having zero leg fatigue simply because the ledger is thin.

## Migration Plan

1. Story 001 migrations must be applied first (`workouts.trimp`, `training_load_daily`, `user_profile.hrv_baseline_mean/sd/zone_speeds`, `pattern_fatigue_ledger`, `biomechanics_baselines` all must exist).
2. Deploy Story 002 code. No new migrations required.
3. First Garmin sync after deploy triggers TRIMP write + `training_load_daily` upsert + HRV baseline update.
4. Dashboard immediately benefits from table-read for ATL/CTL/TSB on next request after sync.
5. Historical TRIMP backfill can run as a separate one-off script after deploy without blocking.

**Rollback:** If `assemble_signals()` regresses the dashboard, the old `get_metrics()` / `get_hrv_status()` paths in `training_load.py` / `recovery.py` can be restored in `training_load_service.py` and `recovery_service.py` without touching the DB.