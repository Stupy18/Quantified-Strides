# signal-assembly

## ADDED Requirements

### Requirement: assemble_signals() returns complete signal dict with all registry keys
`intelligence/signal_assembly.py` SHALL expose `assemble_signals(user_id, today, repos...)` which calls all signal computation functions and returns a dict containing every key defined in §3.1 of `RECOMMENDATION_PROTOCOL.md`. No key SHALL be omitted. When a signal cannot be computed (missing data, cold-start), its value SHALL be `None` — not absent from the dict.

#### Scenario: Full data available
- **WHEN** a user has complete training history, HRV baseline, sleep data, and strength logs
- **THEN** `assemble_signals()` returns a dict where every §3.1 key is present and non-None (or None only for correctly null signals like `cycle_phase` for a male user)

#### Scenario: Cold-start user
- **WHEN** a user has just registered with no workout history
- **THEN** `assemble_signals()` returns a dict with every key present; load signals are `0.0` or `None`, HRV is `None`, muscle freshness is all-1.0, pattern residuals are all-0.0

#### Scenario: No key omitted even when computation fails
- **WHEN** one signal's computation raises an internal exception (e.g., `biomechanics_baselines` query fails)
- **THEN** that signal's key is present with value `None` and the remaining signals are computed normally; the exception is logged but does not propagate

### Requirement: assemble_signals() is the single entry point for signal collection
No code outside `intelligence/signal_assembly.py` SHALL directly call individual signal computation functions (`compute_hrv_status`, `compute_load_metrics`, `compute_pattern_fatigue_residuals`, `compute_fatigue_index`, `compute_sleep_readiness`, `muscle_freshness_map`) for the purpose of building the signals dict passed to `build_recommendation()`. These functions remain importable for unit testing.

#### Scenario: Dashboard service uses assemble_signals
- **WHEN** `dashboard_service.py` needs load signals (ATL/CTL/TSB)
- **THEN** it calls `assemble_signals()` and reads from the returned dict; it does NOT directly query `training_load_daily` or call `compute_load_metrics()`

### Requirement: assemble_signals() reads ATL/CTL/TSB from training_load_daily
`assemble_signals()` SHALL fetch today's (or most recent) row from `training_load_daily` for load signals rather than recomputing from raw TRIMP. It SHALL use the `recommendation_repo.get_training_load_daily()` method.

#### Scenario: Reads from precomputed table
- **WHEN** `training_load_daily` has a row for today
- **THEN** `assemble_signals()` returns `atl`, `ctl`, `tsb`, `acwr`, `ramp_rate` from that row without invoking `compute_load_metrics()`

#### Scenario: Falls back to None when no recent row
- **WHEN** `training_load_daily` has no row within 7 days
- **THEN** load signal keys (`atl`, `ctl`, `tsb`, `acwr`, `ramp_rate`) are `None` in the returned dict

### Requirement: assemble_signals() accepts injected repo instances
`assemble_signals()` SHALL accept repo instances as parameters (not create them internally) so it can be unit-tested with mock repos. The function signature SHALL follow the existing pattern of injected dependencies used throughout the services layer.

#### Scenario: Testable with mock repos
- **WHEN** unit tests pass mock `WorkoutRepo`, `SleepRepo`, `RecommendationRepo`, and `UserProfileRepo` instances
- **THEN** `assemble_signals()` uses those mocks rather than hitting the database, enabling isolated signal computation tests