## ADDED Requirements

### Requirement: Zone-speed-calibrated pace prescription
The system SHALL generate running prescriptions using `user_profile.zone_speeds` to express target pace ranges per HR zone. Prescription is returned as `RunningPrescription` with fields: `target_zone`, `pace_range` (e.g., "5:45–6:30 /km"), `duration_min`, `terrain`, `gap_adjusted` (bool).

#### Scenario: Zone speeds calibrated for target zone
- **WHEN** `user_profile.zone_speeds` contains a pace range for the recommended intensity zone and terrain
- **THEN** `RunningPrescription.pace_range` is populated with the calibrated range

#### Scenario: Zone speeds not yet calibrated
- **WHEN** `user_profile.zone_speeds` is empty or missing the target zone
- **THEN** `RunningPrescription.pace_range` is `None` and narrative notes to run by HR feel instead

### Requirement: Terrain-aware prescription
The system SHALL select prescription terrain (`road` or `trail`) based on weather, injury flags, and training phase. Road is the default when outdoor conditions are poor or a lower-limb injury is active with `cross_training_ok = TRUE`.

#### Scenario: Active ankle injury, cross-training permitted
- **WHEN** an injury affects running with `cross_training_ok = TRUE` and `affected_activities` does not include cycling
- **THEN** terrain is not road running; recommendation redirects to cycling alternative

#### Scenario: Clear weather, no injury
- **WHEN** weather API reports no precipitation and no active injury blocks running
- **THEN** terrain prescription matches the training phase default (road in base, trail in build)

### Requirement: Grade-adjusted pace (GAP) application
The system SHALL flag prescriptions as `gap_adjusted = TRUE` when the session terrain is `trail` and `biomechanics_baselines` has a row for `trail`. GAP prescription uses grade-adjusted speed from `workout_metrics.grade_adjusted_pace` to derive equivalent flat effort.

#### Scenario: Trail session with baseline
- **WHEN** session terrain is `trail` and a trail biomechanics baseline exists
- **THEN** `gap_adjusted = TRUE` and pace range is expressed in GAP terms

#### Scenario: Trail session without baseline
- **WHEN** session terrain is `trail` but no trail baseline exists
- **THEN** `gap_adjusted = FALSE`; prescription uses flat road pace ranges as approximation

### Requirement: HR/RPE status cross-check
The system SHALL compute `hr_rpe_status` from the ratio of observed HR to session RPE across the last 10 same-sport sessions. Status of `'decoupled'` (HR rising relative to RPE trend) triggers a note in the prescription advising aerobic base work before intensity.

#### Scenario: HR/RPE decoupling detected
- **WHEN** `hr_rpe_status = 'decoupled'` for running
- **THEN** `RunningPrescription.notes` includes an advisory to prioritize Zone 2 and defer threshold sessions

#### Scenario: Insufficient data for HR/RPE
- **WHEN** fewer than 10 same-sport sessions with both HR and RPE data exist
- **THEN** `hr_rpe_status = None` and no advisory is added