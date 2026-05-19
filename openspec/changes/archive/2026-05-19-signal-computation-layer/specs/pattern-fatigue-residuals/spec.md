# pattern-fatigue-residuals

## ADDED Requirements

### Requirement: Pattern fatigue residuals computed in-memory from ledger at request time
The system SHALL compute `pattern_fatigue_residuals` at request time by reading `pattern_fatigue_ledger` rows for the user from the past 7 days and applying exponential decay: `residual = fatigue_units × exp(−elapsed_hours / fatigue_decay_tau_h)` where `fatigue_decay_tau_h` comes from the matching `movement_patterns` row. The result SHALL be a dict mapping `pattern_key → residual_float` for all 9 patterns. All patterns SHALL be present in the returned dict — patterns with no ledger rows SHALL have `residual = 0.0`.

#### Scenario: Active patterns with recent ledger entries
- **WHEN** `pattern_fatigue_ledger` has rows for `'HIP_HINGE'` from 24 hours ago with `fatigue_units = 10.0`
- **THEN** the residual for `'HIP_HINGE'` is `10.0 × exp(−24 / 60.0)` (approximately 6.7), not 0.0

#### Scenario: No ledger rows in past 7 days
- **WHEN** `pattern_fatigue_ledger` has no rows for a user within the past 7 days
- **THEN** `pattern_fatigue_residuals` returns `{pattern_key: 0.0 for all 9 patterns}` (solver still runs normally)

#### Scenario: All 9 patterns present in return dict
- **WHEN** `compute_pattern_fatigue_residuals()` is called regardless of ledger state
- **THEN** the returned dict contains all 9 `pattern_key` values from `movement_patterns`

### Requirement: Cold-start approximation used when ledger has < 5 entries per pattern
When `pattern_fatigue_ledger` has fewer than 5 session entries for a given pattern key, the system SHALL compute the residual approximation as `(1 − mean(freshness[primary_muscles])) × 3.0` using the current `muscle_freshness_map`. Once the pattern has ≥ 5 ledger entries, the ledger-based exponential decay SHALL be used exclusively.

#### Scenario: Cold-start pattern with active muscle fatigue
- **WHEN** pattern `'KNEE_DOMINANT'` has 3 ledger entries and the primary muscles (quads, glutes) have freshness scores of 0.4 and 0.5
- **THEN** residual approximation = `(1 − mean([0.4, 0.5])) × 3.0 = (1 − 0.45) × 3.0 = 1.65`

#### Scenario: Threshold crossed — ledger-based decay takes over
- **WHEN** a pattern accumulates its 5th ledger entry
- **THEN** subsequent residual computation uses exponential decay from ledger data, not the muscle-freshness approximation

#### Scenario: Cold-start pattern with fully fresh muscles
- **WHEN** pattern has < 5 ledger entries and primary muscles all have freshness = 1.0
- **THEN** residual approximation = `(1 − 1.0) × 3.0 = 0.0`

### Requirement: pattern_fatigue_ledger updated after each strength session
The system SHALL write a row to `pattern_fatigue_ledger` after each strength session, one row per pattern that was engaged. `fatigue_units` SHALL be the sum of `(cns_cost + local_fatigue_cost)` across all sets in that session that belong to the pattern. If a pattern already has a row for `(user_id, pattern_key, session_date)`, the row SHALL be upserted (summed, not duplicated).

#### Scenario: Single-pattern session
- **WHEN** a strength session contains only hip-hinge exercises (deadlifts, RDLs)
- **THEN** `pattern_fatigue_ledger` gets one new row for `'HIP_HINGE'` with `fatigue_units` summed across all sets

#### Scenario: Multi-pattern session upsert
- **WHEN** a session has both horizontal push and vertical pull exercises and a prior partial `pattern_fatigue_ledger` row exists for the same `session_date`
- **THEN** the existing row is updated with the summed fatigue units, not a second row inserted