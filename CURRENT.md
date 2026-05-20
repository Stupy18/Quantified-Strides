# CURRENT.md — Live Sprint State

> **Last updated:** 2026-05-20 (end of session)
> **Active research branch:** `research`
> **Rule:** Update this file at the end of every session. If it's stale, update it before starting work.

---

## Completed This Session

### Rec Engine v2.0 — Spec Review and Story Audit (research branch)

Deep review of `RECOMMENDATION_PROTOCOL.md` and full story audit. No new features added — all changes are corrections and gap-fills to the existing planning artifacts.

**RECOMMENDATION_PROTOCOL.md changes:**

| Section | Change |
|---|---|
| §5.2 | Split into two independent matrices: aerobic (gated by readiness + TSB) and strength (gated by readiness + pattern_fatigue_residuals + HRV floor). TSB never gates strength. |
| §6 | Full rewrite: female athlete phase map, modifiers per phase, contradictory signal handling, graceful data decay, RED-S + bone stress flags. Replaced old incorrect `block_heavy_lower`, `intensity_scale`, ACL hard-block with evidence-grounded modifiers. |
| §7 CSP | Constraint 6 updated: removed stale menstrual/late-luteal heavy-lower block; replaced with ovulatory plyometric soft gate. |
| §8 | `prescribe_run()` clarified as detail function (receives zone, does not own selection); `hr_ceiling_bpm` added to output; minimum duration redirect; `apply_cycle_modifiers()` fully defined as §8a. |
| §9 | `hr_ceiling_bpm: number \| null` added to `recommendation` output contract. |
| §11 | Beginner strength onboarding phase added (`phase='onboarding'`, 2-week diagnostic, `COUNT(strength_sessions) < 4` detection). Required onboarding fields updated (`biological_sex` replaces `sex`, `preferred_split`, `menstrual_dysmenorrhea` added). |
| §11b T11 | Test scenario updated: removed old incorrect `intensity_scale=0.75` / `block_max_effort=True`; updated to new late-luteal behavior (HRV coaching cue, no intensity cap). |
| §12 | Three new background jobs added: weekly taper TSB projection, daily open-ended deload evaluation, split re-evaluation on strength_goal change. |
| §14.12 | New section: strength split catalog (6 splits), `select_split()` function, phase eligibility table, split conflict alert mechanism, mid-plan goal change handling, schema DDL. |
| §15.1 | Open-ended deload triggers table added: 5-week fixed cadence + 6 reactive triggers; `open_ended_load_week_counter` definition. |

**Story file changes:**

| File | Action | Reason |
|---|---|---|
| `001.5.schema-split-cycle-extensions.md` | **Created** | Schema additions not in Story 001: `split_catalog`, `split_phase_eligibility`, `biological_sex` rename, `menstrual_dysmenorrhea`, `preferred_split`, `training_plan_weeks` split columns, `open_ended_load_week_counter` |
| `002.6.signal-additions-hrv-z-cycle-modifier.md` | **Created** | New signal keys: `hrv_z` float, `cycle_modifier_scale` decay weight; TRIMP formula reads `biological_sex` |
| `010.female-athlete-protocol.md` | **Deleted** | Superseded by `010.female-athlete-cycle-modifiers.md` (written previous session) |
| `004` | Updated | `hr_ceiling_bpm: int \| None` added to `DailyRecommendation` fields |
| `005` | Updated | Ovulatory plyometric gate added to hard constraints |
| `006` | Updated | `prescribe_run()` as detail function; `hr_ceiling_bpm` output; minimum duration redirect; new AC rows |
| `011` | Updated | Three new background jobs added to New Behavior + AC |
| `014` | Updated | `hr_ceiling_bpm` display criteria added |
| `015` | Updated | Follicular set bonus rendering criterion added |
| `003, 007, 009, 012, 013, 016` | Updated | Generate Tests added to acceptance criteria |
| `001.5, 002.6, 002.5, 008, 010` | Already had Generate Tests | No change needed |

**Current story index (updated):**

| Wave | Stories | Scope |
|---|---|---|
| 1 | 001, 001.5 | Schema foundation + split catalog / cycle profile extensions |
| 2 | 002, 002.5, 002.6 | Signal computation + terrain classification fix + hrv_z / cycle_modifier_scale |
| 3 | 003, 007, 011 | Safety gates, competition calendar, background jobs |
| 4 | 004, 005 | Daily recommendation engine, CSP solver |
| 5 | 006, 008, 009, 010 | Running prescription, plan generator, injury management, female athlete cycle modifiers |
| UI | 012–016 | Dashboard surface — prescription card, readiness widget, running block, exercise suggestions + logging shortcuts, alerts migration |

PM job on rec engine: **done**. Dev team executes in wave order. All stories have Generate Tests in acceptance criteria.

---

## In Progress

### Story Cards — Mobile (branch: research)

10 animated story cards built. Two confirmed visible on device (HRV + Iron Session). Visual redesign in progress.

**What's done:**
- All 10 card components built
- `StoryCardShell`, `StoriesViewer`, `storyTriggers.ts` (24h TTL AsyncStorage system)
- Today tab wired — `MomentSurface` shows active moment
- All API hooks wired, TypeScript clean
- App running on physical device via Expo Go + WSL2 port forwarding

**What's next:**
- Confirm visual redesign renders correctly (HRV + Iron Session cards)
- Redesign remaining 8 cards to same visual standard (big hero numbers, accent lines, editorial typography)
- All 10 cards need visual QA on device
- Phase 2: video export via `ffmpeg-kit-react-native` (EAS Build required)

**Blocked:** White screen on last reload — cause unconfirmed. Likely FeTurbulence SVG filter crash (removed), or hooks ordering issue. Needs device confirmation.

---

## Data Science — Next Up

| Task | Status | Notes |
|---|---|---|
| Notebook 08 — Daily readiness missingness audit | Not started | Unblocked — run now. Gates notebook 09. |
| Onboarding questionnaire spec | Not started | 6 fields → prior JSON map. Needed before Phase 1 GTM gate. |
| Video transcript ingestion | Not started | Add to `knowledge/`, re-run `scripts/ingest_knowledge.py`. No dev needed. |
| Learning path | Ongoing | Thompson sampling (40pp) → Gelman ch. 2–4 → PyMC. Needed before notebook 09/11. |

---

## Strategic Roadmap — Decided

Post rec-engine implementation, epics in order:

1. **Mobile parity** — Today tab, Log tab, auth flow, persistence. Mobile is the primary daily surface.
2. **Onboarding epic** — Questionnaire, first-sync experience, cold-start UX. Phase 1 GTM gate.
3. **Longitudinal analytics** — 1RM progression, VO2max trend, running economy over time. Retention driver.
4. **Narrative upgrade** — Personal journal RAG (Story 017 to be written). Phase 2 enabler.

---

## Blocked / Parked

- Mobile white screen — needs device debugging before further mobile feature work
- Notebooks 09–11 — gated on notebook 08 completion and data volume (≥200 matched HRV × check-in rows)
- Story cards video export — requires EAS Build (not set up yet)
