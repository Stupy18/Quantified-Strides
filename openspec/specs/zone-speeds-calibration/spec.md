# zone-speeds-calibration

## ADDED Requirements

### Requirement: zone_speeds updated from qualifying runs when ≥ 5 are available
The system SHALL compute `user_profile.zone_speeds` from running workouts where `workouts.hr_stability_last_10min < 0.05` (HR-stable final 10 min). Pace ranges per HR zone SHALL be derived by matching the speed data from those qualifying runs' final 10 min windows against the athlete's HR zones. The result SHALL be written to `user_profile.zone_speeds` as a JSONB structure keyed by terrain type, then zone. When fewer than 5 qualifying runs exist since the last calibration, `user_profile.zone_speeds` SHALL NOT be updated.

#### Scenario: Sufficient qualifying runs available
- **WHEN** a user has ≥ 5 running workouts where `hr_stability_last_10min < 0.05` and `terrain_type` is non-NULL
- **THEN** `user_profile.zone_speeds` is updated with pace ranges keyed by terrain type and HR zone

#### Scenario: Insufficient qualifying runs
- **WHEN** fewer than 5 qualifying runs exist since the last calibration date
- **THEN** `user_profile.zone_speeds` is not modified

#### Scenario: Zone omitted when insufficient data
- **WHEN** fewer than 5 qualifying runs contribute data to a specific HR zone
- **THEN** that zone key is omitted from the `zone_speeds` JSONB (not written as null)

### Requirement: Zone speeds calibration does not run mid-sync
Zone speed calibration SHALL be triggered as a background task after sync completes, not inline during the sync pipeline. It SHALL NOT block the sync response or cause sync to fail if calibration encounters an error.

#### Scenario: Calibration error does not fail sync
- **WHEN** `compute_zone_speeds()` raises an exception
- **THEN** sync returns success (200) and the error is logged; `zone_speeds` retains its previous value