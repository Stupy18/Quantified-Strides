## ADDED Requirements

### Requirement: Competition storage and retrieval
The system SHALL store upcoming competitions in the `competitions` table with fields: `user_id`, `event_date`, `sport`, `event_name`, `priority` (A/B/C), `distance_km`, `notes`. One user may have multiple competitions. Priority A = goal race, B = tune-up, C = training race.

#### Scenario: Creating a competition
- **WHEN** a user submits a competition with `event_date`, `sport`, and `priority`
- **THEN** a row is inserted in `competitions` and is retrievable via the competitions API

#### Scenario: Multiple active competitions
- **WHEN** a user has multiple future competitions
- **THEN** all are stored; `days_to_competition` signal uses the nearest upcoming A-priority competition first

### Requirement: days_to_competition signal
The system SHALL compute `days_to_competition` at request time as the number of calendar days to the nearest upcoming A-priority competition, or the nearest B-priority if no A exists. `None` when no future competitions are registered.

#### Scenario: A-priority race upcoming
- **WHEN** a user has an A-priority competition 21 days out
- **THEN** `days_to_competition = 21` and `competition_priority = 'A'`

#### Scenario: No competitions registered
- **WHEN** `competitions` has no future rows for the user
- **THEN** `days_to_competition = None` and `competition_priority = None`; plan generator operates in open-ended mode

### Requirement: Taper trigger from competition proximity
The system SHALL begin taper modulation when an A-priority competition is ≤ `taper_weeks × 7` days away, as defined by the active plan's phase structure. During taper, the recommendation engine SHALL reduce session volume and intensity.

#### Scenario: A-race within taper window
- **WHEN** `days_to_competition ≤ taper_weeks × 7` for an A-priority competition
- **THEN** session duration is reduced per taper phase parameters; quality session frequency drops to 1/week

#### Scenario: B-priority race, no taper restriction
- **WHEN** nearest competition is B-priority
- **THEN** no taper is applied; training continues on normal phase schedule