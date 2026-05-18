## ADDED Requirements

### Requirement: CSP-based exercise selection
The system SHALL select exercises for strength sessions using a constraint satisfaction solver. Hard constraints: pattern freshness gate (residual > threshold blocks pattern), CNS budget cap per session, equipment availability, injury-blocked movements, skill level ≤ user's training_status tier. Soft constraints: recency diversity, 1RM progression eligibility, goal alignment (strength/hypertrophy/sport_support).

#### Scenario: All constraints satisfiable
- **WHEN** sufficient fresh exercises exist within the CNS budget and equipment constraints
- **THEN** solver returns an ordered exercise list with `selected_by='csp_solver'` and writes to `exercise_session_log`

#### Scenario: No valid solution found
- **WHEN** all exercises in required patterns exceed the CNS budget or are blocked
- **THEN** solver relaxes optional constraints in order and re-solves; if still unsolvable, returns a minimal bodyweight session

### Requirement: Pattern fatigue gate
The system SHALL block exercises whose primary pattern has a current `pattern_fatigue_residual` exceeding the pattern's fatigue threshold. Threshold is pattern-specific based on `movement_patterns.fatigue_decay_tau_h`.

#### Scenario: Pattern freshly loaded
- **WHEN** `pattern_fatigue_residual` for `HIP_HINGE` exceeds threshold (e.g., heavy deadlift day yesterday)
- **THEN** no hip hinge exercises are selected; solver proceeds with available patterns

#### Scenario: All patterns gated
- **WHEN** all movement patterns exceed their fatigue threshold
- **THEN** solver falls back to `ISOLATION` and `CARRY_BRACE` patterns (lowest tau) or returns bodyweight session

### Requirement: CNS budget cap
The system SHALL enforce a per-session CNS budget cap computed from TSB and training goal. Total `cns_cost` of selected exercises SHALL not exceed the budget. `POWER_FULL_BODY` exercises cost more CNS budget than isolation exercises.

#### Scenario: Low TSB, reduced budget
- **WHEN** `tsb < -5`
- **THEN** CNS budget is reduced by 20% from the goal-based baseline, limiting high-CNS exercise selection

#### Scenario: Strength goal, high TSB
- **WHEN** `strength_goal = 'strength'` and `tsb > 10`
- **THEN** CNS budget is at maximum, allowing compound high-load exercises

### Requirement: 1RM cache and progression eligibility
The system SHALL maintain `user_1rm_cache` via Epley formula. Cache is invalidated and recomputed on every new `strength_sets` insert for a given exercise. Exercises are flagged as "progression eligible" when the last 3 sessions show consistent completion at current load.

#### Scenario: New set at higher reps
- **WHEN** a new `strength_sets` row is inserted with reps ≤ 10
- **THEN** `user_1rm_cache` for that exercise is invalidated and recomputed via `epley_1rm(weight, reps)`

#### Scenario: Progression eligible
- **WHEN** the last 3 sessions for an exercise completed all prescribed reps at current load
- **THEN** the exercise is flagged in solver output with a recommended load increment

### Requirement: Exercise session log write
The system SHALL write each selected exercise to `exercise_session_log` after session acceptance, including `slot_index`, `selected_by`, and any `constraint_violations_bypassed` when the user overrides the solver.

#### Scenario: User overrides solver selection
- **WHEN** a user substitutes an exercise not selected by the CSP solver
- **THEN** `exercise_session_log` records `selected_by='user_override'` and populates `constraint_violations_bypassed` with the constraint names that were bypassed

### Requirement: Permanent fixture exercises
Exercises marked `exercises.permanent_fixture = TRUE` SHALL be appended to every session output after the CSP solver result, regardless of freshness or CNS budget.

#### Scenario: Permanent fixture present
- **WHEN** any `exercises` row has `permanent_fixture = TRUE` and is in the user's exercise pool
- **THEN** it appears last in the exercise list in every strength session recommendation