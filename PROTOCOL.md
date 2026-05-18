# QuantifiedStrides — Operating Protocol

> This is the operating manual for the company. Every person and every agent working on this project follows it.

---

## Philosophy

**Human-directed. Agent-executed.**

Every piece of execution work that can be specified clearly enough is delegated to an agent. Humans make direction decisions, architectural trade-offs, and judgment calls. Agents handle implementation, research, analysis, and routine operations.

The goal: every person on the team operates as a technical director, not an implementer. The bottleneck is always the quality of the spec, not the speed of execution.

---

## The Three Layers

### 1. Knowledge Layer — The Second Brain

Everything an agent needs to work effectively. If it isn't written here, it doesn't exist for the next session.

| Document | What it covers | Updated when |
|---|---|---|
| `CLAUDE.md` | Project truth — stack, schema, structure, what's built | After any significant structural change |
| `CURRENT.md` | Live state — in progress, next, blocked | **End of every session, no exceptions** |
| `PROTOCOL.md` | This document — operating manual | When the process changes |
| `WORKFLOW.md` | Dev workflow — branching, PRs, commits, migrations | When workflow rules change |
| `AGENTS.md` | Agent guide — which agent for what + task spec template | When new patterns emerge |
| `docs/DECISIONS.md` | WHY behind every algorithm and formula | After every algorithmic decision |
| `docs/RECOMMENDATION_PROTOCOL.md` | Recommendation engine full spec | Engineering spec owner, version-controlled |
| `notebooks/BASELINE_ROADMAP.md` | Research baselines — priority, data readiness, dependency chain | Research team, after each notebook |

**The core rule:** if a decision, direction change, or correction isn't written down, it doesn't exist. The next session starts cold.

### 1b. Wiki — Living Knowledge for the Team

The repo docs are the technical second brain — code-coupled, agent-readable, version-controlled. The **wiki** is the human layer: product context, meeting notes, research summaries translated for the whole team, onboarding.

**Platform:** Notion (free tier, supports all 6 team members)

**What lives in the wiki vs. the repo:**

| Content | Lives in | Why |
|---|---|---|
| Stack, schema, architecture, code structure | Repo (`CLAUDE.md`) | Must version-control with the code; agents need to read it |
| Algorithm decisions and formulas | Repo (`docs/DECISIONS.md`) | Code-coupled; agents reference it during implementation |
| Engineering spec (recommendation engine, etc.) | Repo (`docs/`) | Must travel with the codebase |
| **Product decisions** — why we built X, what problem it solves | **Wiki** | Non-technical audience; evolves separately from code |
| **Meeting notes** — decisions made, action items, context | **Wiki** | Ephemeral context; searchable history |
| **Onboarding** — team norms, who owns what, how to get set up | **Wiki** | Audience is humans, not agents |
| **Research findings** — notebook summaries translated for the team | **Wiki** | Technical findings in plain language; links back to repo notebooks |

**Wiki structure (Notion):**

```
QuantifiedStrides Wiki
├── Onboarding
│   ├── Start Here (links to this repo + key docs)
│   ├── Who Owns What
│   └── Setup Guide
├── Product
│   ├── Vision & Differentiation
│   ├── Target User
│   ├── Feature Decisions (why we built X)
│   └── GTM Phases
├── Research
│   └── Notebook Summaries (plain-language findings, links to notebooks/)
├── Meetings
│   └── {Date} — {Topic} (decisions made, action items)
└── Operations
    └── Recurring Processes
```

**The rule:** meeting decisions that affect code or architecture also get written into the relevant repo doc (DECISIONS.md or CLAUDE.md). The wiki is not a substitute for repo docs — it's a complement.

**Agent integration:** Claude can write to Notion via MCP (`connect-apps` skill). Use it to: write meeting summaries, translate research findings, draft product decision pages.

### 2. Execution Layer — Agents Do the Work

| Work type | Agent / Skill | Trigger |
|---|---|---|
| Feature development | Claude Code | Open session with `CURRENT.md` as starting context |
| Bug fixes | Claude Code | Error message + file path + expected behavior |
| Data science / ML | `/qs-research` | Any signal validation, HRV, ATL/CTL, Bayesian, ML, biomechanics question |
| Architecture planning | Plan mode (`/plan`) | Before any non-trivial implementation — alignment before code |
| Code review | `/review` | Before any merge to `dev` or `main` |
| Security review | `/security-review` | Any auth change, new data exposure, new external API |
| High-stakes decisions | `/council-review` | New algorithm, major architecture change, product direction |
| Changelog | `/changelog-generator` | Before every release |
| Codebase exploration | Explore agent | Finding files, tracing function usage, codebase mapping |

### 3. Oversight Layer — Humans Stay in the Loop

- Review outputs and direction, not code lines
- Every correction to an agent's approach → write it into the knowledge layer immediately
- Approve or redirect at PR / output level
- Merge to `main` is always a human action

---

## How Work Flows

```
Idea or task arises
        ↓
Write a spec (AGENTS.md template — four questions)
        ↓
Assign to agent (or human if judgment-intensive)
        ↓
Agent executes → produces output or PR
        ↓
Human reviews output
        ↓
Merge or redirect
        ↓
Update CURRENT.md + DECISIONS.md if applicable
```

No spec = no start. A task without a spec is a conversation, not work.

---

## Mandatory Session Rules

Non-negotiable. Every session:

1. **Start:** Read `CURRENT.md`. If it's stale, update it before doing anything else.
2. **During:** Any decision that redirects an agent → document it immediately (DECISIONS.md, inline comment, or memory).
3. **End:** Update `CURRENT.md`. Mark what moved, what's next, what's blocked.
4. **Algorithmic change:** Update `docs/DECISIONS.md` with the WHY.
5. **Schema change:** New Flyway migration file. Never touch committed migrations.
6. **Correction given to agent:** Save a feedback memory. Don't repeat the same correction next session.

---

## Escalation Rules

These require a human decision. Agents must not proceed alone:

- Changing a heuristic threshold (TRIMP weights, HRV z-scores, muscle decay constants) — requires sports science justification with data
- Any database migration that drops columns or tables
- Merging `dev` → `main`
- Changes to the recommendation engine output contract (`docs/RECOMMENDATION_PROTOCOL.md` §9)
- Wiring a new signal as a hard modifier in `recommend.py` — plan-to-actual loop must be live first
- New external service integrations (new API key, new third-party dependency)
- Pricing, legal, or user-facing copy changes
- Any change that affects all users' data (backfills, schema transformations)

---

## Team

6 people. Everyone follows this protocol regardless of role. When in doubt about whether something needs a human decision, default to asking.

When someone leaves the team, ensure their in-progress work has a spec written for it in `CURRENT.md` before they go. Knowledge lives in docs, not in heads.

---

## Communication Norms

- Significant decisions live in docs, not in messages. Messages are ephemeral; docs are the record.
- When you correct an agent's approach in conversation, write the correction into memory or docs before the session ends.
- If you discover something undocumented that should be, document it before moving on.
- `CURRENT.md` is the daily standup. Read it before asking "where are we?"