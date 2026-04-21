# QuantifiedStrides

Personal sports scientist in an app. Production-grade athlete performance monitoring system — originally a UBB bachelor's thesis, now a real daily-use tool. Ingests multi-modal time-series data, runs an algorithmic intelligence layer, and surfaces actionable daily training recommendations.

## Collaboration Context

Vlad defines vision and direction. Claude handles implementation and consults on trade-offs before building. Vlad has deep exercise science knowledge (periodization, concurrent training, sport-specific programming) and ML fundamentals — the app encodes his knowledge, not generic rules. He's direct, won't accept lazy solutions, and will push back if something isn't good enough.

**LLM design philosophy:** Pattern detection and recommendations are algorithmic/ML. The Claude API handles only narrative — translating detected patterns into readable language. Not an LLM wrapper.

## Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI + SQLAlchemy async (asyncpg driver) |
| Database | PostgreSQL (`quantifiedstrides`) via Docker (`pgvector/pgvector:pg16`) |
| Migrations | Flyway 10 (`flyway/flyway:10` Docker service) — SQL-first versioned migrations in `db/flyway/` |
| Frontend | React (Vite, port 5173) + shadcn/ui components |
| Auth | JWT (HS256, 30-day expiry) + email verification via SMTP |
| Narrative | Anthropic Claude API (`ai/narrative.py`) |
| RAG | pgvector extension + `ai/rag.py` |
| Config | `pydantic-settings` loading from `.env` |

## Running Locally

### Full Docker (primary — runs everything)

```bash
# From project root (QuantifiedStrides-main/)
docker compose up -d --build

# App:      http://localhost        (nginx → React)
# API docs: http://localhost:8000/docs
```

Register an account via the UI — the seed container detects the new user and auto-populates 90 days of demo data. Watch it with:

```bash
docker logs -f quantifiedstrides_seed
```

To reset the database completely:
```bash
docker compose down -v && docker compose up -d
```

Schema is managed by **Flyway** — the `flyway` service runs on every `docker compose up`, applies any pending migrations from `db/flyway/`, then exits. Backend and seed wait on `flyway: condition: service_completed_successfully` before starting.

### Local Dev (hot-reload — BE + FE only, DB still via Docker)

```bash
# From QuantifiedStrides-main/
docker compose up -d db          # DB only

# Backend (from QuantifiedStrides/)
source .venv/bin/activate
uvicorn main:app --reload --port 8000
# Docs: http://localhost:8000/docs

# Frontend (from frontend/)
npm run dev
# App: http://localhost:5173
```

### Garmin Sync

```bash
# Primary: frontend "Sync" button → POST /api/v1/sync/garmin
# CLI fallback (each file has __main__ block):
python ingestion/workout.py
python ingestion/sleep.py
python ingestion/environment.py
```

## Project Structure

### Backend

```
main.py               # FastAPI app, CORS, router registration
deps.py               # FastAPI Depends: get_db(), get_current_user_id(), repo factories
core/
  settings.py         # pydantic-settings config (DB, JWT, SMTP, Anthropic key)
  config.py           # env var loader (.env) for ingestion pipeline (Garmin, OpenWeather)
api/v1/
  auth.py             # register, login, verify-email, me
  dashboard.py        # GET /dashboard — full daily summary
  training.py         # workout history, training load
  sleep.py            # sleep history
  strength.py         # strength sessions, exercises, sets
  checkin.py          # daily readiness + post-workout reflection
  running.py          # running biomechanics analytics
  sync.py             # POST /sync/garmin — triggers Garmin pipeline
repos/                # repository layer — all SQL lives here, injected via FastAPI Depends
  user_repo.py             # users + user_profile queries
  workout_repo.py          # workouts table queries + intelligence helpers
  workout_metrics_repo.py  # workout_metrics time-series queries (biomechanics, running economy, terrain,
                           #   grade-adjusted pace/speed, performance condition, speed_ms series)
  strength_repo.py         # strength_sessions, strength_exercises, strength_sets, exercises queries
  sleep_repo.py            # sleep_sessions queries
  checkin_repo.py          # daily_readiness, workout_reflection, journal_entries queries
  environment_repo.py      # environment_data queries
  knowledge_repo.py        # pgvector similarity search on knowledge_chunks
  narrative_repo.py        # narrative_cache get/upsert
services/
  auth_service.py          # JWT issue/verify, password hash, email verification
  email_service.py         # SMTP email sending
  dashboard_service.py     # orchestrates all intelligence services into one dashboard payload
  checkin_service.py       # readiness + reflection CRUD
  strength_service.py      # strength session/exercise/set CRUD + 1RM
  running_service.py       # running biomechanics computations
  sleep_service.py         # sleep history queries
  training_service.py      # workout history queries
  intelligence/            # service wrappers around the intelligence layer
    training_load_service.py  # injects repos into intelligence.training_load; maps to schema
    recovery_service.py       # injects repos into intelligence.recovery; maps to schema
    alerts_service.py         # injects repos into intelligence.alerts; maps to schema
    recommendation_service.py # injects repos into intelligence.recommend; maps to schema
ai/
  narrative.py        # Claude API call — RAG-grounded narrative, cached per user/day
  rag.py              # pgvector cosine similarity search for knowledge injection
models/
  auth.py, checkin.py, dashboard.py, strength.py, training.py,
  sleep.py, running.py
```

### Intelligence Layer — `intelligence/`

```
intelligence/
  training_load.py      # TRIMP, ATL/CTL/TSB, ramp rate, load history
  recovery.py           # HRV rolling z-score, muscle fatigue decay
  alerts.py             # anomaly detection, overtraining alerts, interpretations
  recommend.py          # daily training recommendation (integrates all signals)
  analytics/
    biomechanics.py     # fatigue signature, cadence-speed relationship,
                        # per-workout biomechanics summary, longitudinal trends
    running_economy.py  # running economy analysis
    terrain_response.py # elevation vs HR response
```

### Data Ingestion — `ingestion/`

```
ingestion/
  okgarmin_connection.py  # shared singleton Garmin client; token-cached at ~/.garmin_tokens
                          # get_garmin_client() / reset_garmin_client() — used by all ingestion fns
  workout.py            # collect_workout_data(db, user_id, client) → workouts + satellite tables
                        #   (workout_hr_zones, workout_run_biomechanics, workout_power_summary)
  sleep.py              # collect_sleep_data(db, user_id, client) → sleep_sessions table
  environment.py        # collect_environment_data(db) → environment_data table
                        # WARNING: hardcoded user_id=1 — not yet multi-user
  workout_metrics.py    # collect_workout_metrics(db, user_id, client) → workout_metrics table
```

All ingestion functions are async and accept an injected Garmin client. Primary invocation is via `POST /api/v1/sync/garmin`. Each file also has a `__main__` block for CLI fallback.

### CLI Tools — `cli/`

```
cli/
  main.py               # CLI entry point
  checkin.py            # morning readiness + post-workout reflection (terminal)
  daily_subjective.py   # DEPRECATED — backing table (daily_subjective) was dropped; kept for reference only
  strength_log.py       # gym session logger (superseded by API, kept for terminal use)
```

### Database — `db/`

```
db/
  session.py            # psycopg2 get_connection() — used only by cli/ and scripts/
                        # NOTE: also defines a stale async engine; canonical async engine lives in deps.py
  schema.sql            # reference snapshot only — NOT mounted into the db container
  flyway/
    V001__baseline.sql  # frozen initial schema (do not edit)
    V002__*.sql         # future migrations go here — never edit committed files
```

**Migration rules:**
- Flyway owns all schema changes. Never edit a committed migration file — add a new version instead.
- Naming: `V{version}__{description}.sql` (double underscore). Version is an integer: `V002`, `V003`, etc.
- `flyway_schema_history` table is created automatically in the DB — do not touch it.
- `BASELINE_ON_MIGRATE=true` means: fresh DB runs V001 to create the schema; existing DB with no history table gets V001 marked as already applied, then any pending versions run.

### One-Off Scripts — `scripts/`

```
scripts/
  check_connections.py        # smoke test: verifies PostgreSQL, Garmin, OpenWeather, pollen APIs
  backfill_workouts.py        # one-time: backfilled historical Garmin workouts (writes to satellite tables)
  backfill_sleep.py           # one-time: backfilled historical sleep data
  backfill_workout_metrics.py # one-time: backfilled workout_metrics time-series
  ingest_knowledge.py         # one-time: embed coaching transcripts into pgvector
  import_wger.py              # one-time: imported 761 exercises from wger API (Claude Haiku-labeled)
  import_exercises.py         # one-time: imported 36 custom exercises
  migrate_cascade.py          # schema migration helper
  populate_tables.py          # seed 90 days of demo data (workouts, sleep, readiness, reflections)
  populate_tables2.py         # seed exercises, workout_metrics, strength sessions
  seed_docker.sh              # Docker entrypoint for seed service — polls for user then runs both populate scripts
                              # NOTE: entrypoint uses `tr -d '\r'` to strip Windows CRLF before execution
  dump_tables.py              # dump table contents for inspection
  debug_sleep.py              # sleep data debug utility
```

### Tests — `tests/`

```
tests/
  conftest.py, pytest.ini
  test_config.py, test_db.py, test_environment.py, test_sleep.py,
  test_strength_log.py, test_workout.py
```

### Docs & Samples

```
docs/
  DECISIONS.md          # architecture decision records
  *.plantuml            # DB schema + flow diagrams
samples/                # raw Garmin API response samples + terrain curve visualization
```

### Knowledge Base — `knowledge/`

```
knowledge/
  *.txt                 # cleaned coaching transcripts for pgvector RAG ingestion
                        # sources: Magness, Attia, Eriksson, Moore, Daniels
```

### Frontend — `frontend/src/`

```
pages/
  Dashboard.jsx         # home: alerts, today's plan, ATL/CTL/TSB, muscle freshness,
                        # narrative, weather, readiness summary
  CheckIn.jsx           # morning readiness + post-workout reflection forms
  Strength.jsx          # strength logging: session builder, exercise search
  Running.jsx           # running biomechanics analytics (wired end-to-end)
  Training.jsx          # training load history, workout log
  Sleep.jsx             # sleep history
  Journal.jsx           # workout reflections journal
  Profile.jsx           # sport picker, training goal, gym days, Garmin credentials
  Login.jsx / Register.jsx / Verify.jsx
components/
  SportPicker.jsx       # shared checkbox + select; used in Register and Profile
  layout/Sidebar.jsx
  ui/                   # shadcn: badge, button, card, separator, tabs
api/
  client.js             # axios instance with JWT bearer header
  auth.js, dashboard.js, checkin.js, strength.js, training.js,
  sleep.js, running.js, sync.js
```

### Root-Level (`QuantifiedStrides-main/`)

```
docker-compose.yml      # orchestrates db, backend, frontend, seed services
```

### Backend Root (`QuantifiedStrides/`)

```
main.py                 # FastAPI app entry point (imports app from routers, registers middleware)
deps.py                 # shared FastAPI dependencies: get_db(), get_current_user_id(),
                        # repo factories — get_user_repo, get_workout_repo, get_strength_repo,
                        #   get_checkin_repo, get_sleep_repo, get_workout_metrics_repo
                        # service factories — get_running_service, get_dashboard_service
                        # all injected via Depends() per request
requirements.txt
Dockerfile              # python:3.11-slim image; installs requirements, runs uvicorn
.dockerignore
.env / .env.example
```

### Frontend Root (`frontend/`)

```
Dockerfile              # multi-stage: node:20-alpine build → nginx:alpine serve
nginx.conf              # serves React SPA on port 80, proxies /api/ to backend:8000
```

## Database Schema (PostgreSQL)

```
users                      (email_verified BOOLEAN, verification_token — proper auth columns)
  └─ user_profile          (FK: user_id — goal, gym_days_week, primary_sports JSONB)
  └─ workouts              (FK: user_id — sport, distance_m, avg_cadence, VO2max, GPS,
                                          garmin_activity_id, primary_benefit, training_load_score,
                                          avg/max_respiration_rate; core fields only — zones/bio/power
                                          in satellite tables)
       ├─ workout_hr_zones        (FK: workout_id — zone SMALLINT + seconds; PRIMARY KEY (workout_id, zone))
       ├─ workout_run_biomechanics(FK: workout_id PK — avg_vertical_oscillation, avg_stance_time,
                                                        avg_stride_length, avg_vertical_ratio,
                                                        avg_running_cadence, max_running_cadence)
       ├─ workout_power_summary   (FK: workout_id PK — normalized_power, avg_power, max_power,
                                                        training_stress_score)
       ├─ environment_data        (FK: workout_id nullable — weather, UV, pollen per session;
                                                        record_date DATE GENERATED from record_datetime)
       └─ workout_metrics         (FK: workout_id — time-series: heart_rate, pace, cadence,
                                                        vertical_oscillation, vertical_ratio, stance_time,
                                                        power, lat/lon, altitude, distance, gradient_pct,
                                                        stride_length, grade_adjusted_pace, body_battery,
                                                        vertical_speed, speed_ms, grade_adjusted_speed_ms,
                                                        performance_condition, respiration_rate;
                                                        UNIQUE (workout_id, metric_timestamp); seeded)
  └─ sleep_sessions        (FK: user_id — duration, score, HRV, stages, Body Battery)
  └─ daily_readiness       (FK: user_id — overall/legs/upper/joint feel, time_available,
                                          going_out_tonight)
  └─ workout_reflection    (FK: user_id — session RPE, quality, load_feel, notes,
                                          workout_id FK → workouts ON DELETE SET NULL)
  └─ strength_sessions     (FK: user_id; seeded with strength training workouts)
       └─ strength_exercises (FK: session_id; exercise_ref_id FK → exercises ON DELETE SET NULL)
            └─ strength_sets (FK: exercise_id — weight, reps, rpe)
  └─ narrative_cache       (FK: user_id — date + cache_key UNIQUE; busts on sport change)
  └─ nutrition_log         (FK: user_id — schema defined, not implemented)
  └─ injuries              (FK: user_id — schema defined, not implemented)
exercises                  (pool of ~797: 36 custom + 761 wger, movement pattern,
                            quality focus, primary/secondary muscles, equipment,
                            skill level — enables recommendation engine; seeded)
exercise_progressions      (FK: exercise_id — tracks progressive overload per user)
knowledge_chunks           (pgvector: coaching transcript embeddings for RAG)
```

**Key schema notes:**
- `users` has `email_verified` and `verification_token` columns for the email verification flow
- `workouts` has `UNIQUE (user_id, start_time)` — duplicate detection on ingest
- `workouts.distance_m` stores metres of distance (renamed from the ambiguous `training_volume`)
- `workouts.avg_cadence` stores session-level cadence for all sports (running: steps/min; cycling: rpm)
- HR zones are normalised into `workout_hr_zones` — supports 3–6 zone configs; TRIMP reads from here
- Running biomechanics (GCT, oscillation, stride) are in `workout_run_biomechanics`; column is `avg_stance_time` (Garmin fit-file name) not `avg_ground_contact_time`
- `workout_metrics.stance_time` matches the Garmin fit-file field name (`directGroundContactTime` maps to `stance_time`)
- `environment_data.workout_id` is nullable — NULL means a rest day (no placeholder workouts)
- `environment_data.record_date` is a `GENERATED ALWAYS AS (record_datetime::date) STORED` column — use it in WHERE clauses instead of casting
- `daily_readiness` captures `going_out_tonight` (social schedule affects tomorrow's training)
- `workout_reflection.load_feel` is a -2 to +2 scale (too easy → too hard) — used to calibrate future recommendations; `workout_id` FK links the reflection to the specific workout
- `strength_exercises.exercise_ref_id` FK links logged exercises to the `exercises` taxonomy — auto-populated on insert via case-insensitive name match
- `user_profile.primary_sports` is JSONB — keys are sport slugs, values are priority weights
- `narrative_cache` is keyed by `(user_id, date, cache_key)` — cache_key is an MD5 of sports preferences; busts when sport profile changes
- `workouts.garmin_activity_id` has a partial UNIQUE index (`WHERE garmin_activity_id IS NOT NULL`); `primary_benefit` and `training_load_score` are Garmin-sourced training adaptation metadata; `avg/max_respiration_rate` are session summaries
- `workout_metrics`, `exercises`, and `strength_sessions` are seeded with real data
- `daily_subjective` table was dropped (superseded by `daily_readiness`)

## Intelligence Layer — How It Works

### Training Load (TRIMP / ATL / CTL / TSB)

- **TRIMP**: exponential HR-zone-weighted training impulse per session
- **ATL** (Acute Training Load, "fatigue"): 7-day exponentially weighted moving average of TRIMP
- **CTL** (Chronic Training Load, "fitness"): 42-day EWMA of TRIMP
- **TSB** (Training Stress Balance, "form"): CTL − ATL
- **Ramp rate**: week-over-week CTL change — flags excessive load increases

### Recovery Scoring

- **HRV trend**: rolling z-score of overnight HRV against a personal 30-day baseline
  - z < −1.5: suppressed (flag rest or easy day)
  - z > +1.0: elevated (ready for quality work)
- **Muscle fatigue decay**: per-muscle-group exponential decay model
  - Each strength set adds fatigue proportional to volume (sets × reps × weight)
  - Decay constant calibrated per muscle group (fast-twitch vs slow-twitch recovery rates)
  - Freshness score surfaced on Dashboard as muscle group heatmap

### Recommendation Engine (`intelligence/recommend.py`)

Integrates:
1. HRV status + TSB → readiness signal
2. Muscle freshness map → which movements are available
3. Weather → outdoor/indoor decision
4. `daily_readiness` inputs → time available, going out tonight, injury notes
5. User's sport priority weights from `user_profile.primary_sports`
6. Training goal (athlete / strength / hypertrophy) → modulates volume and intensity targets
7. Hard rules (e.g. upper gym yesterday → no climbing; rain → no threshold runs)

Output: recommended sport, session type, intensity zone, exercise suggestions.

### Narrative Layer (`ai/narrative.py` + `ai/rag.py`)

When the dashboard loads:
1. `rag.py` runs a pgvector cosine similarity search against `knowledge_chunks` using the current context (e.g. "Z2 base building, suppressed HRV, ankle rehab")
2. Top-k coaching transcript chunks are retrieved and injected into the system prompt
3. Claude API generates a narrative explanation of detected patterns — grounded in real sports science, not generic LLM output

Knowledge base sources: Steve Magness, Peter Attia, Mikael Eriksson (Scientific Triathlon), Kolie Moore, Jack Daniels content.

Narrative is **cached** keyed by sports preferences — cache busts when sport profile changes.

## Auth Flow

1. `POST /api/v1/register` — creates user, sends verification email
2. `GET /api/v1/verify-email?token=...` — marks email verified, issues JWT
3. `POST /api/v1/login` — returns JWT (30-day expiry)
4. All protected routes: `Authorization: Bearer <token>` → `get_current_user()` extracts `user_id`

**Critical:** `user_id` is always extracted from the JWT via `get_current_user()`. Never hardcoded. This applies to all routers and services. **Exception:** `ingestion/environment.py` currently hardcodes `user_id=1` — known bug, pending fix.

## Garmin Sync

Two paths:
1. **API trigger** (`POST /api/v1/sync/garmin`) — primary path; frontend "Sync" button
2. **CLI fallback** — each ingestion file has a `__main__` block for direct execution

**Shared client**: `ingestion/okgarmin_connection.py` provides a singleton `get_garmin_client()` with token caching at `~/.garmin_tokens`. Auth errors trigger `reset_garmin_client()` and re-login.

**Garmin credentials**: currently loaded from `.env` via `core/config.py` (`GARMIN_EMAIL`, `GARMIN_PASSWORD`) — global, not per-user. Per-user credential storage in `user_profile` is the intended architecture but not yet implemented.

**Deduplication**: `workouts` has `UNIQUE (user_id, start_time)` — re-running sync won't create duplicates.

## Environment Variables (`.env`)

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=quantifiedstrides
DB_USER=quantified
DB_PASSWORD=2026

JWT_SECRET=<secret>
ANTHROPIC_API_KEY=<key>

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<email>
SMTP_PASSWORD=<app password>
```

External API keys (OpenWeatherMap, Ambee) are fetched per-user from `user_profile`, not global env vars.

## What's Built and Working

- Auth: register / login / JWT / email verification, multi-user; `users` table has proper `email_verified` + `verification_token` columns
- Garmin sync pipeline: workout + sleep + environment + workout_metrics ingest
- Dashboard: ATL/CTL/TSB, HRV status, muscle freshness heatmap, alerts, Claude narrative, weather, sleep summary, readiness summary
- Strength logging: session builder, exercise search (797 exercises), sets with progressive overload tracking; strength sessions seeded
- Morning check-in / readiness form (`daily_readiness`)
- Post-workout reflection form (`workout_reflection`)
- Profile: sport picker, training goal, gym days/week, Garmin credentials
- Narrative cache (`narrative_cache` table) keyed by sports preferences — busts on profile change
- pgvector RAG knowledge base (`knowledge_chunks` table + `ai/rag.py`); coaching transcripts in `knowledge/`
- Running biomechanics page wired end-to-end: `intelligence/analytics/biomechanics.py` → `services/running_service.py` → `api/v1/running.py` → `frontend/src/pages/Running.jsx`
- `workout_metrics` time-series seeded with real data; `exercises` table seeded (~797 exercises)
- **Repository layer** (`repos/`): all SQL centralized into 9 domain repos injected via FastAPI `Depends`. Services accept repo instances; no raw SQL in services or API handlers. `knowledge_repo` and `narrative_repo` instantiated directly at call sites (no factory needed).
- **Intelligence layer fully async**: `intelligence/` modules (training_load, recovery, alerts, recommend, all analytics) use async SQLAlchemy via injected repos — no psycopg2, no `asyncio.to_thread`. Service wrappers live in `services/intelligence/`.

## What's Half-Built

- **Exercise suggestions on Dashboard** — recommendation engine outputs them, Dashboard UI doesn't display them yet
- **Goal-based recommendation differentiation** — athlete vs strength vs hypertrophy logic not fully separated
- **workout_metrics live ingestion** — `ingestion/workout_metrics.py` exists and backfill is done; `collect_workout_metrics()` is called from sync but integration may not be fully tested end-to-end
- **`environment.py` not multi-user** — `collect_environment_data()` hardcodes `user_id=1`; needs to accept `user_id` as a parameter like the other ingestion functions.
- **`db/session.py` stale async engine** — defines a second `create_async_engine` instance alongside the canonical one in `deps.py`; ingestion files use the `db/session` one. Should be consolidated so there is a single engine/pool.

## What Doesn't Exist Yet

- Nutrition module (table exists, no UI or API)
- Injury tracking (table exists, no UI or API)
- Progress / trends page (longitudinal view over months — 1RM progression, VO2max trend, sleep patterns)
- Periodization planner (base → build → peak → taper blocks anchored to race date)
- Automatic Garmin sync scheduler
- Garmin credential encryption at rest
- Error boundaries on frontend
- Input validation (Zod on frontend, stricter Pydantic on backend)

## Vlad's Training Context (as of 2026-03-14)

**Goal:** All-around mountain athlete — XC MTB, trail running, bouldering/climbing, skiing, snowboarding, hiking.

**Current phase:** Base building post-ankle sprain (freak climbing accident). ~4 weeks from returning to trail running. Z2 bike primary, reintroducing flat running.

**Weekly structure:**
- Mon: Upper gym + 30 min Z2 bike
- Tue: Climbing + 30 min Z2 bike
- Wed: Lower gym + prehab (Copenhagen planks, tibialis raises, ankle mobility)
- Thu: Rest or climbing (fatigue-dependent)
- Fri: Run or XC MTB
- Sat: Upper gym 2 (if didn't go out Fri night) + flat run
- Sun: Lower gym 2

**Hard rules (non-negotiable constraints in recommendation engine):**
- Upper gym yesterday → no climbing today (elbow/shoulder overlap)
- Lower gym yesterday → no running, only easy Z2 bike
- Rain → no threshold runs, no outdoor intensity
- Short time window → stationary bike Z2
- Going out tonight → no hard session tomorrow planned

**Sport priority (base building phase):**
1. Bike (XC specific — outdoor or Z2 stationary)
2. Run (road before trail, flat before hills)
3. Climbing (maintenance only)
