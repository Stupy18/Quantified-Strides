## ADDED Requirements

### Requirement: Post-sync training load precomputation
The system SHALL compute and upsert `training_load_daily` for the syncing user immediately after a successful Garmin sync. This includes ATL, CTL, TSB, ACWR, and ramp_rate.

#### Scenario: Sync completes successfully
- **WHEN** `POST /api/v1/sync/garmin` returns success
- **THEN** `training_load_daily` has a row for today with current load metrics for that user

#### Scenario: Sync fails mid-pipeline
- **WHEN** Garmin sync raises an exception before completion
- **THEN** `training_load_daily` is not updated; the prior row (if any) remains intact

### Requirement: Post-sync TRIMP and biomechanics computation
The system SHALL compute `workouts.trimp`, `workouts.terrain_type`, `workouts.fatigue_index`, and `workouts.hr_stability_last_10min` for each newly ingested workout immediately after sync, before `training_load_daily` is updated.

#### Scenario: New workout with HR data
- **WHEN** a workout is ingested with `avg_hr` and `workout_metrics` rows present
- **THEN** `trimp`, `terrain_type`, `fatigue_index`, and `hr_stability_last_10min` are all computed and written before the sync endpoint returns

#### Scenario: Workout without HR data
- **WHEN** a workout is ingested without `avg_hr`
- **THEN** `trimp = NULL`; other fields are computed if data is available; load metrics use NULL trimp (session excluded)

### Requirement: Monthly zone speed calibration
The system SHALL run `compute_zone_speeds()` on a monthly schedule for each user who has new qualifying runs since the last calibration. Result is upserted to `user_profile.zone_speeds`.

#### Scenario: Monthly job fires, qualifying runs present
- **WHEN** the monthly scheduler fires and a user has ≥ 5 new HR-stable runs since last calibration
- **THEN** `user_profile.zone_speeds` is updated with recalibrated pace ranges

#### Scenario: Monthly job fires, insufficient new data
- **WHEN** a user has < 5 new qualifying runs
- **THEN** `user_profile.zone_speeds` is not updated; existing calibration is retained

### Requirement: HRV baseline re-establishment
The system SHALL re-run `establish_hrv_baseline()` when a new clean HRV reading is added (post-rest or post-easy session). Baseline is updated only when ≥ 14 clean readings are available.

#### Scenario: 14th clean HRV reading recorded
- **WHEN** a user accumulates their 14th qualifying clean HRV reading
- **THEN** `user_profile.hrv_baseline_mean` and `hrv_baseline_sd` are written for the first time

#### Scenario: Existing baseline, new clean reading
- **WHEN** a new clean HRV reading is added and ≥ 14 clean readings already exist
- **THEN** baseline is recalculated and `user_profile.hrv_baseline_mean / hrv_baseline_sd` are updated

### Requirement: 1RM cache invalidation
The system SHALL invalidate and recompute `user_1rm_cache` for an exercise whenever a new `strength_sets` row is inserted for that exercise with reps ≤ 10.

#### Scenario: New set recorded
- **WHEN** a `strength_sets` row is inserted with `reps ≤ 10`
- **THEN** `user_1rm_cache` for `(user_id, exercise_id)` is deleted and reinserted with the Epley-computed value

#### Scenario: High-rep set (reps > 10)
- **WHEN** a `strength_sets` row is inserted with `reps > 10`
- **THEN** `user_1rm_cache` is not modified (Epley is unreliable above 10 reps)
