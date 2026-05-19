# hrv-signal

## ADDED Requirements

### Requirement: HRV baseline accumulated from clean-day readings only
The system SHALL compute the per-athlete HRV baseline using only overnight HRV readings where the preceding day's `workouts.trimp` was `NULL` (rest day) or ≤ 50 (easy Z2, ≈ 60–70 min). The baseline SHALL be stored as `user_profile.hrv_baseline_mean` and `user_profile.hrv_baseline_sd`. The baseline SHALL remain `NULL` until at least 14 qualifying clean readings are available. The baseline SHALL be recomputed and stored each time a sync runs after TRIMP values are written.

#### Scenario: Sufficient clean readings available
- **WHEN** a user has ≥ 14 HRV readings from nights following rest or easy-Z2 days
- **THEN** `user_profile.hrv_baseline_mean` and `hrv_baseline_sd` are non-NULL after the next sync

#### Scenario: Insufficient clean readings
- **WHEN** a user has fewer than 14 qualifying clean readings
- **THEN** `user_profile.hrv_baseline_mean` is `NULL` and no update is written

#### Scenario: Post-hard-session readings excluded
- **WHEN** an overnight HRV reading follows a day with TRIMP > 50
- **THEN** that reading is NOT included in the baseline calculation

#### Scenario: Standard deviation too low to be meaningful
- **WHEN** the computed SD of clean readings is < 0.5 ms
- **THEN** `establish_hrv_baseline()` returns `None` and the stored baseline is not updated

### Requirement: compute_hrv_status() uses stored per-athlete baseline
`compute_hrv_status()` SHALL accept the most recent overnight HRV readings, `user_profile.hrv_baseline_mean`, and `user_profile.hrv_baseline_sd`, and return a dict with `status`, `z`, and `consecutive_suppressed`. It SHALL NOT recompute the baseline from raw HRV history at request time.

#### Scenario: Normal HRV
- **WHEN** `hrv_series[-1]` produces a z-score between −1.0 and +1.0 against the stored baseline
- **THEN** `status = 'normal'`

#### Scenario: Elevated HRV
- **WHEN** z-score > +1.0
- **THEN** `status = 'elevated'`

#### Scenario: Suppressed HRV
- **WHEN** z-score ≤ −1.0 and > −1.5
- **THEN** `status = 'suppressed'`

#### Scenario: Very suppressed HRV
- **WHEN** z-score ≤ −1.5
- **THEN** `status = 'very_suppressed'`

#### Scenario: No baseline established
- **WHEN** `user_profile.hrv_baseline_mean` is `NULL` or `user_profile.hrv_baseline_sd < 0.5`
- **THEN** `compute_hrv_status()` returns `{'status': 'no_data', 'z': None, 'consecutive_suppressed': 0}`

#### Scenario: Insufficient recent HRV readings
- **WHEN** fewer than 2 overnight HRV readings are available
- **THEN** `compute_hrv_status()` returns `{'status': 'no_data', 'z': None, 'consecutive_suppressed': 0}`

### Requirement: Consecutive suppressed count reflects preceding nights
`compute_hrv_status()` SHALL populate `consecutive_suppressed` with the count of immediately preceding nights (before the most recent reading) where `z < −1.0`, counting backwards until the first non-suppressed reading.

#### Scenario: Two consecutive suppressed nights preceding today
- **WHEN** the two nights before today both had z < −1.0, and the night before those did not
- **THEN** `consecutive_suppressed = 2`

#### Scenario: No preceding suppression
- **WHEN** yesterday's HRV was not suppressed
- **THEN** `consecutive_suppressed = 0` regardless of today's z-score