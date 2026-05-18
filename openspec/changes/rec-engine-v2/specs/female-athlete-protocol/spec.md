## ADDED Requirements

### Requirement: Cycle phase estimation
The system SHALL estimate current menstrual cycle phase from `menstrual_cycles` when `user_profile.hormonal_contraception` is not `TRUE`. Phase is one of: `'follicular'`, `'ovulatory'`, `'luteal'`, `'menstrual'`. Returns `None` when no `menstrual_cycles` row exists within 60 days.

#### Scenario: Active cycle record within 60 days
- **WHEN** `menstrual_cycles` has a row with `start_date` within 60 days and `user_profile.hormonal_contraception IS NOT TRUE`
- **THEN** `cycle_phase` is estimated from `(today - start_date) % predicted_cycle_length`

#### Scenario: No cycle record or hormonal contraception
- **WHEN** `user_profile.hormonal_contraception = TRUE` or no `menstrual_cycles` row within 60 days
- **THEN** `cycle_phase = None`; no cycle modifiers are applied

### Requirement: Intensity modifiers per cycle phase
The system SHALL apply intensity modifiers to session type and zone recommendations based on `cycle_phase`. Modifiers are performance-optimisation framing only — never diagnostic or medical framing. The `STANDARD_DISCLAIMER` always accompanies cycle-adjusted recommendations.

#### Scenario: Follicular phase — high performance window
- **WHEN** `cycle_phase = 'follicular'`
- **THEN** quality sessions (threshold, intervals) are eligible; intensity modifier is +0 (baseline)

#### Scenario: Luteal phase — reduced intensity preference
- **WHEN** `cycle_phase = 'luteal'`
- **THEN** intensity modifier reduces target zone cap by 1 zone and reduces duration by 10%; note added advising RPE-based pacing

#### Scenario: Menstrual phase — conservative defaults
- **WHEN** `cycle_phase = 'menstrual'`
- **THEN** session type defaults to Zone 1–2; quality sessions remain available if readiness composite is high (> 0.75)

### Requirement: ACL risk awareness flag
The system SHALL include an `acl_awareness` flag in `DailyRecommendation` when `user_profile.sex = 'female'` and recommended session involves plyometrics or change-of-direction drills. The flag is non-blocking — it does not modify exercise selection. Language is awareness-only, not diagnostic.

#### Scenario: Female athlete, plyometric session
- **WHEN** `user_profile.sex = 'female'` and the CSP solver selects a plyometric exercise
- **THEN** `DailyRecommendation.alerts` includes an ACL-awareness entry with non-diagnostic language

#### Scenario: Non-plyometric session
- **WHEN** no plyometric or COD exercises are selected
- **THEN** no ACL-awareness flag is added regardless of `sex`

### Requirement: Garmin menstrual data import
The system SHALL accept cycle data from Garmin menstrual JSON export as a `source='garmin'` row in `menstrual_cycles`. Manual entry is the fallback source (`source='manual'`).

#### Scenario: Garmin cycle data synced
- **WHEN** Garmin sync returns a menstrual cycle JSON record
- **THEN** a row is upserted in `menstrual_cycles` with `source='garmin'`

#### Scenario: Manual cycle entry
- **WHEN** a user submits a cycle start date via the app
- **THEN** a row is inserted with `source='manual'`