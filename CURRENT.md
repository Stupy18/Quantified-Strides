# Current State — QuantifiedStrides

> **Last updated:** 2026-05-12
> **Active integration branch:** `dev`
> **Rule:** Update this file at the end of every session. If it's stale, update it before starting work.

---

## In Progress

| Item | Owner | Branch | Status | Notes |
|---|---|---|---|---|
| Mobile — Today tab | — | dev | Active | Wired to `/dashboard` API. UI built with mock data, API wiring done. Review needed. |
| Mobile — History tab | — | dev | Active | 90-day workout fetch implemented. |
| Mobile — white screen fix | — | dev | Blocked | Bundle compiles. White screen on device. Debug steps in `mobile/CLAUDE.md` → Known Issue. |
| Recommendation engine v2.0 | — | — | Spec complete, not started | `docs/RECOMMENDATION_PROTOCOL.md` is the full spec. See §13 for build order. |
| Sleep readiness wiring | — | dev | Spec ready | `compute_sleep_readiness()` validated in notebook 06. Not wired into dashboard yet. |
| Research notebooks (07–11) | — | research | In progress | See `notebooks/BASELINE_ROADMAP.md` for priority order. |

---

## Next Up (ordered)

1. **Mobile white screen** — fix before adding more mobile features. Debug steps documented.
2. **Sleep readiness wiring** — self-contained, data-ready, high signal. Brief in `AGENTS.md`.
3. **Environmental response baseline** (notebook) — priority 1 in `BASELINE_ROADMAP.md`. Unblocks running economy trend.
4. **Plan-to-actual feedback loop** — prerequisite for all new signals in `recommend.py`. See `BASELINE_ROADMAP.md` §1 (Council Findings).
5. **Recommendation engine v2.0** — implementation start after plan-to-actual loop is live.

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

- `docs/RECOMMENDATION_PROTOCOL.md` v2.0 — full engineering spec
- Sleep baseline notebook 06 — `compute_sleep_readiness()` validated
- Mobile: Me tab revamp + multi-sport selection screen
- Mobile: Load tab fully wired (ATL/CTL/TSB chart, ramp rate, workout history)
- Mobile: BodyFreshnessMap (camera-zoom, anatomical SVG, per-muscle freshness)
- Mobile: Today tab wired to `/dashboard` API
- Protocols: `PROTOCOL.md`, `WORKFLOW.md`, `AGENTS.md`, `CURRENT.md` created

---

## Open Decisions Needed

- **Who owns rec engine v2.0 implementation?** Assign before next sprint.
- **Mobile priority:** fix white screen now, or continue building tabs in parallel?
- **Research notebooks 07–11:** which are actively running? Update this table.

---

## Active Branches

| Branch | Purpose | Last active |
|---|---|---|
| `dev` | Integration — all feature PRs target here | Active |
| `research` | Data science notebooks | Active — notebooks committed 2026-05-12 |
| `main` | Production-ready | Stable |