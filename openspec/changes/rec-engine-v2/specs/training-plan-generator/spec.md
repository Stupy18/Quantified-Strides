## ADDED Requirements

### Requirement: Plan creation from catalog
The system SHALL create training plans by combining a `plan_types` entry, a `plan_goal_tiers` tier, and `plan_type_phases` phase fractions. One active plan per user (enforced by partial unique index on `training_plans`). `plan_mode` is `'race_anchored'` when a competition is linked, `'open_ended'` otherwise.

#### Scenario: Race-anchored plan creation
- **WHEN** a user creates a plan with a linked `competition_id`
- **THEN** `training_plans.race_date` is set to the competition's `event_date`, `plan_mode = 'race_anchored'`, and `training_plan_weeks` rows are generated from `plan_start_date` to `race_date`

#### Scenario: Open-ended plan creation
- **WHEN** a user creates a plan with no `competition_id`
- **THEN** `plan_mode = 'open_ended'`; plan rolls Base→Build mesocycles with no Peak/Taper; extends indefinitely until user abandons or a competition is linked

### Requirement: Weekly template engine
The system SHALL populate `training_plan_weeks` from `plan_session_templates` given `(plan_type_key, tier, phase, quality_count, week_parity, day_of_week)`. Strength sessions are assigned per `plan_type_phases.strength_phase_key` and scheduled on non-quality-run days.

#### Scenario: Week generation for marathon base phase
- **WHEN** an active marathon plan enters the Base phase
- **THEN** `training_plan_weeks` rows are created with `easy_pct ≥ 0.80`, `quality_sessions = 1`, `strength_phase_key = 'gpp'`

#### Scenario: Cutback week insertion
- **WHEN** `mesocycle_weeks = 4` and the current week is week 4 of the mesocycle
- **THEN** the week is marked `cutback_week = TRUE` with volume reduced by 30% from peak week

### Requirement: Goal tier determination
The system SHALL assign a plan tier based on the user's target finishing time against `plan_goal_tiers.max_time_min`. When no target time is provided, the catchall tier (NULL max_time_min row) is used.

#### Scenario: User provides target time
- **WHEN** a user creates a marathon plan with `target_time_min = 210` (3:30)
- **THEN** system selects the matching tier from `plan_goal_tiers` where `max_time_min` brackets 210

#### Scenario: No target time (finish goal)
- **WHEN** `target_time_min` is `None`
- **THEN** the catchall tier (NULL `max_time_min`) is selected

### Requirement: Plan phase progression
The system SHALL advance the plan through phases (Base → Build → Peak → Taper for race-anchored) on the schedule defined by `plan_type_phases.phase_fraction`. The current phase is determined from `week_start_date` relative to `plan_start_date` and `race_date`.

#### Scenario: Correct phase at mid-plan
- **WHEN** a 16-week marathon plan is in week 9 and Base fraction is 0.5 (8 weeks)
- **THEN** `training_plan_weeks.phase = 'build'` for week 9

### Requirement: Strength goal integration
The system SHALL read `training_plans.strength_goal` to modulate the CSP solver's CNS budget and exercise pattern priorities. `strength_goal = 'sport_support'` minimizes CNS interference with endurance sessions.

#### Scenario: sport_support strength goal
- **WHEN** `training_plans.strength_goal = 'sport_support'`
- **THEN** CNS budget is at minimum; solver prioritizes `CARRY_BRACE` and `ISOLATION` patterns over `POWER_FULL_BODY`

#### Scenario: combination goal with weights
- **WHEN** `training_plans.strength_goal = 'combination'` and `goal_weights = {"strength": 0.4, "hypertrophy": 0.3, "sport_support": 0.3}`
- **THEN** solver weights pattern and rep range selection proportionally across the three sub-goals