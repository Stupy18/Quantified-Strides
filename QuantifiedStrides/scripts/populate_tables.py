"""
populate_tables.py — Populate realistic demo data for your user.

Run from project root:
    python scripts/populate_tables.py

Fills 90 days of:
  - workouts (trail run, XC MTB, bouldering, strength, cycling)
  - sleep_sessions
  - strength_sessions + exercises + sets
  - daily_readiness
  - workout_reflection
  - environment_data
"""

import random
import math
from datetime import date, datetime, timedelta

import psycopg2

# ── DB connection — matches your .env ────────────────────────────────────────
conn = psycopg2.connect(
    host="localhost",
    port=5432,
    dbname="quantifiedstrides",
    user="quantified",
    password="2026",
)
cur = conn.cursor()

# ── Find your user ────────────────────────────────────────────────────────────
cur.execute("SELECT user_id, email FROM users ORDER BY user_id LIMIT 1")
row = cur.fetchone()
if not row:
    print("No user found. Register first, then run this script.")
    conn.close()
    exit(1)

USER_ID = row[0]
print(f"Seeding data for user_id={USER_ID} ({row[1]})")

TODAY = date.today()
START = TODAY - timedelta(days=90)

# ── Helpers ───────────────────────────────────────────────────────────────────

def randf(lo, hi, dp=1):
    return round(random.uniform(lo, hi), dp)

def randi(lo, hi):
    return random.randint(lo, hi)

def jitter(base, pct=0.15):
    return base * (1 + random.uniform(-pct, pct))

# ── 1. SLEEP SESSIONS (90 days) ───────────────────────────────────────────────
print("Inserting sleep sessions...")

hrv_base = 52.0  # personal HRV baseline
rhr_base = 48

for i in range(90):
    d = START + timedelta(days=i)

    # Slowly drift HRV with noise — simulates real training response
    hrv_base += random.uniform(-1.5, 1.5)
    hrv_base  = max(38, min(70, hrv_base))
    overnight_hrv = round(jitter(hrv_base, 0.1), 1)

    rhr = randi(rhr_base - 3, rhr_base + 5)
    duration = randi(360, 510)  # 6–8.5h in minutes
    deep  = randi(60, 110)
    light = randi(140, 220)
    rem   = randi(80, 130)
    awake = randi(10, 40)
    duration = deep + light + rem + awake

    score = min(99, max(40, int(
        60
        + (overnight_hrv - 40) * 0.6
        + (rhr_base - rhr) * 1.2
        + (duration - 380) * 0.06
        + random.uniform(-8, 8)
    )))

    hrv_status = (
        "BALANCED" if abs(overnight_hrv - hrv_base) < 5
        else "LOW" if overnight_hrv < hrv_base - 5
        else "HIGH"
    )

    feedbacks = [
        "POSITIVE_RECOVERING", "POSITIVE_RESTORATIVE",
        "NEUTRAL_BALANCED", "NEGATIVE_POOR_SLEEP",
        "POSITIVE_TRAINING_ADAPTED",
    ]
    feedback = random.choices(
        feedbacks,
        weights=[30, 25, 25, 10, 10]
    )[0]

    batt_change = randi(20, 55) if score >= 70 else randi(-10, 25)

    cur.execute("""
        INSERT INTO sleep_sessions (
            user_id, sleep_date, duration_minutes, sleep_score,
            hrv, rhr,
            time_in_deep, time_in_light, time_in_rem, time_awake,
            avg_sleep_stress, sleep_score_feedback, sleep_score_insight,
            overnight_hrv, hrv_status, body_battery_change
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT (user_id, sleep_date) DO NOTHING
    """, (
        USER_ID, d, duration, score,
        overnight_hrv, rhr,
        deep, light, rem, awake,
        randf(15, 35), feedback, "GOOD",
        overnight_hrv, hrv_status, batt_change,
    ))

conn.commit()
print(f"  ✓ {90} sleep sessions")

# ── 2. WORKOUTS (3–5x/week) ───────────────────────────────────────────────────
print("Inserting workouts...")

SPORTS = [
    ("trail_running",   "Trail Run",        90, 140, 600, 900,  True),
    ("cycling",         "Z2 Bike",          80, 130, 3600, 7200, True),
    ("mountain_biking", "XC MTB",           100, 155, 3600, 5400, True),
    ("bouldering",      "Bouldering",       100, 150, 4800, 7200, False),
    ("running",         "Easy Run",         75,  130, 1800, 3600, True),
    ("hiking",          "Hike",             80,  130, 5400, 10800, True),
    ("indoor_cycling",  "Trainer Ride",     85,  140, 3600, 5400, True),
]

workout_ids = {}  # date → workout_id (for linking env data + reflections)

# Generate a training schedule — ~4 days on, 1 rest, weighted by sport
training_days = []
d = START
while d <= TODAY:
    # Skip ~25% of days as rest days — cluster rest days realistically
    if random.random() > 0.28:
        training_days.append(d)
    d += timedelta(days=1)

# Remove consecutive 4+ day blocks occasionally for realism
filtered = []
streak = 0
for d in training_days:
    if filtered and (d - filtered[-1]).days == 1:
        streak += 1
    else:
        streak = 1
    if streak <= 4 or random.random() > 0.6:
        filtered.append(d)
training_days = filtered

for d in training_days:
    sport_row = random.choices(SPORTS, weights=[15, 20, 15, 15, 10, 5, 10])[0]
    sport, wtype, hr_lo, hr_hi, dur_lo, dur_hi, has_gps = sport_row

    start_hour = randi(6, 10)
    start_dt   = datetime(d.year, d.month, d.day, start_hour, randi(0, 45))
    duration   = randi(dur_lo, dur_hi)
    end_dt     = start_dt + timedelta(seconds=duration)

    avg_hr  = randi(hr_lo, hr_hi)
    max_hr  = min(195, avg_hr + randi(15, 30))
    z1 = int(duration * randf(0.05, 0.15))
    z2 = int(duration * randf(0.30, 0.50))
    z3 = int(duration * randf(0.15, 0.30))
    z4 = int(duration * randf(0.05, 0.15))
    z5 = max(0, duration - z1 - z2 - z3 - z4)

    distance = None
    if sport in ("trail_running", "running"):
        distance = randf(5000, 20000)
    elif sport in ("cycling", "mountain_biking", "indoor_cycling"):
        distance = randf(20000, 80000)
    elif sport == "hiking":
        distance = randf(8000, 25000)

    tss = round((duration / 3600) * randf(40, 90), 1)

    cur.execute("""
        INSERT INTO workouts (
            user_id, sport, start_time, end_time, workout_type,
            calories_burned, avg_heart_rate, max_heart_rate,
            time_in_hr_zone_1, time_in_hr_zone_2, time_in_hr_zone_3,
            time_in_hr_zone_4, time_in_hr_zone_5,
            training_volume, workout_date,
            training_stress_score,
            elevation_gain, elevation_loss,
            aerobic_training_effect, anaerobic_training_effect,
            start_latitude, start_longitude, location
        ) VALUES (
            %s,%s,%s,%s,%s,
            %s,%s,%s,
            %s,%s,%s,%s,%s,
            %s,%s,%s,%s,%s,%s,%s,%s,%s,%s
        )
        ON CONFLICT (user_id, start_time) DO NOTHING
        RETURNING workout_id
    """, (
        USER_ID, sport, start_dt, end_dt, wtype,
        randi(300, 900), avg_hr, max_hr,
        z1, z2, z3, z4, z5,
        distance, d,
        tss,
        randf(100, 800) if has_gps else None,
        randf(80, 750)  if has_gps else None,
        randf(2.5, 4.5), randf(0.5, 2.5),
        46.7712 + randf(-0.05, 0.05) if has_gps else None,
        23.6236 + randf(-0.05, 0.05) if has_gps else None,
        "Cluj-Napoca" if has_gps else None,
    ))
    result = cur.fetchone()
    if result:
        workout_ids[d] = result[0]

conn.commit()
print(f"  ✓ {len(workout_ids)} workouts")

# ── 3. STRENGTH SESSIONS ──────────────────────────────────────────────────────
print("Inserting strength sessions...")

UPPER_EXERCISES = [
    ("Pull-up",             [3, 4], [6, 10],  None, False),
    ("Bench Press",         [3, 4], [5, 8],   80.0, False),
    ("Barbell Row",         [3, 4], [6, 8],   70.0, False),
    ("Overhead Press",      [3, 4], [5, 8],   50.0, False),
    ("Dumbbell Curl",       [2, 3], [8, 12],  15.0, True),
    ("Tricep Pushdown",     [2, 3], [10, 15], None, False),
    ("Face Pull",           [3, 3], [12, 15], None, False),
]
LOWER_EXERCISES = [
    ("Squat",               [4, 4], [5, 8],   100.0, False),
    ("Romanian Deadlift",   [3, 4], [8, 10],  80.0,  False),
    ("Bulgarian Split Squat",[3,3], [8, 10],  20.0,  True),
    ("Leg Press",           [3, 3], [10, 12], None,  False),
    ("Calf Raise",          [3, 3], [15, 20], None,  False),
    ("Hip Thrust",          [3, 3], [10, 12], 80.0,  False),
]

# Pick ~2x/week gym days that don't already have a workout
all_days = [START + timedelta(days=i) for i in range(90)]
available = [d for d in all_days if d not in workout_ids]
gym_days  = sorted(random.sample(available, min(24, len(available))))

last_type = "lower"
for d in gym_days:
    session_type = "upper" if last_type == "lower" else "lower"
    last_type    = session_type

    cur.execute("""
        INSERT INTO strength_sessions (user_id, session_date, session_type)
        VALUES (%s, %s, %s)
        ON CONFLICT (user_id, session_date) DO NOTHING
        RETURNING session_id
    """, (USER_ID, d, session_type))
    result = cur.fetchone()
    if not result:
        continue
    session_id = result[0]

    exercises = UPPER_EXERCISES if session_type == "upper" else LOWER_EXERCISES
    chosen    = random.sample(exercises, min(5, len(exercises)))

    for order, (name, set_range, rep_range, base_weight, per_hand) in enumerate(chosen, 1):
        cur.execute("""
            INSERT INTO strength_exercises (session_id, exercise_order, name)
            VALUES (%s, %s, %s)
            RETURNING exercise_id
        """, (session_id, order, name))
        ex_id  = cur.fetchone()[0]
        n_sets = randi(*set_range)

        for s in range(1, n_sets + 1):
            reps = randi(*rep_range)
            if base_weight:
                # Progressive overload — small week-over-week increase
                week   = (d - START).days // 7
                weight = round(base_weight + week * randf(0, 1.25), 2)
                total  = weight * 2 if per_hand else weight
                cur.execute("""
                    INSERT INTO strength_sets (
                        exercise_id, set_number, reps,
                        weight_kg, is_bodyweight, per_hand, total_weight_kg
                    ) VALUES (%s,%s,%s,%s,%s,%s,%s)
                """, (ex_id, s, reps, weight, False, per_hand, total))
            else:
                cur.execute("""
                    INSERT INTO strength_sets (
                        exercise_id, set_number, reps, is_bodyweight
                    ) VALUES (%s,%s,%s,%s)
                """, (ex_id, s, reps, True))

conn.commit()
print(f"  ✓ {len(gym_days)} strength sessions")

# ── 4. DAILY READINESS ────────────────────────────────────────────────────────
print("Inserting daily readiness...")

for i in range(90):
    d = START + timedelta(days=i)
    yesterday = d - timedelta(days=1)
    trained_yesterday = yesterday in workout_ids

    # Legs feel worse after leg-heavy days
    legs_base = 6 if trained_yesterday else 8
    cur.execute("""
        INSERT INTO daily_readiness (
            user_id, entry_date,
            overall_feel, legs_feel, upper_body_feel, joint_feel,
            time_available, going_out_tonight
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT (user_id, entry_date) DO NOTHING
    """, (
        USER_ID, d,
        randi(max(4, legs_base - 1), min(10, legs_base + 2)),
        randi(max(3, legs_base - 2), min(10, legs_base + 1)),
        randi(5, 10),
        randi(5, 10),
        random.choice(["short", "medium", "medium", "long"]),
        random.random() < 0.15,
    ))

conn.commit()
print(f"  ✓ 90 readiness entries")

# ── 5. WORKOUT REFLECTIONS ────────────────────────────────────────────────────
print("Inserting workout reflections...")

for d, wid in workout_ids.items():
    cur.execute("""
        INSERT INTO workout_reflection (
            user_id, entry_date, session_rpe, session_quality, load_feel, notes
        ) VALUES (%s,%s,%s,%s,%s,%s)
        ON CONFLICT (user_id, entry_date) DO NOTHING
    """, (
        USER_ID, d,
        randi(5, 9),
        randi(6, 10),
        random.choice([-1, 0, 0, 0, 1]),
        random.choice([
            "Felt good, legs responsive.",
            "A bit heavy today but got through it.",
            "Strong session, hit all targets.",
            "Tired from yesterday but manageable.",
            None, None,
        ]),
    ))

conn.commit()
print(f"  ✓ {len(workout_ids)} reflections")

# ── 6. ENVIRONMENT DATA ───────────────────────────────────────────────────────
print("Inserting environment data...")

for d, wid in list(workout_ids.items())[:60]:  # last 60 workouts
    cur.execute("""
        INSERT INTO environment_data (
            workout_id, record_datetime, location,
            temperature, wind_speed, wind_direction, humidity,
            precipitation, uv_index,
            grass_pollen, tree_pollen, weed_pollen
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT DO NOTHING
    """, (
        wid,
        datetime(d.year, d.month, d.day, 8, 0),
        "Cluj-Napoca",
        randf(2, 22),
        randf(0, 6),
        randi(0, 360),
        randi(40, 85),
        randf(0, 2) if random.random() < 0.3 else 0,
        randf(1, 8),
        randf(0, 40),
        randf(0, 60),
        randf(0, 20),
    ))

conn.commit()
print(f"  ✓ environment data")

# ── Done ──────────────────────────────────────────────────────────────────────
cur.close()
conn.close()

print()
print("✅ Seed complete! Refresh the app to see your data.")
print("   Dashboard should now show ATL/CTL/TSB, HRV trend, sleep history,")
print("   muscle freshness heatmap, and workout history.")