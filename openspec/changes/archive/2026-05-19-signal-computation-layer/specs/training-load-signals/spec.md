# training-load-signals

## ADDED Requirements

### Requirement: TRIMP computed and stored per workout post-sync
The system SHALL compute `compute_trimp()` using Banister's sex-specific formula for every workout ingested via Garmin sync that has `avg_hr`, `duration_min`, and `user_profile.max_hr` available. The result SHALL be written to `workouts.trimp`. When `avg_hr` or `max_hr` is `NULL`, `workouts.trimp` SHALL remain `NULL` and the workout SHALL be excluded from load metric computation.

#### Scenario: Workout with complete HR data
- **WHEN** a Garmin workout is synced with `avg_hr = 155`, `duration_min = 60`, `resting_hr = 45`, `max_hr = 190`, `sex = 'male'`
- **THEN** `workouts.trimp` is written as a non-NULL positive float computed via `duration_min × HRr × 0.64 × exp(1.92 × HRr)` where `HRr = (155 − 45) / (190 − 45)` clamped to `[0, 1]`

#### Scenario: Workout missing avg_hr
- **WHEN** a Garmin workout is synced with `avg_hr = NULL`
- **THEN** `workouts.trimp` is `NULL` and no error is raised

#### Scenario: Female athlete TRIMP coefficients
- **WHEN** `user_profile.sex = 'female'` and a workout has complete HR data
- **THEN** `workouts.trimp` uses coefficients `k = 0.86`, `y = 1.67` (not the male defaults `0.64` / `1.92`)

#### Scenario: HRr clamped to valid range
- **WHEN** `avg_hr` exceeds `max_hr` (sensor noise / calibration issue)
- **THEN** `HRr` is clamped to `1.0` and TRIMP is still written without error

### Requirement: training_load_daily upserted after every successful sync
The system SHALL compute ATL, CTL, TSB, ACWR, and ramp_rate using `compute_load_metrics()` over the last 90 days of `workouts.trimp` values and upsert a row for today's date in `training_load_daily` after every successful `POST /api/v1/sync/garmin`. The prior row for the same `(user_id, load_date)` SHALL be overwritten on re-sync.

#### Scenario: Successful sync writes load metrics
- **WHEN** `POST /api/v1/sync/garmin` completes without error
- **THEN** a row exists in `training_load_daily` for `(user_id, today)` with non-NULL `atl`, `ctl`, `tsb`

#### Scenario: Failed sync does not overwrite prior row
- **WHEN** sync fails mid-pipeline (e.g., Garmin API error) before `upsert_training_load_daily()` is called
- **THEN** the existing `training_load_daily` row for today is unchanged

#### Scenario: Re-sync on same day updates the row
- **WHEN** a user syncs twice in the same day
- **THEN** `training_load_daily` has exactly one row for `(user_id, today)` and `computed_at` reflects the second sync time

### Requirement: ACWR and ramp_rate nullability rules enforced
`acwr` SHALL be `NULL` when `ctl < 1.0`. `ramp_rate` SHALL be `NULL` when fewer than 14 days of TRIMP data exist. Both fields SHALL be `NULL` when the series has fewer than 3 non-NULL TRIMP sessions (ATL/CTL/TSB are written as `0.0` in this case).

#### Scenario: Insufficient data cold-start
- **WHEN** a user has fewer than 3 workouts with non-NULL TRIMP
- **THEN** `training_load_daily` row has `atl = 0.0`, `ctl = 0.0`, `tsb = 0.0`, `acwr = NULL`, `ramp_rate = NULL`

#### Scenario: CTL below threshold suppresses ACWR
- **WHEN** `ctl < 1.0` (athlete barely training)
- **THEN** `acwr = NULL` (not written as `0.0` or `infinity`)

#### Scenario: Short history suppresses ramp_rate
- **WHEN** fewer than 14 days of TRIMP history exist
- **THEN** `ramp_rate = NULL`

### Requirement: Dashboard reads ATL/CTL/TSB from training_load_daily
The dashboard endpoint SHALL read ATL, CTL, TSB, ACWR, and ramp_rate from `training_load_daily` for today's date rather than recomputing them from raw workouts. If no row exists for today, the most recent row within the past 7 days SHALL be used. If no row exists within 7 days, all load values SHALL be returned as `None`.

#### Scenario: Row exists for today
- **WHEN** dashboard is loaded and `training_load_daily` has a row for `(user_id, today)`
- **THEN** the response uses those pre-computed values without running `compute_load_metrics()`

#### Scenario: No row within 7 days
- **WHEN** `training_load_daily` has no row within the past 7 days for the user
- **THEN** dashboard load metrics are all `None` (not an error, just no data)