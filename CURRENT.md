# Current State — QuantifiedStrides

> **Last updated:** 2026-05-13 (end of session)
> **Active integration branch:** `dev`
> **Rule:** Update this file at the end of every session. If it's stale, update it before starting work.

---

## In Progress

| Item | Owner | Branch | Status | Notes |
|---|---|---|---|---|
| Mobile — Today tab | — | dev | Active | Wired to `/dashboard` API. UI built with mock data, API wiring done. Review needed. |
| Mobile — History tab | — | dev | Active | 90-day workout fetch implemented. |
| Mobile — white screen fix | — | dev | Blocked | Bundle compiles. White screen on device. Debug steps in `mobile/CLAUDE.md` → Known Issue. |
| Recommendation engine v2.0 | — | — | Prototype complete, impl not started | Prototype in `notebooks/07_rec_engine_prototype.ipynb`. Spec in `docs/RECOMMENDATION_PROTOCOL.md`. See §13 for build order. |
| Sleep readiness wiring | — | dev | Spec ready | `compute_sleep_readiness()` validated in notebook 06. Not wired into dashboard yet. |
| Research notebooks (08–11) | — | research | Not started | See `notebooks/BASELINE_ROADMAP.md` for priority order. |

---

## Next Up (ordered)

1. **Mobile white screen** — fix before adding more mobile features. Debug steps documented.
2. **Sleep readiness wiring** — self-contained, data-ready, high signal. Brief in `AGENTS.md`.
3. **Environmental response baseline** (notebook 08) — priority 1 in `BASELINE_ROADMAP.md`. Unblocks running economy trend.
4. **Plan-to-actual feedback loop** — prerequisite for all new signals in `recommend.py`. See `BASELINE_ROADMAP.md` §1 (Council Findings).
5. **Recommendation engine v2.0 implementation** — prototype validated; implementation start after plan-to-actual loop is live.

---

## Blocked

| Item | Blocked by |
|---|---|
| Running economy trend (notebook) | Environmental response baseline must come first |
| New signals wired into `recommend.py` | Plan-to-actual feedback loop not live |
| Zone calibration drift as hard modifier | 6+ months road data + plan-to-actual loop |
| ACWR personal safety zone | Injury tracking implementation + 12+ months data |

---

## Recently Completed

- **Notebook 07 — Recommendation engine prototype** — full runnable prototype of `RECOMMENDATION_PROTOCOL.md`. All 12 pipeline scenarios passing. Key validated design decisions:
  - Per-athlete HRV baseline stored in `user_profile` (`hrv_baseline_mean`, `hrv_baseline_sd`) — never rolling window
  - `establish_hrv_baseline()` filters to post-rest/easy readings (`preceding_trimp ≤ 50` or `None`) — continuous accumulation, no dedicated baseline week needed
  - `normalise_readiness()` converts 1-10 DB scale → 1-5 before aggregate formula
  - Short sleep hard cap: `< 6h sleep` cannot produce `'high'` readiness regardless of score ratio
  - `strength_block.timing`: `'after_run_3h_min'` or `'anytime'` based on aerobic sessions today
- **`docs/RECOMMENDATION_PROTOCOL.md` fully synced** — §3.4 updated to `preceding_trimp`-filtered baseline design; schema comments updated; all spec gaps closed
- **Mobile: Story cards** — 10 animated ephemeral cards, Today tab, Stories screen (24h TTL, no archive — disappearance is intentional product design)
- `docs/RECOMMENDATION_PROTOCOL.md` v2.0 — full engineering spec
- Sleep baseline notebook 06 — `compute_sleep_readiness()` validated
- Mobile: Me tab revamp + multi-sport selection screen
- Mobile: Load tab fully wired (ATL/CTL/TSB chart, ramp rate, workout history)
- Mobile: BodyFreshnessMap (camera-zoom, anatomical SVG, per-muscle freshness)
- Mobile: Today tab wired to `/dashboard` API
- Operating protocol: `PROTOCOL.md`, `CURRENT.md`, `WORKFLOW.md`, `AGENTS.md`, `TEAM_GUIDE.md`, `.claude/settings.json` (hooks) — committed to dev
- Notion wiki: 15+ pages built via API (Onboarding, Product, Research, Meetings, Operations)

---

## Open Decisions Needed

- **Who owns rec engine v2.0 implementation?** Assign before next sprint.
- **Mobile priority:** fix white screen now, or continue building tabs in parallel?
- **3 open spec questions (non-blocking):**
  - Q1: `LOAD_PCT` rest row — document source formula
  - Q2: Sport selection design decision (algorithmic vs bandit)
  - Q3: Confidence score formal definition

---

## Active Branches

| Branch | Purpose | Last active |
|---|---|---|
| `dev` | Integration — all feature PRs target here | Active |
| `research` | Data science notebooks | Active — notebook 07 committed 2026-05-13 |
| `main` | Production-ready | Stable |
