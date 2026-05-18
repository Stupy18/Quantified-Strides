## ADDED Requirements

### Requirement: TRIMP computation
The system SHALL compute session TRIMP using Banister's sex-specific exponential formula: `duration_min × HRr × k × exp(y × HRr)`, where `k=0.86, y=1.67` for female and `k=0.64, y=1.92` for male/prefer_not_to_say. HRr is clamped to [0, 1]. Result is stored in `workouts.trimp`. Returns `None` when `avg_hr` or `max_hr` is unavailable.

#### Scenario: Valid HR data present
- **WHEN** a workout has `avg_hr`, `resting_hr` (7-day median of `sleep_sessions.min_hr`), and `user_profile.max_hr`
- **THEN** `workouts.trimp` is set to the computed value and is non-null

#### Scenario: Missing HR data
- **WHEN** a workout has no `avg_hr`
- **THEN** `workouts.trimp` is set to `NULL` and the session is excluded from ATL/CTL computation

### Requirement: ATL / CTL / TSB / ACWR / ramp_rate precomputation
The system SHALL compute exponentially weighted training load metrics after each Garmin sync and write one row per user per day to `training_load_daily`. TAU_ATL=7, TAU_CTL=42 (HEURISTIC). ACWR is `NULL` when CTL < 1. Ramp rate is `NULL` when fewer than 14 days of data exist.

#### Scenario: Post-sync computation
- **WHEN** a Garmin sync completes successfully
- **THEN** `training_load_daily` is upserted for today with current ATL, CTL, TSB, ACWR, and ramp_rate

#### Scenario: Insufficient data
- **WHEN** fewer than 3 sessions exist in the TRIMP series
- **THEN** ATL, CTL, and TSB are written as 0.0 and ACWR is `NULL`

### Requirement: HRV baseline and z-score status
The system SHALL maintain a per-athlete HRV baseline computed only from clean readings (preceding day TRIMP is `NULL` or ≤ 50). Baseline (mean, sd) is stored in `user_profile.hrv_baseline_mean` and `hrv_baseline_sd`. `compute_hrv_status()` returns one of: `'suppressed'` (z < −1.5), `'normal'`, `'elevated'` (z > +1.0), or `'no_data'` (< 14 clean readings).

#### Scenario: Baseline available, suppressed reading
- **WHEN** today's overnight HRV z-score is below −1.5 against the stored baseline
- **THEN** `compute_hrv_status()` returns `'suppressed'`

#### Scenario: Fewer than 14 clean readings
- **WHEN** `user_profile.hrv_baseline_mean` is `NULL`
- **THEN** `compute_hrv_status()` returns `'no_data'` and HRV-based safety gates are skipped

### Requirement: Sleep readiness signal
The system SHALL compute `sleep_readiness` in-memory at request time from the most recent `sleep_sessions` row. Returns `None` when no sleep record exists for today or yesterday.

#### Scenario: Sleep data present
- **WHEN** a `sleep_sessions` row exists for today or yesterday
- **THEN** `sleep_readiness` is a float in [0, 1] derived from sleep score, duration, and HRV

#### Scenario: No recent sleep data
- **WHEN** no `sleep_sessions` row exists within the past 2 days
- **THEN** `sleep_readiness` is `None` and the engine proceeds without this signal

### Requirement: Biomechanics fatigue index
The system SHALL compute `fatigue_index` post-sync from `workout_metrics` using weighted deviation of cadence (50%), ground contact time (30%), and vertical ratio (20%) from the athlete's `biomechanics_baselines`. Stored in `workouts.fatigue_index`. Returns `None` when no baseline exists for the session's terrain type.

#### Scenario: Baseline exists for terrain
- **WHEN** a run completes and `biomechanics_baselines` has a row for the matching `terrain_type`
- **THEN** `workouts.fatigue_index` is set to the weighted composite deviation

#### Scenario: No terrain baseline
- **WHEN** `biomechanics_baselines` has no row for the session's `terrain_type`
- **THEN** `workouts.fatigue_index` is `NULL`

### Requirement: Zone speeds calibration
The system SHALL compute per-athlete pace ranges per HR zone from qualifying runs (HR-stable last 10 min, CV < 0.05) and store in `user_profile.zone_speeds` as JSONB. Returns `NULL` per zone when fewer than 5 qualifying runs exist for that zone.

#### Scenario: Sufficient qualifying runs
- **WHEN** at least 5 HR-stable runs exist for a given zone
- **THEN** `user_profile.zone_speeds` is updated with pace ranges for that zone

#### Scenario: Insufficient data for a zone
- **WHEN** fewer than 5 qualifying runs exist for a zone
- **THEN** that zone's entry in `user_profile.zone_speeds` is omitted (null for that zone)

### Requirement: Pattern fatigue residuals
The system SHALL compute per-pattern fatigue residuals in-memory at request time from `pattern_fatigue_ledger` using exponential decay with per-pattern `fatigue_decay_tau_h`. When fewer than 5 ledger entries exist for a pattern, the system SHALL approximate residual from `muscle_freshness` mapped through `SLUG_REGION`.

#### Scenario: Ledger entries present
- **WHEN** `pattern_fatigue_ledger` has ≥ 5 rows for a given pattern
- **THEN** residual is computed via exponential decay from ledger data

#### Scenario: Cold start
- **WHEN** `pattern_fatigue_ledger` has < 5 rows for a pattern
- **THEN** residual is approximated as `(1 − mean(freshness[primary_muscles])) × 3.0`