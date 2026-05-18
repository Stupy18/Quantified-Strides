# QuantifiedStrides — Team Guide

> How we work. Read this first, read it once, refer back when needed.

---

## The Big Idea

We run the company as a **human-directed, agent-executed** system.

That means: every person on the team operates as a technical director. You decide *what* to build and *why*. Agents handle the *how* — writing code, running research, reviewing PRs, generating changelogs.

The bottleneck is never speed of execution. The bottleneck is always the quality of the brief you hand to the agent. A well-written spec gets you production-ready output in one session. A vague one costs you a full day of back-and-forth.

**The one rule that makes this work:** if a decision isn't written down, it doesn't exist. The next session starts cold. Write everything down.

---

## Two Knowledge Layers

We have two places where knowledge lives. Knowing which to use is the first thing to get right.

### The Repo Docs — Technical Second Brain
Version-controlled with the code. Agents read these. Engineers update these.

| Document | What it is |
|---|---|
| `CLAUDE.md` | Full project context — stack, schema, how everything works |
| `CURRENT.md` | Live state — what's in progress, what's next, what's blocked |
| `PROTOCOL.md` | The operating manual |
| `WORKFLOW.md` | Branch rules, PR rules, commit conventions |
| `AGENTS.md` | Which agent for what + task spec template |
| `docs/DECISIONS.md` | WHY behind every algorithm and formula |

### The Wiki — Living Knowledge for the Team
Notion. Human-readable. Non-technical team members contribute here too.

| Section | What goes here |
|---|---|
| **Onboarding** | Start here, who owns what, setup guide |
| **Product** | Why we built X, target user, feature decisions, GTM phases |
| **Research** | Notebook findings in plain language, links back to notebooks/ |
| **Meetings** | Decisions made, action items, context for direction changes |
| **Operations** | Recurring processes, schedules |

**The boundary:** if a decision affects code or an algorithm, it also goes in `docs/DECISIONS.md` or `CLAUDE.md`. The wiki is not a substitute for repo docs — it's the human layer on top.

---

## The Documents You Need to Know (Repo)

There are five documents that matter day-to-day. Everything else is reference.

| Document | What it is | When to read it |
|---|---|---|
| **`CURRENT.md`** | What's in progress, what's next, what's blocked | Start of every session |
| **`PROTOCOL.md`** | How the company operates — the full rulebook | When you're unsure how to handle something |
| **`WORKFLOW.md`** | Branch strategy, PR rules, commit conventions | When touching code |
| **`AGENTS.md`** | Which agent for what + the task spec template | When starting any piece of work |
| **`CLAUDE.md`** | Full project context — stack, schema, architecture | When you need deep project knowledge |

You don't need to memorize these. You need to know they exist and where to find them.

---

## A Typical Session

### 1. Start: Get Context

Open `CURRENT.md`. This is your standup. It tells you:
- What's actively being worked on and by whom
- What's next in the queue
- What's blocked and why

If it looks stale (outdated dates, completed items still listed as in progress), update it before you start.

### 2. During: Write the Spec

Before touching code or opening an agent session, write a spec. Use the template in `AGENTS.md`:

```
## Task: <name>

### What
<Exact output — file name, function name, PR, report.>

### Why
<Why does this exist? What breaks without it?>

### Constraints
<What must not change. Hard rules. Files off-limits.>

### Context
- Files: <exact paths>
- Docs: <doc + section>
- Prior decisions: <quote or link>
- Depends on: <what must exist first>
```

This takes 5–10 minutes. It saves 2–3 hours of agent reruns.

### 3. Hand Off to Agent

Open Claude Code. Paste your spec. The agent has no memory of previous conversations — your spec is everything it knows.

For data science work, use the `/qs-research` skill instead of Claude Code directly.
For architecture decisions, use `/plan` before writing any code.

### 4. Review the Output

You review the *output* — not every line of code. Ask:
- Does the output match the spec?
- Does it violate any constraints?
- Does it need a `DECISIONS.md` update (if an algorithm changed)?

If the answer is wrong, redirect and update the spec. The updated spec is now better than before — save it.

### 5. End: Update `CURRENT.md`

Before closing the session:
- Move completed items from "In Progress" to "Recently Completed"
- Update "Next Up" if priorities shifted
- Note anything that got blocked and why
- If you corrected the agent on something, write that correction into memory (the agent will prompt you at session end)

The session-end checklist fires automatically in the terminal. Don't ignore it.

---

## The Most Important Skill: Writing Specs

The difference between a good agent output and a bad one is almost always the spec. Here's the pattern:

### Bad spec:
> "fix the dashboard loading issue"

The agent doesn't know which dashboard, which loading issue, what the expected behavior is, or what it's allowed to touch.

### Good spec:
> "The GET /dashboard endpoint returns a 500 when `sleep_sessions` has no rows for the user. Fix the null handling in `services/dashboard_service.py` around line 87. Expected behavior: return `sleep_summary: null` in the response instead of raising. Do not touch `api/v1/dashboard.py` — the fix is in the service layer only."

Same task. One gives the agent everything it needs. The other wastes a session.

**The test:** could a smart person who just joined the team today complete this task from the spec alone, without asking any questions? If yes, the spec is ready.

---

## Which Agent for What

| You need to... | Use |
|---|---|
| Build a feature or fix a bug | Claude Code (default) |
| Research a signal, model, or algorithm | `/qs-research` |
| Plan implementation before writing code | `/plan` |
| Review code before merging | `/review` |
| Review anything security-related | `/security-review` |
| Make a high-stakes architectural decision | `/council-review` |
| Generate a changelog before a release | `/changelog-generator` |
| Find where something is in the codebase | Explore agent |
| Set up a recurring automated task | `/schedule` |

---

## Branch Rules (Short Version)

```
main      ← production. never commit directly. Vlad merges here.
dev       ← integration. all your PRs go here.
research  ← data science notebooks. merges to dev when findings → code.
```

- Branch from `dev` for every feature or fix.
- Name it: `feature/short-name` or `fix/short-name`.
- One branch per logical unit of work.
- Delete after merge.

Full rules in `WORKFLOW.md`.

---

## What Requires Vlad's Sign-Off

Some things are not delegatable. Always get explicit approval before:

- Changing a formula or threshold (TRIMP weights, HRV cutoffs, decay constants)
- Any database migration that removes data
- Merging `dev` → `main`
- Changing the recommendation engine's output format
- Adding a new external service or API key
- Anything that affects all users' data at once

When in doubt: ask first, implement after.

---

## Schema Changes

If your work touches the database:

1. **Never edit** an existing file in `db/flyway/`. Flyway checksums them. Editing one breaks the stack for everyone.
2. Create a new file: `db/flyway/V{N}__description.sql` (next integer, double underscore).
3. Test it: `docker compose down -v && docker compose up -d`, watch the flyway service complete cleanly.
4. Include the migration file in your PR.

---

## Common Scenarios

### "I want to start a new feature."
1. Read `CURRENT.md` — is it in the queue? Is anything blocking it?
2. Write the spec (AGENTS.md template).
3. Check the escalation rules — does this need Vlad's sign-off?
4. Branch from `dev`: `git checkout -b feature/your-feature-name`
5. Open Claude Code, paste the spec.

### "The agent did something wrong."
1. Redirect clearly in the session.
2. After the session: write what went wrong as a feedback memory so it doesn't repeat.
3. Update the spec to close the gap that caused the problem.

### "I don't know where something is in the codebase."
Start with `CLAUDE.md` — the project structure section covers every file and what it does. For deeper exploration, ask Claude Code or use the Explore agent.

### "I need to make a data science or ML decision."
Use `/qs-research`. Write a research brief:
- Research question (specific, answerable)
- Data available (table names, columns, sample size)
- What we know so far (prior notebook findings)
- What decision this unblocks

### "I found something important that isn't documented anywhere."
Document it before moving on. Pick the right place:
- Algorithmic decision → `docs/DECISIONS.md`
- Architecture choice → `CLAUDE.md`
- Current work state → `CURRENT.md`
- How to do something → `WORKFLOW.md` or `AGENTS.md`

---

## Quick Reference

```
Start of session:       Read CURRENT.md
Before any task:        Write a spec (AGENTS.md template)
After any task:         Update CURRENT.md
Algorithm changed:      Update docs/DECISIONS.md
Schema changed:         New Flyway migration file
Agent corrected:        Save a feedback memory
Merging to main:        Vlad approves

Where to document what:
  Code / architecture → CLAUDE.md
  Algorithm / formula → docs/DECISIONS.md
  Current work        → CURRENT.md
  Process / workflow  → WORKFLOW.md or AGENTS.md
  Product decision    → Wiki (Notion) → Product
  Meeting outcome     → Wiki (Notion) → Meetings
  Research finding    → Wiki (Notion) → Research  +  link in notebooks/
  Onboarding info     → Wiki (Notion) → Onboarding
```

---

## Questions

If something isn't covered here, check `PROTOCOL.md` (the full rulebook) or `CLAUDE.md` (the full project context). If it's still not there, that's a gap — document the answer after you find it.

The docs improve every time someone uses them and finds something missing.