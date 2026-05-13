import { apiClient } from '../client'

export interface TrainingHistoryPoint {
  date: string
  load: number
  ctl: number
  atl: number
  tsb: number
}

export interface WorkoutListItem {
  workout_id: number
  workout_date: string
  sport: string
  workout_type: string | null
  start_time: string | null
  end_time: string | null
  duration_s: number | null
  distance_m: number | null
  avg_hr: number | null
  max_hr: number | null
  calories: number | null
  tss: number | null
}

export async function fetchTrainingHistory(days = 42): Promise<TrainingHistoryPoint[]> {
  const res = await apiClient.get('/training/history', { params: { days } })
  return res.data
}

export async function fetchRecentWorkouts(days = 14): Promise<WorkoutListItem[]> {
  const res = await apiClient.get('/training/workouts', { params: { days } })
  return res.data
}

export interface HRVHistoryPoint {
  date: string
  hrv: number
  baseline: number
  rhr: number | null
  sleep_score: number | null
}

export interface WeeklyVolumePoint {
  week_start: string
  training_days: number
  total_sets: number
}

export async function fetchHRVHistory(days = 30): Promise<HRVHistoryPoint[]> {
  const res = await apiClient.get('/training/hrv-history', { params: { days } })
  return res.data
}

export async function fetchWeeklyVolume(weeks = 12): Promise<WeeklyVolumePoint[]> {
  const res = await apiClient.get('/training/weekly-volume', { params: { weeks } })
  return res.data
}
