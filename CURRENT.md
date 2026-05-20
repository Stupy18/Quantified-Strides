# Current State — QuantifiedStrides

> **Last updated:** 2026-05-20 (end of session)
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

---

## Next Up (ordered)

1. **Mobile white screen** — fix before adding more mobile features. Debug steps in `mobile/CLAUDE.md`.
2. **Sleep readiness wiring** — self-contained, data-ready, no blockers. Brief in `AGENTS.md`.
3. **Rec engine v2.0 — Story 003** — safety gates. Depends on 001 + 002 being merged.

---

## Rec Engine v2.0 — Story Dependency Waves

Planning complete. Spec reviewed and audited 2026-05-20. Dev team owns implementation. Stories are on Trello.

| Wave | Stories | Status |
|---|---|---|
| 1 | 001, 001.5 — Schema foundation + split/cycle extensions | **001 merged. 001.5 not yet started.** |
| 2 | 002, 002.5, 002.6 — Signal computation + terrain classification + hrv_z/cycle_modifier_scale | **002 merged. 002.5 and 002.6 not yet started.** |
| 3 | 003, 007, 011 — Safety gates, competition calendar, background jobs | After 002 |
| 4 | 004, 005 — Daily rec engine, CSP solver | After 003 |
| 5 | 006, 008, 009, 010 — Running Rx, plan generator, injury mgmt, female athlete protocol | After 004/005 |
| UI | 012–016 — Dashboard surface | After 004 (typed DailyRecommendation model) |

---

## Strategic Roadmap — Post Rec Engine

Epics in order after rec engine ships:

1. **Mobile parity** — Today tab, Log tab, auth flow, persistence. Mobile is the primary daily surface.
2. **Onboarding** — Questionnaire, first-sync experience, cold-start UX. Phase 1 GTM gate.
3. **Longitudinal analytics** — 1RM progression, VO2max trend, running economy over time. Retention driver.
4. **Narrative upgrade** — Personal journal RAG over `workout_reflection` entries. Phase 2 personalization.

---

## Blocked

| Item | Blocked by |
|---|---|
| Mobile feature work (beyond Today/History) | White screen fix |
| Rec engine stories 003+ | Stories 001 + 002 deployed (both merged) |
| Dashboard UI stories 012–016 | Story 004 (DailyRecommendation typed model) |
| Notebooks 09–11 (data science) | Notebook 08 completion + ≥200 matched HRV × check-in rows |
| Story cards video export | EAS Build not set up |

---

## Data Science — Next Up

| Task | Status |
|---|---|
| Notebook 08 — Daily readiness missingness audit | Not started — unblocked |
| Onboarding questionnaire spec (6 fields → prior JSON) | Not started — needed before onboarding epic |
| Video transcript ingestion into `knowledge/` | Not started — content work, no dev needed |

---

## Recently Completed

- **Rec engine v2.0 — spec review and story audit (2026-05-20)** — Deep review of `RECOMMENDATION_PROTOCOL.md`. Gap-fills: independent aerobic/strength matrices, female athlete protocol rewrite, `prescribe_run()` clarified, `apply_cycle_modifiers()` defined, split catalog (§14.12), open-ended deload triggers (§15.1), background jobs (§12). Stories 001.5, 002.5, 002.6 added; all stories audited with Generate Tests.
- **Rec engine v2.0 — Story 002 signal computation** — All compute logic implemented: `signal_assembly.py`, ATL/CTL/TSB precompute, HRV baseline, pattern fatigue residuals, zone speeds calibration.
- **Rec engine v2.0 — Story 001 schema foundation** — V006/V007/V008 migrations: 18 new tables, ALTER TABLE extensions, seeds, trigger + index.
- **Rec engine v2.0 — full planning epic (2026-05-19)** — Stories 001–016 written. Spec: `docs/RECOMMENDATION_PROTOCOL.md`.
- **Notebook 07 — Recommendation engine prototype** — All 12 pipeline scenarios passing.
- **Mobile: Story cards** — 10 animated ephemeral cards, 24h TTL, Today tab wired.
- **Mobile: Load tab** — ATL/CTL/TSB chart, ramp rate, workout history, all wired to real API.
- **Sleep baseline (notebook 06)** — `compute_sleep_readiness()` validated.
- **Operating protocol** — `PROTOCOL.md`, `WORKFLOW.md`, `AGENTS.md`, `TEAM_GUIDE.md` committed to dev.

---

## Active Branches

| Branch | Purpose | Last active |
|---|---|---|
| `dev` | Integration — all feature PRs target here | Active |
| `docs/rec-engine-spec-review` | Spec review — RECOMMENDATION_PROTOCOL.md + story audit | Active 2026-05-20 |
| `research` | Data science notebooks + planning artifacts | Active 2026-05-20 |
| `main` | Production-ready | Stable |