"""
seed_missing.py — Populate exercises, workout_metrics, and strength workouts.

Run from project root:
    python scripts/seed_missing.py
"""

import random
import math
from datetime import datetime, timedelta, date

import psycopg2

conn = psycopg2.connect(
    host="localhost", port=5432,
    dbname="quantifiedstrides",
    user="quantified", password="2026",
)
cur = conn.cursor()

cur.execute("SELECT user_id FROM users ORDER BY user_id LIMIT 1")
USER_ID = cur.fetchone()[0]
print(f"Seeding for user_id={USER_ID}")

# ── 1. EXERCISES ──────────────────────────────────────────────────────────────
print("\n[1/3] Inserting exercises...")

EXERCISES = [
    # name, movement, quality, primary, secondary, equipment, skill, bilateral, contraction, sys_fat, cns, joint_stress, sport_co, goal_co
    ("Pull-up",           "pull_v",  "strength",     ["lats","biceps"],         ["upper_back","rhomboids"],          ["bodyweight"],        "intermediate", True,  "controlled", 3, 3,
     {"shoulder":3,"elbow":2,"wrist":1},       {"climbing":5,"xc_mtb":3},    {"strength":4,"hypertrophy":4}),
    ("Bench Press",       "push_h",  "strength",     ["chest","triceps"],       ["front_delt","upper_back"],         ["barbell","bench"],   "intermediate", True,  "controlled", 3, 3,
     {"shoulder":3,"elbow":2,"wrist":2},       {"climbing":2},               {"strength":5,"hypertrophy":4}),
    ("Overhead Press",    "push_v",  "strength",     ["front_delt","triceps"],  ["upper_back","traps"],              ["barbell"],           "intermediate", True,  "controlled", 2, 3,
     {"shoulder":4,"elbow":2,"wrist":2},       {"climbing":3},               {"strength":4,"hypertrophy":3}),
    ("Barbell Row",       "pull_h",  "strength",     ["lats","upper_back"],     ["biceps","rhomboids"],              ["barbell"],           "intermediate", True,  "controlled", 3, 2,
     {"shoulder":2,"elbow":2,"lower_back":3},  {"climbing":4,"xc_mtb":2},   {"strength":4,"hypertrophy":4}),
    ("Squat",             "squat",   "strength",     ["quads","glutes"],        ["hamstrings","hip_flexors"],        ["barbell","rack"],    "intermediate", True,  "controlled", 4, 4,
     {"knee":4,"hip":3,"lower_back":3},        {"trail_run":4,"xc_mtb":3},  {"strength":5,"hypertrophy":4}),
    ("Romanian Deadlift", "hinge",   "strength",     ["hamstrings","glutes"],   ["lower_back","hip_flexors"],        ["barbell"],           "intermediate", True,  "controlled", 3, 3,
     {"knee":2,"hip":4,"lower_back":4},        {"trail_run":4,"xc_mtb":3},  {"strength":4,"hypertrophy":4}),
    ("Bulgarian Split Squat","squat","hypertrophy",  ["quads","glutes"],        ["hamstrings","hip_abductors"],      ["dumbbell","bench"],  "intermediate", False, "controlled", 3, 3,
     {"knee":4,"hip":3},                       {"trail_run":5,"xc_mtb":4},  {"strength":3,"hypertrophy":5}),
    ("Hip Thrust",        "hinge",   "hypertrophy",  ["glutes"],                ["hamstrings","hip_abductors"],      ["barbell","bench"],   "beginner",     True,  "controlled", 2, 2,
     {"hip":3,"lower_back":2},                 {"trail_run":4,"xc_mtb":3},  {"strength":3,"hypertrophy":5}),
    ("Leg Press",         "squat",   "hypertrophy",  ["quads","glutes"],        ["hamstrings"],                      ["machine"],           "beginner",     True,  "controlled", 3, 2,
     {"knee":3,"hip":2},                       {"trail_run":3,"xc_mtb":2},  {"strength":3,"hypertrophy":4}),
    ("Calf Raise",        "isolation","hypertrophy", ["calves"],                [],                                  ["bodyweight","machine"],"beginner",   True,  "controlled", 1, 1,
     {"ankle":2},                              {"trail_run":3},              {"hypertrophy":4}),
    ("Dumbbell Curl",     "isolation","hypertrophy", ["biceps"],                ["forearms"],                        ["dumbbell"],          "beginner",     False, "controlled", 1, 1,
     {"elbow":2,"wrist":1},                    {"climbing":3},               {"hypertrophy":4}),
    ("Tricep Pushdown",   "isolation","hypertrophy", ["triceps"],               [],                                  ["cable"],             "beginner",     True,  "controlled", 1, 1,
     {"elbow":2,"wrist":1},                    {},                           {"hypertrophy":4}),
    ("Face Pull",         "pull_h",  "stability",    ["rear_delt","rhomboids"], ["traps","upper_back"],              ["cable"],             "beginner",     True,  "controlled", 1, 1,
     {"shoulder":1,"elbow":1},                 {"climbing":3},               {"stability":4}),
    ("Plank",             "stability","stability",   ["abs","obliques"],        ["glutes","lower_back"],             ["bodyweight"],        "beginner",     True,  "isometric",  1, 1,
     {"lower_back":1},                         {"trail_run":2,"climbing":2}, {"stability":5}),
    ("Deadlift",          "hinge",   "strength",     ["hamstrings","glutes","lower_back"],["quads","traps"],         ["barbell"],           "advanced",     True,  "controlled", 5, 5,
     {"lower_back":5,"hip":4,"knee":3},        {"trail_run":3,"xc_mtb":2},  {"strength":5}),
    ("Incline Dumbbell Press","push_h","hypertrophy",["chest","front_delt"],   ["triceps"],                         ["dumbbell","bench"],  "intermediate", True,  "controlled", 2, 2,
     {"shoulder":3,"elbow":2},                 {},                           {"hypertrophy":4}),
    ("Lat Pulldown",      "pull_v",  "strength",     ["lats"],                  ["biceps","upper_back"],             ["cable","machine"],   "beginner",     True,  "controlled", 2, 2,
     {"shoulder":2,"elbow":2},                 {"climbing":4,"xc_mtb":2},   {"strength":3,"hypertrophy":4}),
    ("Dumbbell Row",      "pull_h",  "strength",     ["lats","upper_back"],     ["biceps","rhomboids"],              ["dumbbell","bench"],  "beginner",     False, "controlled", 2, 2,
     {"shoulder":2,"elbow":2},                 {"climbing":3},               {"strength":3,"hypertrophy":3}),
    ("Box Jump",          "plyo",    "power",        ["quads","glutes"],        ["calves","hamstrings"],             ["bodyweight","box"],  "intermediate", True,  "explosive",  3, 4,
     {"knee":4,"ankle":3},                     {"trail_run":4,"xc_mtb":3},  {"power":5}),
    ("Cable Woodchop",    "rotation","stability",    ["obliques","abs"],        ["glutes","upper_back"],             ["cable"],             "intermediate", False, "controlled", 2, 2,
     {"lower_back":2,"shoulder":2},            {"climbing":3},               {"stability":4}),
]

import json

for ex in EXERCISES:
    (name, movement, quality, primary, secondary, equipment,
     skill, bilateral, contraction, sys_fat, cns,
     joint_stress, sport_co, goal_co) = ex

    cur.execute("""
        INSERT INTO exercises (
            name, source, movement_pattern, quality_focus,
            primary_muscles, secondary_muscles, equipment,
            skill_level, bilateral, contraction_type,
            systemic_fatigue, cns_load,
            joint_stress, sport_carryover, goal_carryover
        ) VALUES (%s,'custom',%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                  CAST(%s AS jsonb), CAST(%s AS jsonb), CAST(%s AS jsonb))
        ON CONFLICT (name) DO NOTHING
    """, (
        name, movement, quality,
        primary, secondary, equipment,
        skill, bilateral, contraction,
        sys_fat, cns,
        json.dumps(joint_stress),
        json.dumps(sport_co),
        json.dumps(goal_co),
    ))

conn.commit()
print(f"  ✓ {len(EXERCISES)} exercises inserted")

# ── 2. WORKOUT_METRICS for running workouts ────────────────────────────────────
print("\n[2/3] Inserting workout_metrics for running workouts...")

cur.execute("""
    SELECT workout_id, sport, start_time, end_time,
           avg_heart_rate, training_volume, elevation_gain
    FROM workouts
    WHERE user_id = %s
      AND sport IN ('running', 'trail_running')
    ORDER BY workout_date
""", (USER_ID,))
running_workouts = cur.fetchall()

def simulate_run_metrics(workout_id, sport, start_dt, end_dt,
                          avg_hr, distance_m, elevation_gain):
    """Generate realistic per-5-second metric rows for a run."""
    if not start_dt or not end_dt:
        return []

    duration_s = int((end_dt - start_dt).total_seconds())
    if duration_s < 300:
        return []

    distance_m   = distance_m or 8000
    elevation_gain = elevation_gain or 0
    is_trail     = sport == "trail_running"
    avg_pace     = (duration_s / 60.0) / (distance_m / 1000.0)  # min/km
    avg_hr       = avg_hr or 140

    rows = []
    interval     = 5  # seconds between data points
    n_points     = duration_s // interval

    # State variables
    hr           = avg_hr - random.randint(10, 20)
    pace         = avg_pace * random.uniform(1.05, 1.15)
    cadence      = random.uniform(155, 165)
    altitude     = 300.0
    distance     = 0.0
    prev_alt     = altitude

    # Simulate terrain: elevation profile as sine wave for trail, gentle for road
    for i in range(n_points):
        t           = i / n_points   # 0 → 1 progress through run

        # HR rises through run (cardiac drift), noise
        hr_target   = avg_hr + (avg_hr * 0.08 * t) + random.gauss(0, 2)
        hr          = hr * 0.95 + hr_target * 0.05
        hr          = max(80, min(195, hr))

        # Pace: slight fatigue drift, terrain variation
        terrain_var = math.sin(t * math.pi * (8 if is_trail else 4)) * (0.3 if is_trail else 0.1)
        pace_target = avg_pace * (1 + terrain_var + t * 0.05)
        pace        = pace * 0.9 + pace_target * 0.1
        pace        = max(3.0, min(15.0, pace))

        # Cadence: slightly inversely related to pace
        cadence     = 170 - (pace - avg_pace) * 3 + random.gauss(0, 1.5)
        cadence     = max(140, min(200, cadence))

        # Altitude: rises and falls based on elevation_gain
        # Trail: multiple ups/downs; road: gentle roll
        if is_trail:
            alt_delta = math.sin(t * math.pi * 6) * (elevation_gain / 200)
        else:
            alt_delta = math.sin(t * math.pi * 2) * (elevation_gain / 400)
        altitude    = 300 + alt_delta + random.gauss(0, 0.5)

        # Distance: cumulative
        speed_ms    = 1000.0 / (pace * 60.0)
        distance   += speed_ms * interval

        # Gradient
        d_alt       = altitude - prev_alt
        d_dist      = speed_ms * interval
        gradient    = round(d_alt / d_dist * 100, 2) if d_dist > 0.5 else 0.0
        gradient    = max(-30, min(30, gradient))

        # Biomechanics (trail has higher GCT, lower stride length)
        gct         = (250 + pace * 8 + random.gauss(0, 5)) * (1.1 if is_trail else 1.0)
        vo          = 9.5 - pace * 0.3 + random.gauss(0, 0.3)   # mm
        vr          = vo / (1000 / (pace * 60.0) / cadence * 60) if pace > 0 and cadence > 0 else 8.0

        ts          = start_dt + timedelta(seconds=i * interval)

        rows.append((
            workout_id, ts,
            int(hr), round(pace, 3), round(cadence, 1),
            round(vo, 2), round(vr, 2), round(gct, 1),
            None,  # power (no power meter)
            46.7712 + random.gauss(0, 0.002),
            23.6236 + random.gauss(0, 0.002),
            round(altitude, 1),
            round(distance, 1),
            round(gradient, 2),
        ))
        prev_alt = altitude

    return rows

total_metrics = 0
for wid, sport, start_dt, end_dt, avg_hr, distance_m, elev_gain in running_workouts:
    rows = simulate_run_metrics(wid, sport, start_dt, end_dt,
                                avg_hr, distance_m, elev_gain)
    if not rows:
        continue

    cur.executemany("""
        INSERT INTO workout_metrics (
            workout_id, metric_timestamp,
            heart_rate, pace, cadence,
            vertical_oscillation, vertical_ratio, ground_contact_time,
            power, latitude, longitude, altitude, distance, gradient_pct
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT DO NOTHING
    """, rows)
    total_metrics += len(rows)

conn.commit()
print(f"  ✓ {total_metrics} metric rows for {len(running_workouts)} running workouts")

# ── 3. STRENGTH_TRAINING workouts (to link to logged sessions) ────────────────
print("\n[3/3] Inserting strength_training workouts for logged sessions...")

cur.execute("""
    SELECT session_id, session_date FROM strength_sessions
    WHERE user_id = %s
    ORDER BY session_date
""", (USER_ID,))
sessions = cur.fetchall()

inserted = 0
for session_id, session_date in sessions:
    # Check if workout already exists for this date + sport
    cur.execute("""
        SELECT workout_id FROM workouts
        WHERE user_id = %s AND workout_date = %s AND sport = 'strength_training'
    """, (USER_ID, session_date))
    if cur.fetchone():
        continue

    start_hour = random.randint(7, 11)
    start_dt   = datetime(session_date.year, session_date.month, session_date.day,
                          start_hour, random.randint(0, 45))
    duration   = random.randint(3000, 5400)  # 50-90 min
    end_dt     = start_dt + timedelta(seconds=duration)

    z2 = int(duration * 0.3)
    z3 = int(duration * 0.4)
    z4 = int(duration * 0.2)
    z1 = duration - z2 - z3 - z4

    cur.execute("""
        INSERT INTO workouts (
            user_id, sport, start_time, end_time, workout_type,
            calories_burned, avg_heart_rate, max_heart_rate,
            time_in_hr_zone_1, time_in_hr_zone_2, time_in_hr_zone_3,
            time_in_hr_zone_4, time_in_hr_zone_5,
            workout_date, training_stress_score,
            aerobic_training_effect, anaerobic_training_effect
        ) VALUES (%s,'strength_training',%s,%s,'Strength Training',
                  %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT (user_id, start_time) DO NOTHING
    """, (
        USER_ID, start_dt, end_dt,
        random.randint(250, 450),
        random.randint(110, 130), random.randint(145, 165),
        z1, z2, z3, z4, 0,
        session_date,
        round(random.uniform(40, 70), 1),
        round(random.uniform(2.0, 3.5), 1),
        round(random.uniform(0.5, 1.5), 1),
    ))
    inserted += 1

conn.commit()
print(f"  ✓ {inserted} strength_training workouts inserted")

# ── Done ──────────────────────────────────────────────────────────────────────
cur.close()
conn.close()

print("\n✅ Done! What's now populated:")
print("   - exercises table: 20 exercises with full taxonomy")
print("   - workout_metrics: per-second HR/pace/cadence/biomechanics for all runs")
print("   - strength_training workouts linked to logged sessions")
print("\n   Refresh the app — Running analytics and Strength sessions should now load.")