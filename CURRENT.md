# Current State — QuantifiedStrides

> **Last updated:** 2026-05-19 (end of session)
> **Active integration branch:** `dev`
> **Rule:** Update this file at the end of every session. If it's stale, update it before starting work.

---

## In Progress

| Item | Owner | Branch | Status | Notes |
|---|---|---|---|---|
| Mobile — white screen fix | — | dev | Blocked | Bundle compiles. White screen on device. Debug steps in `mobile/CLAUDE.md` → Known Issue. Fix this before adding more mobile features. |
| Mobile — Today tab | — | dev | Active | Wired to `/dashboard` API. UI built with mock data, API wiring done. Review needed. |
| Mobile — History tab | — | dev | Active | 90-day workout fetch implemented. |
| Sleep readiness wiring | — | dev | Spec ready | `compute_sleep_readiness()` validated in notebook 06. Not wired into dashboard yet. Self-contained, high signal — good next task. |
| Rec engine v2.0 — Story 001 schema | — | `feature/rec-engine-schema-foundation` | PR open | V006/V007/V008 validated (Flyway exits 0, all 18 tables present, seeds correct, trigger + index verified). PR → `dev` open, awaiting review. |
| **Rec engine v2.0 — Story 002 signal computation** | — | `feature/002.signal-computation-layer` | **In progress — 44/46 tasks** | All compute logic implemented. 2 tasks need live DB verification (training_load_daily upsert after sync, dashboard latency). Ready to commit. **Blocked by: Story 001 must merge first** (V006–V008 add the columns this code writes to). |

---

## Next Up (ordered)

1. **Mobile white screen** — fix before adding more mobile features. Debug steps in `mobile/CLAUDE.md`.
2. **Sleep readiness wiring** — self-contained, data-ready, no blockers. Brief in `AGENTS.md`.
3. **Rec engine v2.0 — Story 001 validation** — V006/V007/V008 migrations written on `feature/rec-engine-schema-foundation`. Run `docker compose down -v && docker compose up -d` and confirm Flyway exits 0 before opening PR to `dev`.

---

## Rec Engine v2.0 — Story Dependency Waves

Planning complete. Dev team owns implementation. Stories are on Trello.

| Wave | Stories | Status |
|---|---|---|
| 1 | 001 — Schema foundation | **PR open → dev. Merge to unblock Wave 2.** |
| 2 | 002 — Signal computation | After 001 |
| 3 | 003, 007, 011 — Safety gates, competition calendar, background jobs | After 002 |
| 4 | 004, 005 — Daily rec engine, CSP solver | After 003 |
| 5 | 006, 008, 009, 010 — Running Rx, plan generator, injury mgmt, female athlete protocol | After 004/005 |
| UI | 012–016 — Dashboard surface | After 004 (typed DailyRecommendation model) |

---

## Strategic Roadmap — Post Rec Engine

Epics in order after rec engine ships:

1. **Onboarding** — Questionnaire, first-sync experience, cold-start UX. Phase 1 GTM gate. (PM stories to be written.)
2. **Longitudinal analytics** — 1RM progression, VO2max trend, running economy over time. Retention driver. (PM stories to be written.)
3. **Narrative upgrade** — Personal journal RAG over `workout_reflection` entries. Phase 2 personalization.

---

## Blocked

| Item | Blocked by |
|---|---|
| Mobile feature work (beyond Today/History) | White screen fix |
| Rec engine stories 002+ | Story 001 (schema) deployed |
| Dashboard UI stories 012–016 | Story 004 (DailyRecommendation typed model) |
| Notebooks 09–11 (data science) | Notebook 08 completion + ≥200 matched HRV × check-in rows |

---

## Data Science — Next Up

| Task | Status |
|---|---|
| Notebook 08 — Daily readiness missingness audit | Not started — unblocked |
| Onboarding questionnaire spec (6 fields → prior JSON) | Not started — needed before onboarding epic |
| Video transcript ingestion into `knowledge/` | Not started — content work, no dev needed |

---

## Recently Completed

- **Rec engine v2.0 — full planning epic** — Stories 001–016 written and on Trello. Spec: `docs/RECOMMENDATION_PROTOCOL.md`.
- **Notebook 07 — Recommendation engine prototype** — All 12 pipeline scenarios passing. Key decisions: per-athlete HRV baseline in `user_profile`, `establish_hrv_baseline()` filters to post-rest/easy readings, short sleep hard cap (`< 6h → cannot produce 'high' readiness`).
- **`docs/RECOMMENDATION_PROTOCOL.md` v2.0** — Full engineering spec.
- **Mobile: Story cards** — 10 animated ephemeral cards, 24h TTL, Today tab wired.
- **Mobile: Load tab** — ATL/CTL/TSB chart, ramp rate, workout history, all wired to real API.
- **Mobile: BodyFreshnessMap** — Camera-zoom, anatomical SVG, per-muscle freshness coloring.
- **Sleep baseline (notebook 06)** — `compute_sleep_readiness()` validated.
- **Operating protocol** — `PROTOCOL.md`, `WORKFLOW.md`, `AGENTS.md`, `TEAM_GUIDE.md` committed to dev.

---

## Active Branches

| Branch | Purpose | Last active |
|---|---|---|
| `dev` | Integration — all feature PRs target here | Active |
| `feature/rec-engine-schema-foundation` | Story 001 — V006/V007/V008 migrations | PR open → dev |
| `feature/002.signal-computation-layer` | Story 002 — signal computation layer | Active 2026-05-19 |
| `research` | Data science notebooks + planning artifacts | Active — rec engine stories committed 2026-05-19 |
| `main` | Production-ready | Stable |
