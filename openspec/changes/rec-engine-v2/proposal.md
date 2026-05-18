## Why

The existing `intelligence/recommend.py` is a heuristic stub — it integrates signals loosely and outputs a single sport/intensity suggestion with no typed contract, no safety gates, no exercise solver, and no plan awareness. The `RECOMMENDATION_PROTOCOL.md` (v2.0, 2026-05-09) defines the full production-grade engine; this change implements it end-to-end so the daily recommendation becomes an actionable, personalized, clinically safe training prescription.

## What Changes

- **BREAKING** `build_recommendation()` input contract changes: caller must now pass a fully-assembled signals dict with all keys defined in §3.1 of the spec (missing keys must be `None`, not omitted). The existing ad-hoc keyword call signature is replaced.
- Add 14 new database tables and extend 3 existing ones (all non-destructive migrations).
- Replace the current `intelligence/recommend.py` internals with the three-subsystem architecture: signal assembly layer, daily engine (safety gates → session selection → prescription), and plan generator.
- Add background jobs for training load precomputation, zone speed calibration, and 1RM cache invalidation.
- Extend the Garmin sync pipeline to compute and persist `trimp`, `terrain_type`, `fatigue_index`, and `hr_stability_last_10min` post-sync.
- Add `repos/recommendation_repo.py` covering all new tables.
- Extend `user_profile` with `training_status`, `sex`, `date_of_birth`, `max_hr`, `zone_speeds`, `hormonal_contraception`, `hrv_baseline_mean`, `hrv_baseline_sd`.
- Add output contract: typed `DailyRecommendation` Pydantic model replacing the current freeform dict.

## Capabilities

### New Capabilities

- `signal-computation`: Full signal assembly layer — TRIMP (sex-specific Banister), ATL/CTL/TSB/ACWR/ramp-rate written to `training_load_daily`, HRV z-score baseline (post-rest/easy only), sleep readiness, biomechanics fatigue index, zone speeds, max HR, HR/RPE ratio, cycle phase, pattern fatigue residuals, exercise recency. All signals in §3 of spec.
- `safety-gates`: Hard override layer applied before session selection. Gate 0 (ACWR > 1.8 → mandatory rest), Gate 1 (ACWR > 1.5 → active recovery only), Gate 2 (ACWR > 1.3 → volume cap), injury block, OTS alert. Spec §4.
- `daily-recommendation-engine`: Session selection (sport picker, session type, intensity zone, duration), typed `DailyRecommendation` output contract with disclaimer, degradation/cold-start rules. Spec §5–§11.
- `strength-csp-solver`: CSP-based exercise selection using pattern fatigue residuals, 1RM cache (Epley), CNS budget, freshness gating, exercise relationship graph, `exercise_session_log` write. Spec §7.
- `running-prescription`: Zone-speed-calibrated pace prescription, terrain-aware, GAP-adjusted. Spec §8.
- `competition-calendar`: `competitions` table, days-to-competition signal, priority (A/B/C) modulation of taper trigger. Spec §2, §5.
- `training-plan-generator`: Race-anchored and open-ended periodization (Base/Build/Peak/Taper), plan catalog tables, weekly template engine, strength phase scheduling. Spec §14–§16.
- `injury-management`: Injury state machine (active → cross_training → return_to_run → cleared), activity blocking, return-to-run volume ramp protocol. Spec §15.
- `female-athlete-protocol`: Cycle phase estimation from `menstrual_cycles`, intensity modifiers, ACL-awareness flag (non-blocking). Spec §6.
- `background-jobs`: Async jobs for load precomputation, zone speed calibration, max HR update, HRV baseline establishment, 1RM cache invalidation. Spec §12.

### Modified Capabilities

- `recommendation`: Existing `intelligence/recommend.py` signal integration and output replaced by the new engine. The function signature, internal logic, and output shape all change. **BREAKING** at the service/API boundary; `recommendation_service.py` and `dashboard_service.py` must be updated to use the new typed output.

## Impact

- **Schema**: 14 new tables, 3 altered tables, new columns on `workouts` and `user_profile` — delivered as sequential Flyway migrations `V003` through `V010` (approximate).
- **Intelligence layer**: `intelligence/recommend.py`, `intelligence/training_load.py`, `intelligence/recovery.py` all modified; new modules `intelligence/signal_assembly.py`, `intelligence/safety_gates.py`, `intelligence/strength_solver.py`, `intelligence/plan_generator.py`, `intelligence/background_jobs.py`.
- **Repos**: new `repos/recommendation_repo.py`; `repos/workout_repo.py` and `repos/strength_repo.py` extended.
- **Services**: `services/intelligence/recommendation_service.py`, `services/dashboard_service.py` updated to the new output contract.
- **Ingestion**: `ingestion/workout.py` extended to compute and persist `trimp`, `terrain_type`, `fatigue_index`, `hr_stability_last_10min` post-sync.
- **API**: `api/v1/training.py` — new endpoints for competitions and training plans; `models/dashboard.py` updated for `DailyRecommendation` schema.
- **Dependencies**: no new Python packages required (numpy/scipy already available for math; existing SQLAlchemy for new tables).