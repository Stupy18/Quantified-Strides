## ADDED Requirements

### Requirement: Typed DailyRecommendation output contract
The system SHALL return a `DailyRecommendation` Pydantic model from `build_recommendation()`. The model SHALL contain: `sport`, `session_type`, `intensity_zone` (int 1–5), `duration_min` (int), `notes` (str), `disclaimer` (str), `alerts` (list[Alert]), `exercise_suggestions` (list[ExerciseSuggestion] | None), `running_prescription` (RunningPrescription | None), `readiness_composite` (float | None), `confidence` (str: 'high'|'medium'|'low'|'no_data').

#### Scenario: Full data available
- **WHEN** all required signals are present and no safety gates fire
- **THEN** `DailyRecommendation` is returned with all fields populated and `confidence='high'`

#### Scenario: Missing signals
- **WHEN** signals dict contains `None` values for multiple keys
- **THEN** `DailyRecommendation` is returned with `confidence='low'` or `'no_data'` per degradation rules

### Requirement: Readiness composite score
The system SHALL compute a composite readiness score in [0, 1] from: HRV z-score (weight 0.4), sleep readiness (0.3), TSB normalized to [-30, +20] range (0.2), and `daily_readiness` subjective score (0.1). Missing signals reduce the effective weight denominator proportionally.

#### Scenario: All signals present
- **WHEN** HRV, sleep, TSB, and `daily_readiness` are all available
- **THEN** `readiness_composite` is a weighted average of all four signals

#### Scenario: HRV missing, others present
- **WHEN** `hrv_status = 'no_data'` but sleep, TSB, and readiness are present
- **THEN** `readiness_composite` is computed from the remaining three signals with weights renormalized to sum to 1.0

### Requirement: Sport selection using priority weights
The system SHALL select the recommended sport using `user_profile.primary_sports` priority weights, modulated by muscle freshness, weather, time available, and active plan session type. Hard rules (e.g., upper gym yesterday → no climbing) are applied before scoring.

#### Scenario: Plan session type overrides
- **WHEN** an active `training_plans` row has a scheduled session type for today
- **THEN** the plan's session type takes precedence over priority-weight scoring, unless a safety gate forces a different outcome

#### Scenario: No active plan
- **WHEN** `training_plans` has no active row for the user
- **THEN** sport is selected via priority-weight scoring modulated by current signals

### Requirement: Session type and intensity zone selection
The system SHALL select session type (from `session_type_catalog`) and intensity zone based on readiness composite, TSB, and training phase. High readiness (> 0.75) and positive TSB (> +5) allow quality sessions. Low readiness (< 0.4) or negative TSB (< −10) constrain to Zone 1–2.

#### Scenario: High readiness, positive TSB
- **WHEN** `readiness_composite > 0.75` and `tsb > 5`
- **THEN** quality session types (threshold, intervals) are eligible for selection

#### Scenario: Suppressed HRV, negative TSB
- **WHEN** `hrv_status = 'suppressed'` and `tsb < -10`
- **THEN** session type is restricted to Zone 1–2 (easy / recovery)

### Requirement: Degradation and cold-start behavior
The system SHALL produce a valid `DailyRecommendation` under any combination of null signals, using the degradation rules defined in spec §10. `confidence` reflects data quality: `'high'` (≥ 4 signals), `'medium'` (2–3 signals), `'low'` (1 signal), `'no_data'` (0 signals).

#### Scenario: New user with no history
- **WHEN** a new user has no workouts, sleep records, or readiness check-ins
- **THEN** recommendation returns a conservative Zone 2 base session with `confidence='no_data'` and `disclaimer` set

#### Scenario: Partial signals available
- **WHEN** only sleep readiness and subjective readiness are available (HRV, TRIMP missing)
- **THEN** recommendation is returned with `confidence='low'` using the available signals only