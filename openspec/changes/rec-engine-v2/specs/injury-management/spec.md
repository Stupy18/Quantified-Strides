## ADDED Requirements

### Requirement: Injury state machine
The system SHALL track injury state via `training_plans.training_state` cycling through: `'active'` → `'injured'` (on injury log) → `'cross_training'` (when `cross_training_ok = TRUE`) → `'return_to_run'` (when `cleared_by_user = TRUE`) → `'active'`. State transitions are triggered by injury creation and user clearance events.

#### Scenario: Injury logged while plan is active
- **WHEN** a new `injuries` row is inserted with severity and `affected_activities`
- **THEN** `training_plans.training_state` transitions to `'injured'` for that user

#### Scenario: User clears injury
- **WHEN** `injuries.cleared_by_user` is set to `TRUE`
- **THEN** `training_plans.training_state` transitions to `'return_to_run'` and `return_volume_pct` is computed

### Requirement: Activity blocking from injury
The system SHALL block all activities in `injuries.affected_activities` from recommendation when `cleared_by_user = FALSE`. The safety gates layer enforces this block before session selection.

#### Scenario: Running blocked by ankle injury
- **WHEN** `injuries.affected_activities = ARRAY['running']` and `cleared_by_user = FALSE`
- **THEN** no running session is recommended; error message in alerts explains the block

#### Scenario: Injury logged but no activities specified
- **WHEN** `injuries.affected_activities` is `NULL`
- **THEN** system infers blocked activities from `injuries.injury_type`; if inference is ambiguous, all high-impact activities are blocked and user is prompted to clarify

### Requirement: Cross-training during injury
The system SHALL recommend approved cross-training activities when `injuries.cross_training_ok = TRUE` and training state is `'injured'` or `'cross_training'`. Recommended cross-training preserves cardiovascular load at reduced mechanical stress.

#### Scenario: Lower limb injury, cross-training approved
- **WHEN** `cross_training_ok = TRUE` and running is blocked
- **THEN** recommendation offers cycling or swimming at equivalent Zone 2 duration; CNS budget for strength is also reduced

#### Scenario: Severe injury, no weight-bearing
- **WHEN** `cross_training_ok = FALSE`
- **THEN** recommendation is rest; no endurance or strength session is offered

### Requirement: Return-to-run volume ramp
The system SHALL apply a graduated volume ramp protocol when `training_state = 'return_to_run'`. Starting volume is `injuries.return_volume_pct` of pre-injury CTL-implied weekly km. Volume increases 10% per week if no symptoms reported (no new injury log entry in the past 7 days).

#### Scenario: First return week
- **WHEN** `training_state` transitions to `'return_to_run'`
- **THEN** recommended running volume is `return_volume_pct × pre_injury_weekly_km`; session type is easy (Zone 1–2 only)

#### Scenario: Symptom-free second week
- **WHEN** no new `injuries` row in past 7 days and `training_state = 'return_to_run'`
- **THEN** recommended volume increases by 10% from prior week; session type remains Zone 1–2