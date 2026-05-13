import AsyncStorage from '@react-native-async-storage/async-storage'
import { TrainingHistoryPoint, WorkoutListItem } from '../api/endpoints/training'
import { BiomechanicsPoint } from '../api/endpoints/running'
import { SleepTrendPoint } from '../api/endpoints/sleep'
import { StrengthSession } from '../api/endpoints/strength'

const STORAGE_KEY = 'qs_story_moments'
const TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

export type CardType =
  | 'form_fresh'
  | 'week_in_numbers'
  | 'new_pr'
  | 'nervous_system'
  | 'fitness_trajectory'
  | 'run_decoded'
  | 'iron_session'
  | 'body_ready'
  | 'sleep_arch'
  | 'month_review'

export interface StoryMoment {
  id: string
  type: CardType
  generatedAt: number
  expiresAt: number
  payload: Record<string, unknown>
}

// ─── Storage helpers ───────────────────────────────────────────────────────

async function loadMoments(): Promise<StoryMoment[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

async function saveMoments(moments: StoryMoment[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(moments))
}

/** Remove expired moments. Call on every app open. */
export async function purgeExpiredMoments(): Promise<void> {
  const all = await loadMoments()
  const active = all.filter((m) => m.expiresAt > Date.now())
  await saveMoments(active)
}

/** Return only active (non-expired) moments. */
export async function getActiveMoments(): Promise<StoryMoment[]> {
  await purgeExpiredMoments()
  return loadMoments()
}

// ─── Trigger evaluation ────────────────────────────────────────────────────

interface TriggerInput {
  dashboard: any
  trainingHistory: TrainingHistoryPoint[]
  recentWorkouts: WorkoutListItem[]
  biomechanics: BiomechanicsPoint[]
  sleepTrends: SleepTrendPoint[]
  strengthSessions: StrengthSession[]
}

function makeId(type: CardType): string {
  return `${type}_${Date.now()}`
}

function makeMoment(type: CardType, payload: Record<string, unknown>): StoryMoment {
  const now = Date.now()
  return { id: makeId(type), type, generatedAt: now, expiresAt: now + TTL_MS, payload }
}

export async function evaluateTriggers(input: TriggerInput): Promise<void> {
  const active = await getActiveMoments()
  const activeTypes = new Set(active.map((m) => m.type))
  const newMoments: StoryMoment[] = []

  const tl = input.dashboard?.training_load
  const hrv = input.dashboard?.hrv_status
  const sleep = input.dashboard?.sleep
  const readiness = input.dashboard?.readiness
  const recentLoad = input.dashboard?.recent_load

  // 1. Form is Fresh — TSB turned positive after 3+ days negative
  if (!activeTypes.has('form_fresh') && tl?.tsb > 0) {
    const recentTSB = input.trainingHistory.slice(-4, -1).map((p) => p.tsb)
    const wasFreshBefore = recentTSB.some((v) => v > 0)
    if (!wasFreshBefore && recentTSB.length >= 3) {
      newMoments.push(makeMoment('form_fresh', {
        tsb: tl.tsb, ctl: tl.ctl, atl: tl.atl,
        history: input.trainingHistory.slice(-42).map((p) => ({ date: p.date, tsb: p.tsb })),
      }))
    }
  }

  // 2. This Week in Numbers — Sunday, ≥3 workouts this week
  if (!activeTypes.has('week_in_numbers')) {
    const today = new Date()
    const isSunday = today.getDay() === 0
    const weekWorkouts = input.recentWorkouts.filter((w) => {
      const d = new Date(w.workout_date)
      const daysAgo = (today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
      return daysAgo <= 7
    })
    if (isSunday && weekWorkouts.length >= 3) {
      const totalMin = weekWorkouts.reduce((s, w) => s + (w.duration_s ?? 0) / 60, 0)
      const totalKm = weekWorkouts.reduce((s, w) => s + (w.distance_m ?? 0) / 1000, 0)
      const sports = [...new Set(weekWorkouts.map((w) => w.sport))]
      newMoments.push(makeMoment('week_in_numbers', {
        sessions: weekWorkouts.length, totalMin: Math.round(totalMin),
        totalKm: Math.round(totalKm * 10) / 10, sports,
        recentLoad: recentLoad?.by_sport ?? [],
      }))
    }
  }

  // 3. Nervous System — |deviation| > 1.5
  if (!activeTypes.has('nervous_system') && hrv?.deviation != null) {
    if (Math.abs(hrv.deviation) > 1.5) {
      newMoments.push(makeMoment('nervous_system', {
        lastHrv: hrv.last_hrv, baseline: hrv.baseline,
        deviation: hrv.deviation, status: hrv.status, trend: hrv.trend,
      }))
    }
  }

  // 4. Fitness Trajectory — CTL rising for 2+ consecutive weeks
  if (!activeTypes.has('fitness_trajectory') && input.trainingHistory.length >= 14) {
    const hist = input.trainingHistory
    const last7Avg = hist.slice(-7).reduce((s, p) => s + p.ctl, 0) / 7
    const prev7Avg = hist.slice(-14, -7).reduce((s, p) => s + p.ctl, 0) / 7
    const prev14Avg = hist.slice(-21, -14).reduce((s, p) => s + p.ctl, 0) / 7
    if (last7Avg > prev7Avg && prev7Avg > prev14Avg) {
      newMoments.push(makeMoment('fitness_trajectory', {
        currentCtl: tl?.ctl, rampRate: tl?.ramp_rate,
        history: hist.slice(-42).map((p) => ({ date: p.date, ctl: p.ctl })),
      }))
    }
  }

  // 5. Run Decoded — most recent run >30 min with biomechanics data
  if (!activeTypes.has('run_decoded') && input.biomechanics.length > 0) {
    const lastRun = input.biomechanics[0]
    const matchingWorkout = input.recentWorkouts.find(
      (w) => w.workout_id === lastRun.workout_id
    )
    const durationMin = (matchingWorkout?.duration_s ?? 0) / 60
    if (durationMin > 30 && lastRun.avg_cadence != null) {
      newMoments.push(makeMoment('run_decoded', {
        cadence: lastRun.avg_cadence, gct: lastRun.avg_gct,
        vo: lastRun.avg_vo, hrDrift: lastRun.hr_drift_pct,
        fatigue: lastRun.fatigue_score, date: lastRun.workout_date,
      }))
    }
  }

  // 6. Iron Session — strength session with ≥3 exercises in last 7 days
  if (!activeTypes.has('iron_session') && input.strengthSessions.length > 0) {
    const recent = input.strengthSessions.find((s) => {
      const daysAgo =
        (Date.now() - new Date(s.session_date).getTime()) / (1000 * 60 * 60 * 24)
      return daysAgo <= 7 && s.total_exercises >= 3
    })
    if (recent) {
      newMoments.push(makeMoment('iron_session', {
        sessionDate: recent.session_date, sessionType: recent.session_type,
        totalSets: recent.total_sets, totalExercises: recent.total_exercises,
        exercises: recent.exercises?.map((e) => e.name) ?? [],
      }))
    }
  }

  // 7. Body Ready — check-in submitted today with overall readiness ≥ 4/5
  if (!activeTypes.has('body_ready') && readiness?.overall_feel >= 4) {
    const checkinToday = readiness?.date === new Date().toISOString().slice(0, 10)
    if (checkinToday) {
      newMoments.push(makeMoment('body_ready', {
        overallFeel: readiness.overall_feel, legs: readiness.legs,
        upper: readiness.upper, joints: readiness.joints,
        muscles: input.dashboard?.muscle_freshness?.muscles ?? {},
      }))
    }
  }

  // 8. Sleep Architecture — 7 consecutive nights, avg score ≥ 75
  if (!activeTypes.has('sleep_arch') && input.sleepTrends.length >= 7) {
    const last7 = input.sleepTrends.slice(-7)
    const avgScore = last7.reduce((s, p) => s + (p.sleep_score ?? 0), 0) / 7
    const allHaveData = last7.every((p) => p.sleep_score != null)
    if (allHaveData && avgScore >= 75) {
      newMoments.push(makeMoment('sleep_arch', {
        avgScore: Math.round(avgScore), todayScore: sleep?.score,
        todayHrv: sleep?.hrv, nights: last7,
      }))
    }
  }

  // 9. Month in Review — 1st of month, ≥8 workouts in prior month
  if (!activeTypes.has('month_review')) {
    const today = new Date()
    const isFirst = today.getDate() === 1
    const monthWorkouts = input.recentWorkouts.filter((w) => {
      const d = new Date(w.workout_date)
      return d.getMonth() === (today.getMonth() - 1 + 12) % 12
    })
    if (isFirst && monthWorkouts.length >= 8) {
      const totalKm = monthWorkouts.reduce((s, w) => s + (w.distance_m ?? 0) / 1000, 0)
      const sports = monthWorkouts.reduce<Record<string, number>>((acc, w) => {
        acc[w.sport] = (acc[w.sport] ?? 0) + 1
        return acc
      }, {})
      newMoments.push(makeMoment('month_review', {
        totalSessions: monthWorkouts.length,
        totalKm: Math.round(totalKm * 10) / 10,
        sports, currentCtl: tl?.ctl,
      }))
    }
  }

  if (newMoments.length > 0) {
    const all = await loadMoments()
    await saveMoments([...all, ...newMoments])
  }
}
