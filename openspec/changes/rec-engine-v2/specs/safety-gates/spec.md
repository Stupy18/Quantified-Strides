## ADDED Requirements

### Requirement: Gate 0 — critical ACWR mandatory rest
The system SHALL override any recommendation with mandatory rest when ACWR > 1.8. No session of any type is permitted. The output SHALL include the disclaimer and an OTS-level alert appending "Consider consulting a healthcare provider."

#### Scenario: ACWR in critical range
- **WHEN** `acwr > 1.8`
- **THEN** recommendation is `session_type='rest'`, alert level is `'ots'`, disclaimer is present, and "Consider consulting a healthcare provider." is appended to the alert message

### Requirement: Gate 1 — danger ACWR active recovery only
The system SHALL restrict recommendations to active recovery sessions (Zone 1 only, ≤ 45 min) when ACWR > 1.5 and ≤ 1.8.

#### Scenario: ACWR in danger range
- **WHEN** `acwr > 1.5` and `acwr ≤ 1.8`
- **THEN** recommendation is constrained to Zone 1 active recovery; no quality sessions or strength sessions are permitted

### Requirement: Gate 2 — caution ACWR volume cap
The system SHALL cap recommended session duration to 60 minutes when ACWR > 1.3 and ≤ 1.5, and ramp rate exceeds 10%/week.

#### Scenario: ACWR in caution range with elevated ramp
- **WHEN** `acwr > 1.3` and `ramp_rate > 10`
- **THEN** recommended duration is capped at 60 minutes; intensity is not further restricted

### Requirement: Injury activity block
The system SHALL block all activities listed in `injuries.affected_activities` for any active injury where `cleared_by_user = FALSE`. Cross-training options are offered when `injuries.cross_training_ok = TRUE`.

#### Scenario: Active injury blocking running
- **WHEN** an active injury has `affected_activities = ARRAY['running']` and `cleared_by_user = FALSE`
- **THEN** no running session is recommended; cycling or swimming cross-training is offered if `cross_training_ok = TRUE`

#### Scenario: Severe injury, no weight-bearing
- **WHEN** an active injury has `cross_training_ok = FALSE`
- **THEN** recommendation is rest or upper-body-only session with zero lower limb load

### Requirement: Gate ordering and short-circuit
Safety gates SHALL be evaluated in order (Gate 0 → Gate 1 → Gate 2 → Injury block). The first gate that fires short-circuits all remaining gates and session selection logic.

#### Scenario: Multiple gates would fire
- **WHEN** `acwr = 1.9` (Gate 0) and an active injury exists
- **THEN** Gate 0 fires, output is mandatory rest, injury block is not separately evaluated

### Requirement: Standard disclaimer always present
Every recommendation output SHALL include `STANDARD_DISCLAIMER` regardless of which gates fired or whether any gate fired.

#### Scenario: Normal day, no gates fire
- **WHEN** all signals are within normal ranges
- **THEN** `DailyRecommendation.disclaimer` is set to `STANDARD_DISCLAIMER`