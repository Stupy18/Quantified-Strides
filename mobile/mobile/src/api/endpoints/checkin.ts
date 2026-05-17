import { apiClient } from '../client'

// ── Readiness ──────────────────────────────────────────────────────────────────

export interface ReadinessPayload {
  entry_date:        string
  overall_feel:      number
  legs_feel:         number
  upper_body_feel:   number
  joint_feel:        number
  injury_note?:      string | null
  time_available:    'short' | 'medium' | 'long'
  going_out_tonight: boolean
}

export async function saveReadiness(payload: ReadinessPayload): Promise<void> {
  await apiClient.post('/checkin/readiness', payload)
}

export async function fetchReadiness(date: string): Promise<ReadinessPayload | null> {
  try {
    const res = await apiClient.get(`/checkin/readiness/${date}`)
    return res.data
  } catch {
    return null
  }
}

// ── Workout reflection ────────────────────────────────────────────────────────

export interface WorkoutReflectionPayload {
  entry_date:      string
  session_rpe:     number
  session_quality: number
  notes:           string | null
  load_feel:       number | null
  workout_id:      number | null
  session_id:      number | null
}

export async function saveWorkoutReflection(
  payload: WorkoutReflectionPayload,
): Promise<void> {
  await apiClient.post('/checkin/reflection', payload)
}
