import { apiClient } from '../client'

export interface StrengthSet {
  set_id: number
  set_number: number
  reps: number | null
  weight_kg: number | null
  is_bodyweight: boolean
  total_weight_kg: number | null
}

export interface StrengthExercise {
  exercise_id: number
  exercise_order: number
  name: string
  sets: StrengthSet[]
}

export interface StrengthSession {
  session_id: number
  session_date: string
  session_type: 'upper' | 'lower' | null
  total_sets: number
  total_exercises: number
  exercises?: StrengthExercise[]
}

export interface OneRMPoint {
  session_date: string
  epley_1rm: number
}

export async function fetchStrengthSessions(days = 90): Promise<StrengthSession[]> {
  const res = await apiClient.get('/strength/sessions', { params: { days } })
  return res.data
}

export async function fetchOneRM(exercise: string, days = 365): Promise<OneRMPoint[]> {
  const res = await apiClient.get('/strength/1rm', { params: { exercise, days } })
  return res.data
}

export async function fetchOneRMExercises(): Promise<string[]> {
  const res = await apiClient.get('/strength/1rm/exercises')
  return res.data
}
