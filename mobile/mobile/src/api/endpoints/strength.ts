import { apiClient } from '../client'

export interface ExerciseResult {
  exercise_id:      number
  name:             string
  movement_pattern: string | null
  quality_focus:    string | null
  primary_muscles:  string[]
}

export interface StrengthSessionListItem {
  session_id:       number
  session_date:     string        // "YYYY-MM-DD"
  session_type:     'upper' | 'lower' | null
  total_sets:       number
  total_exercises:  number
}

export interface SetCreatePayload {
  set_number:          number
  reps?:               number
  weight_kg?:          number
  is_bodyweight:       boolean
  per_hand:            boolean
  per_side:            boolean
  plus_bar:            boolean
  weight_includes_bar: boolean
}

export interface ExerciseCreateInSessionPayload {
  exercise_order: number
  name:           string
  notes:          string | null
  sets:           SetCreatePayload[]
}

export interface StrengthSessionCreatePayload {
  session_date: string
  session_type: 'upper' | 'lower' | null
  raw_notes:    string | null
  exercises:    ExerciseCreateInSessionPayload[]
}

export async function searchExercises(query: string): Promise<ExerciseResult[]> {
  const res = await apiClient.get('/strength/exercises', { params: { search: query } })
  return res.data
}

export async function createStrengthSession(
  payload: StrengthSessionCreatePayload,
): Promise<{ session_id: number }> {
  const res = await apiClient.post('/strength/sessions', payload)
  return res.data
}

export async function fetchStrengthSessions(days = 30): Promise<StrengthSessionListItem[]> {
  const res = await apiClient.get('/strength/sessions', { params: { days } })
  return res.data
}

// ── Session detail ─────────────────────────────────────────────────────────────

export interface StrengthSetDetail {
  set_id:              number
  set_number:          number
  reps:                number | null
  weight_kg:           number | null
  is_bodyweight:       boolean
  total_weight_kg:     number | null
  per_hand:            boolean
  per_side:            boolean
}

export interface StrengthExerciseDetail {
  exercise_id:    number
  exercise_order: number
  name:           string
  notes:          string | null
  sets:           StrengthSetDetail[]
}

export interface StrengthSessionDetail {
  session_id:   number
  session_date: string
  session_type: 'upper' | 'lower' | null
  raw_notes:    string | null
  exercises:    StrengthExerciseDetail[]
}

export async function fetchStrengthSessionDetail(sessionId: number): Promise<StrengthSessionDetail> {
  const res = await apiClient.get(`/strength/sessions/${sessionId}`)
  return res.data
}
