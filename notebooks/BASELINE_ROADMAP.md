# Baseline Roadmap — QuantifiedStrides

A personal sports scientist needs more than snapshots. It needs to know what is
normal for this person, how they are changing over time, and what they can handle.
This document maps out every baseline the app should eventually have, why it
matters, and what data it depends on.

**What's already built:**
- Aerobic profile — HR → speed, zone calibration, best efforts (`notebooks/03–04`)
- Biomechanical baseline — GAP speed → cadence / GCT / VO / VR (`notebook/05`)

---

## Category 1 — Adaptation Baselines
*How is the athlete changing over time?*

### Running Economy Trend
**What it is:** HR at a fixed GAP speed, tracked across weeks and months. If at
3.5 m/s GAP your mean HR was 158 bpm three months ago and is 147 bpm today,
that is measurable aerobic adaptation — the heart is delivering the same oxygen
at lower cost.

**Why it matters:** this is the longitudinal signal that tells you whether training
is working. Everything else in the app is a snapshot. Running economy trend is the
only metric that proves adaptation over time.

**Data status:** ready. `workout_metrics` + `workouts` already contain everything
needed.

**Prerequisite:** environmental response baseline (below). Heat adds 5–10 bpm of
cardiac drift at the same effort. Without controlling for temperature, a hot summer
session looks like fitness decline. That noise must be removed before the trend is
meaningful.

---

### Strength Progression Baseline
**What it is:** expected estimated 1RM per movement pattern at a given RPE, tracked
over time. A personal strength curve per lift category (push, pull, hinge, squat,
carry).

**Why it matters:** strength detraining is silent until it becomes injury. A baseline
makes it visible — when estimated 1RM on a movement drops below the personal norm
for that training phase, it signals accumulated fatigue, insufficient stimulus, or
the start of a deload. It also catches supercompensation peaks, which are the right
time to test a new max.

**Data status:** ready. `strength_sessions`, `strength_exercises`, `strength_sets`
are seeded and the 1RM calculation exists in `services/strength_service.py`.

**Prerequisite:** none. Can be built independently.

---

## Category 2 — Recovery Baselines
*How does the athlete bounce back?*

### Sleep Quality Baseline
**What it is:** personal norms for sleep duration, sleep score, deep sleep ratio,
and REM ratio. Not a population average — a personal normal for this athlete.

**Why it matters:** a sleep score of 68 is a red flag for one athlete and a normal
Tuesday for another. Without a personal baseline, the app can only compare to
population norms, which misses individual variation. The signal for next-day
readiness comes from the deviation from personal normal, not from the absolute score.

**Data status:** ready. `sleep_sessions` has duration, score, deep/REM hours.

**Prerequisite:** none. Low implementation cost, high signal quality.

---

### Recovery Rate Baseline
**What it is:** how quickly this athlete's HRV returns to their personal norm after
a hard session (TSB < −10 or TRIMP above 1.5× weekly average). Measured in hours
or days to return within 1σ of baseline HRV.

**Why it matters:** recovery rate is a fundamental individual characteristic. An
athlete who recovers in 24h can sustain higher training density than one who needs
48h. Knowing the personal recovery rate lets the recommendation engine be precise
about session spacing rather than using generic rules.

**Data status:** partial. Requires pairing hard sessions with subsequent HRV
readings across multiple training cycles. The data is accumulating but needs
enough hard session + recovery sequences to fit a reliable curve.

**Prerequisite:** HRV baseline (already implemented in `intelligence/recovery.py`).

---

## Category 3 — Load Tolerance Baseline
*What can this athlete handle?*

### ACWR Personal Safety Zone
**What it is:** the Acute:Chronic Workload Ratio range that is personally safe for
this athlete — the band between undertrained and overreached. The generic literature
range is 0.8–1.3, but this is population-level. Some athletes tolerate 1.5 without
issue; others get injured above 1.1.

**Why it matters:** the app currently uses the generic 0.8–1.3 danger zone. As
training history accumulates, the app can learn where this athlete has historically
been injured or sick relative to their ACWR, and tighten or relax the zone
accordingly.

**Data status:** requires historical injury/illness records against ACWR values.
The `injuries` table exists but is not yet populated. Needs 12+ months of
consistent training data to fit reliably.

**Prerequisite:** injury tracking implementation. Long data accumulation period.

---

## Category 4 — Contextual Baselines
*How does context affect performance?*

### Environmental Response Baseline
**What it is:** how this athlete's HR at a fixed GAP speed changes with temperature,
humidity, and heat index. The personal cardiac drift coefficient per degree above
the athlete's thermal comfort zone.

**Why it matters:** heat adds 5–10 bpm of cardiac drift at identical effort — but
the magnitude is personal and depends on acclimatisation. Without this baseline,
the running economy trend has seasonal noise that looks like fitness change but is
just weather. Environmental response must be characterised before any longitudinal
performance trend is trustworthy.

**Data status:** ready. `environment_data` has temperature, humidity, and UV per
session. `workout_metrics` has the HR and speed data to correlate against.

**Prerequisite:** none. Should be built before running economy trend.

---

## Priority Order

| Priority | Baseline | Data Ready | Prerequisite |
|---|---|---|---|
| 1 | Environmental response | ✓ | — |
| 2 | Running economy trend | ✓ | Environmental response |
| 3 | Strength progression | ✓ | — |
| 4 | Sleep quality personalisation | ✓ | — |
| 5 | ACWR personal safety zone | Partial | Injury tracking + time |
| 6 | Recovery rate | Partial | Time + hard session cycles |

Environmental response comes first because it unblocks running economy trend, which
is the highest-value longitudinal signal in the app. Strength and sleep can be
built in parallel — both are self-contained and data-ready.

---

## What Each Baseline Feeds Into

```
Environmental response ──→ Running economy trend
                       ──→ Biomechanical baseline (cleaner HR/speed signal)

Running economy trend  ──→ Zone calibration drift alert
                       ──→ Recommendation engine (training phase detection)

Strength progression   ──→ Recommendation engine (exercise selection)
                       ──→ Muscle fatigue model (load calibration)

Sleep quality          ──→ Recovery score
                       ──→ Next-day readiness prediction

ACWR safety zone       ──→ Injury risk alert
                       ──→ Load recommendation guardrails

Recovery rate          ──→ Session spacing recommendations
                       ──→ Taper/peak timing
```

---

## Completing the Module — Sport-Specific Gym Recommendations

The biomechanical baseline is only half the loop. Identifying that an athlete has
high GCT or poor VR is useful information but not actionable on its own. The module
is complete when the recommendation engine can translate biomechanical gaps into
targeted gym work — exercises selected specifically because they address the
mechanical deficits the baseline detected.

### The Missing Link

The current recommendation engine (`intelligence/recommend.py`) selects exercises
from the 797-exercise pool based on sport priority, training goal, muscle freshness,
and readiness. It does not yet know what the athlete's running mechanics look like
or what gym work would improve them.

The biomechanical baseline produces exactly the input it needs: a ranked list of
variables that are outside the efficient population range AND correlate with worse
VR for this athlete. This is the deficit profile — the bridge between analysis
and prescription.

### Biomechanical Deficit → Movement Pattern Mapping

Each biomechanical gap maps to a class of gym work that addresses its root cause.
These are not generic strength recommendations — they are mechanically specific:

| Deficit | Root cause | Gym prescription |
|---|---|---|
| High GCT (above population band) | Insufficient leg stiffness / elastic energy return | Plyometrics, calf raise progressions, depth jumps, ankle stiffness drills |
| High VR (poor efficiency) | Weak hip flexion drive / insufficient forward lean | Hip flexor strength, glute activation, single-leg RDL, banded hip flexion |
| Low cadence for effort level | Over-reliance on stride length / hip mobility limit | Hip flexor mobility, fast-feet drills, but primarily cadence-specific running drills |
| High VO (too much bounce) | Core instability / poor landing mechanics | Anti-rotation core work, single-leg stability, landing deceleration drills |
| High stance time asymmetry | Single-leg strength imbalance | Unilateral work: split squat, single-leg press, step-up progressions |

The deficit profile from the baseline determines which row(s) apply. Severity
(distance from population band in units of personal σ) determines priority — the
largest, most consistent deficit gets addressed first.

### What Needs to Be Built

**1. Deficit profile output from biomechanical baseline**

`intelligence/analytics/biomechanics_baseline.py` needs a function:
```python
def get_deficit_profile(baseline_result: dict) -> list[dict]:
    """
    Returns a ranked list of biomechanical gaps sorted by:
    - outside population reference (boolean)
    - distance from population band (in σ units)
    - VR efficiency correlation strength (|r|)

    Each entry: {variable, direction, severity, population_gap, vr_correlation}
    """
```

**2. Movement pattern tagging in the exercises table**

The 797-exercise pool already has `movement_pattern`, `quality_focus`,
`primary_muscles`, and `skill_level` columns. A new tag or quality_focus value
is needed to mark exercises as addressing specific biomechanical targets:
`running_gct`, `running_vr`, `running_cadence`, `running_vo`, `running_symmetry`.

This is a one-time labelling pass on the relevant exercises — a subset of the
pool, not all 797. Plyometric, single-leg, and hip-dominant exercises are the
primary candidates.

**3. Recommendation engine integration**

`intelligence/recommend.py` receives the deficit profile as an additional input
alongside HRV status, TSB, muscle freshness, and readiness. On days where the
recommendation is a gym session:

```python
if athlete.primary_sport includes 'running' and deficit_profile is not empty:
    prioritise exercises tagged for top deficit
    exclude exercises that load already-fatigued muscle groups
    apply existing freshness and readiness filters
    return running-specific gym session
```

The session structure follows the same volume/intensity logic already in place —
the deficit profile only influences exercise selection, not session load or
intensity zone.

**4. Feedback loop**

As new running sessions are synced, the biomechanical baseline recomputes. If a
targeted deficit improves (variable moves toward population band, σ tightens),
the recommendation engine shifts its exercise selection accordingly. If it doesn't
improve after 6–8 weeks of targeted work, the deficit is flagged as potentially
structural (requires technique coaching, not just strength work).

### Dependency Chain

```
Biomechanical baseline (notebook 05)
    ↓
Deficit profile function
    ↓
Exercise pool tagging (one-time labelling)
    ↓
Recommendation engine integration
    ↓
Feedback loop (baseline recomputes after each sync)
```

This is the completion condition for the running intelligence module. Without
the gym prescription loop, the baseline is diagnostic but not actionable. With
it, every running session that reveals a mechanical gap automatically informs
the next gym session.

---

## Council Findings — Additional Completion Requirements

*Validated by a 5-advisor LLM council (Contrarian, First Principles, Expansionist,
Outsider, Executor) + 5-reviewer peer review. These emerged as structural gaps in
what was already specced, not new features.*

---

### 1. Plan-to-Actual Feedback Loop (highest priority — build before anything else reaches recommend.py)

The recommendation engine outputs a planned session type and intensity zone. The
athlete may or may not follow it. The system currently has no mechanism to detect
the divergence. Tomorrow's recommendation is computed against the assumption that
today's prescription was followed. Every downstream modifier — fatigue accumulation,
zone drift, ACWR, biomechanical anomaly scoring — is computing against a fictional
training history when the athlete deviates.

**What to build:**
- Store `planned_session_type` and `planned_intensity_zone` in the recommendation
  output, persisted to the database
- Post-workout (after Garmin sync), compare against actual `sport`, `avg_hr_zone`,
  and duration from the synced workout
- Compute a divergence score (planned Z2, got Z3 = +1 zone; planned rest, trained =
  maximum divergence)
- Feed divergence score into next-day recommendation as a hard modifier
- Over time, the divergence history also reveals whether the recommendation engine
  is producing realistic plans — systematic divergence in one direction means the
  engine is miscalibrated, not that the athlete is non-compliant

**This is load-bearing for everything else.** Do not wire within-session fatigue
signature, zone drift, or any new biomechanical signal into `recommend.py` until
this loop is closed.

---

### 2. Signal State Persistence and Decay Rates

When the within-session fatigue signature fires, how long does that flag persist?
When zone drift is detected, does it retroactively requalify recent sessions? Without
explicit decay functions per signal, signals will contradict each other and the
athlete sees noise rather than insight. The existing muscle fatigue decay model has
explicit decay constants — all new biomechanical signals need the same treatment.

**Decay constants by physiological timescale:**

| Signal | Decay type | Half-life |
|---|---|---|
| Within-session fatigue flag | Time-based | 48–72h (CNS fatigue window) |
| Biomechanical session anomaly score | Time-based | 72–96h (musculoskeletal) |
| Zone calibration drift alert | Session-count-based | 10 new sessions |
| Equipment change boundary | Hard reset | No decay — full baseline recompute |

These are starting hypotheses, not validated constants. They should be treated as
configurable parameters and updated as longitudinal data accumulates.

---

### 3. Equipment and Context Change Tagging

New shoes shift GCT by 15–20ms. A training camp at altitude shifts HR baselines.
An illness recovery period changes HRV baselines. These are step-change events that
look like biomechanical anomalies but are not — they are context shifts that require
a baseline recomputation boundary, not an anomaly flag.

**What to build:**
- A simple user-facing event log in the profile or check-in flow: gear change,
  illness, travel, heat acclimatisation period, significant weight change
- Each logged event marks a recomputation boundary — sessions after the event are
  not compared against sessions before it
- The baseline stability gate (minimum 10 sessions) resets after a tagged event

---

### 4. Within-Session Fatigue Signature — Ship as Descriptive First

The council confirmed this should be built, but with an important constraint: **do
not wire it as a hard modifier into `recommend.py` immediately.** Compute and display
the stance time drift coefficient, cadence CV second-half vs first-half, and VR
elevation — but treat them as observational data, not decision inputs, for the first
60–90 days per athlete.

Empirical thresholds should be derived from each athlete's own variance distribution
after that accumulation period. The 1.5σ threshold used in the session-level baseline
is a reasonable starting hypothesis, not a validated trigger for intensity suppression.

Session type interaction must also be specified: high cadence CV on a Z2 easy run
is a neuromuscular fatigue signal; the same CV on an interval session is expected
variation. The fatigue scalar needs session-type-conditioned thresholds, not a
global scalar applied identically across all run types.

---

### 5. Zone Calibration Drift — Compute but Defer as Hard Modifier

The council raised a valid epistemic challenge: aerobic decoupling trend is
observable, but distinguishing "zones are stale" from "athlete is fatigued" from
"conditions were abnormal" requires outcome labels that don't exist in the dataset.
Computing and displaying the trend is valuable. Auto-suppressing intensity based on
it is premature until 3–6 months of labeled sessions confirm the signal separates
reliably from fatigue noise.

**Ship in two stages:**
1. Compute aerobic decoupling trend per athlete, display on the Running page as a
   directional indicator ("your aerobic efficiency has improved / stagnated / declined
   over the last 6 weeks")
2. Promote to hard modifier in `recommend.py` only after: (a) plan-to-actual loop
   is live, (b) the athlete has 6+ months of road running data, (c) empirical
   validation confirms the signal is not confounded by fatigue or environment

---

## Future Research Notebook

**Grade-biomechanics per-second curves** — athlete-specific correction curves for
how cadence, GCT, and VO shift with gradient at fixed GAP speed. Would make the
biomechanical baseline fully grade-neutral at the per-second level, not just at
the session average level. Build when any athlete reaches ≥ 150 road sessions
with full biomechanics coverage. See `IMPLEMENTATION_PROTOCOL.md` for full spec.
