# biomechanics-signals

## ADDED Requirements

### Requirement: hr_stability_last_10min computed post-sync for running workouts
For every running workout synced via Garmin, the system SHALL extract `workout_metrics.heart_rate` values from the final 10 minutes of the session and compute the coefficient of variation (CV = stdev / mean). The result SHALL be written to `workouts.hr_stability_last_10min`. When fewer than 10 HR readings exist in the final 10 minutes, `workouts.hr_stability_last_10min` SHALL be `NULL`.

#### Scenario: Stable final 10 minutes
- **WHEN** a running workout has ≥ 10 HR readings in its last 10 min and CV < 0.05
- **THEN** `workouts.hr_stability_last_10min` is written as the computed CV value (< 0.05)

#### Scenario: Unstable HR in final 10 minutes
- **WHEN** a running workout has ≥ 10 HR readings with high variance (CV ≥ 0.05)
- **THEN** `workouts.hr_stability_last_10min` is still written (the raw CV value), not NULL

#### Scenario: Insufficient HR readings in final 10 minutes
- **WHEN** fewer than 10 `workout_metrics.heart_rate` readings exist in the final 10 min window
- **THEN** `workouts.hr_stability_last_10min` is `NULL` and no error is raised

#### Scenario: Non-running workout
- **WHEN** a synced workout has `sport` not equal to a running sport type
- **THEN** `workouts.hr_stability_last_10min` is `NULL` (computation not attempted)

### Requirement: Biomechanics fatigue index computed post-sync when baseline exists
For every running workout synced via Garmin that has `workout_metrics` data, the system SHALL compute `workouts.fatigue_index` as a weighted deviation of cadence (50%), ground contact time (30%), and vertical ratio (20%) from the `biomechanics_baselines` row matching the workout's `terrain_type`. When no matching `biomechanics_baselines` row exists for the terrain type, `workouts.fatigue_index` SHALL be `NULL` and no error SHALL be raised.

#### Scenario: Baseline exists for terrain type
- **WHEN** a running workout has `terrain_type = 'road'` and `biomechanics_baselines` has a row for `(user_id, 'road')`
- **THEN** `workouts.fatigue_index` is written as a non-NULL float representing the weighted deviation

#### Scenario: No baseline for terrain type
- **WHEN** a running workout has `terrain_type = 'trail'` and no `biomechanics_baselines` row exists for trail
- **THEN** `workouts.fatigue_index` is `NULL` and no error is raised

#### Scenario: Missing workout_metrics data
- **WHEN** a running workout has no rows in `workout_metrics`
- **THEN** `workouts.fatigue_index` is `NULL`

### Requirement: terrain_type classification written post-sync
The system SHALL classify each running workout's terrain as `'road'` or `'trail'` based on `workout_metrics.gradient_pct` values and write the result to `workouts.terrain_type`. When fewer than 10 gradient readings are available, `workouts.terrain_type` SHALL be `NULL`.

#### Scenario: Sufficient gradient data available
- **WHEN** a running workout has ≥ 10 `workout_metrics.gradient_pct` readings
- **THEN** `workouts.terrain_type` is written as either `'road'` or `'trail'`

#### Scenario: Insufficient gradient readings
- **WHEN** fewer than 10 gradient readings exist for the workout
- **THEN** `workouts.terrain_type` is `NULL`