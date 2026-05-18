## MODIFIED Requirements

### Requirement: build_recommendation input contract
`build_recommendation()` SHALL accept a single `signals: dict` parameter containing all keys defined in the signal registry (§3.1). Missing keys MUST be passed as `None` — callers MUST NOT omit keys. The function SHALL NOT accept keyword arguments for individual signals.

Required keys: `acwr`, `hrv_status`, `sleep_readiness`, `readiness_scores`, `ctl`, `tsb`, `atl`, `ramp_rate`, `days_to_competition`, `competition_priority`, `muscle_freshness`, `biomechanics_fatigue_index`, `zone_speeds`, `hr_rpe_status`, `cycle_phase`, `hormonal_contraception`, `training_status`, `goal`, `sex`, `has_readiness_checkin`, `hrv_data_days`, `max_hr_source`, `biomechanics_baseline`, `has_zone_speeds`, `strength_goal`, `goal_weights`.

#### Scenario: All keys present, some None
- **WHEN** caller passes a dict with all required keys (some values are `None`)
- **THEN** `build_recommendation()` accepts the call and processes it with null-handling per degradation rules

#### Scenario: Caller omits a key
- **WHEN** caller passes a dict missing one or more required keys
- **THEN** `build_recommendation()` raises `KeyError` with the missing key name

### Requirement: build_recommendation output type
`build_recommendation()` SHALL return a `DailyRecommendation` Pydantic model. It SHALL NOT return a plain dict, a tuple, or `None`. All callers MUST be updated to use the typed model.

#### Scenario: Normal execution
- **WHEN** `build_recommendation(signals)` is called with valid input
- **THEN** return value is an instance of `DailyRecommendation`

#### Scenario: All gates fire (mandatory rest)
- **WHEN** Gate 0 fires
- **THEN** return value is still a `DailyRecommendation` instance with `session_type='rest'` and appropriate fields set

### Requirement: recommendation_service maps typed output to dashboard schema
`recommendation_service.py` SHALL map `DailyRecommendation` fields to the dashboard Pydantic model. It SHALL NOT pass the raw `DailyRecommendation` object to the API layer without mapping.

#### Scenario: Dashboard loads with full recommendation
- **WHEN** `GET /dashboard` is called
- **THEN** the response includes all `DailyRecommendation` fields in the dashboard schema format without raw Pydantic model leakage
