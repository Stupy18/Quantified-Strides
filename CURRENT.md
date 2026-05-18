# CURRENT.md — Live Sprint State

> **Last updated:** 2026-05-19 (end of session)
> **Active research branch:** `research`
> **Rule:** Update this file at the end of every session. If it's stale, update it before starting work.

---

## Completed This Session

### Rec Engine v2.0 — Full Planning Epic (research branch)

All planning artifacts for the recommendation engine v2.0 are complete and committed to `research`.

**Stories 001–016 written and committed:**

| Wave | Stories | Scope |
|---|---|---|
| 1 | 001 | Schema foundation (18 new tables, 4 ALTER TABLE extensions) |
| 2 | 002 | Signal computation layer |
| 3 | 003, 007, 011 | Safety gates, competition calendar, background jobs |
| 4 | 004, 005 | Daily recommendation engine, CSP solver |
| 5 | 006, 008, 009, 010 | Running prescription, plan generator, injury management, female athlete protocol |
| UI | 012–016 | Dashboard surface — prescription card, readiness widget, running block, exercise suggestions + logging shortcuts, alerts migration |

**OpenSpec change:** `openspec/changes/rec-engine-v2/` — proposal, design, 57-task checklist, 11 domain specs.

PM job on rec engine: **done**. Dev team executes 001–016 in wave order.

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
