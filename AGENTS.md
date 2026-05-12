# Agent Guide — QuantifiedStrides

> How to use AI agents effectively. Read this before starting any piece of work.

---

## Which Agent for What

| Work type | Agent / Skill | Notes |
|---|---|---|
| Feature development | Claude Code (default) | Always start with `CURRENT.md` context |
| Bug investigation | Claude Code | Paste: error + file path + expected behavior |
| Data science / ML research | `/qs-research` | Signal validation, HRV, ATL/CTL, Bayesian, biomechanics, ML pipelines |
| Architecture planning | Plan mode | Run `/plan` *before* touching code. Never implement without alignment. |
| Code review | `/review` | Before any merge to `dev` or `main` |
| Security review | `/security-review` | Auth changes, new external APIs, data exposure |
| High-stakes decisions | `/council-review` | New algorithms, major architecture changes, product direction pivots |
| Changelog | `/changelog-generator` | Before every release |
| Codebase exploration | Explore agent | Finding files, tracing function usage, codebase mapping |
| Scheduled / recurring work | `/schedule` | Daily standups, weekly reviews, automated reports |

---

## The Task Spec Template

**No spec = no start.** Copy this template for every piece of work handed to an agent.

```
## Task: <short name>

### What
<Exact output: function name and file, PR, analysis report, document. Be specific.>

### Why
<Why does this need to exist? What problem does it solve? What breaks if not done?>

### Constraints
<What must NOT change? Hard rules? Files that are off-limits?>
<Quote DECISIONS.md or RECOMMENDATION_PROTOCOL.md sections if relevant.>

### Context
- Files: <exact file paths — no "the dashboard", name the file>
- Docs: <doc name + section number>
- Prior decisions: <quote or link the decision — don't assume the agent knows>
- Depends on: <what must exist first>
- Must NOT: <explicit exclusions — agents fill gaps with defaults; close them>
```

---

## Example: Good Spec

```
## Task: wire compute_sleep_readiness into dashboard

### What
Add `sleep_readiness: float | None` to the GET /dashboard response.
Computed by `compute_sleep_readiness()` in `intelligence/recovery.py`.
Appears under the `recovery` key in the response schema.

### Why
Notebook 06 validated the function. It's unused. The recommendation engine
needs it as a recovery signal (RECOMMENDATION_PROTOCOL.md §3 — signal assembly).

### Constraints
- Do NOT modify `compute_sleep_readiness()` — it's validated and frozen.
- Value must be nullable: users with < 7 days of sleep data return None.
- No new SQL queries — use existing `sleep_repo` methods only.
- Do not change the recommendation engine itself — only expose the score on dashboard.

### Context
- Files: `intelligence/recovery.py`, `services/dashboard_service.py`,
         `repos/sleep_repo.py`, `models/dashboard.py`, `api/v1/dashboard.py`
- Docs: RECOMMENDATION_PROTOCOL.md §3.1 (signal nullability rules)
- Prior decisions: DECISIONS.md → HRV Analysis (baseline and deviation logic)
- Depends on: nothing — self-contained
- Must NOT: touch `intelligence/recommend.py` in this task
```

---

## Example: Bad Spec

```
"wire sleep readiness into the dashboard"
```

This forces the agent to guess files, constraints, and scope. Every ambiguous spec costs an entire session of corrections and reruns.

---

## Rules for Writing Agent Briefs

An agent has no memory of prior conversations. The brief must contain everything.

1. **Name exact files.** Not "the dashboard" — `services/dashboard_service.py`.
2. **Quote constraints.** Not "follow the existing pattern" — describe the pattern explicitly.
3. **Link decisions.** Not "we decided X before" — paste the decision or the doc section.
4. **Close the gaps explicitly.** State what NOT to do. Agents fill ambiguity with defaults.
5. **State the output format.** Not "add a feature" — "add field X of type Y to response schema Z."

---

## Research Mode (`/qs-research`)

Use for: signal validation, HRV, ATL/CTL/TSB/ACWR, muscle fatigue modeling, Isolation Forest, Bayesian Banister, MCMC, hierarchical Bayes, recommendation engine ML design, Garmin feature engineering, small-sample reliability, biomechanics analysis.

The research team is a multi-agent council: PI + SDS (Sports Data Scientist) + MBE (ML/Bayesian Engineer) + EP (Exercise Physiologist) + SC (Scientific Critic). Output is validated findings, not quick answers.

**Brief format for research:**

```
Research question: <specific, falsifiable — can be answered yes/no or with a number>
Data available: <table names, column names, approximate sample size>
What we know: <prior notebook findings, relevant DECISIONS.md sections>
What this unblocks: <what changes in the codebase if the answer is X vs Y>
Constraints: <what the answer must be compatible with — existing formulas, thresholds>
```

---

## Plan Mode (`/plan`)

Use before any non-trivial implementation. Plan mode produces a step-by-step implementation plan without touching code.

When to always use plan mode:
- Any change to `intelligence/recommend.py`
- Any new table or schema change
- Any change to the recommendation engine output contract
- Any new ingestion pipeline
- Multi-file refactors

When plan mode is optional:
- Self-contained single-file additions
- Bug fixes with obvious root cause
- Wiring functions that already exist (low risk)

---

## Memory Hygiene — The Reflex

After every session, before closing:

- **Correction given to agent** → save a feedback memory immediately
- **Approach confirmed to work well** → save a feedback memory (positive patterns matter)
- **Direction changed** → update `CURRENT.md` + relevant spec doc
- **New architectural decision** → update `docs/DECISIONS.md`

Memory that lives only in conversation history evaporates. A correction you give today will need to be given again next session if it isn't written down.

---

## Agent Briefing Checklist

Before handing a task to an agent, confirm:

- [ ] The four spec questions are answered (What / Why / Constraints / Context)
- [ ] Exact file paths are named
- [ ] The relevant DECISIONS.md or RECOMMENDATION_PROTOCOL.md sections are referenced
- [ ] `CURRENT.md` has been read and reflects the current state
- [ ] Any prerequisite work is confirmed done (check CURRENT.md Blocked section)
- [ ] The escalation rules in PROTOCOL.md have been checked — does this need a human decision?