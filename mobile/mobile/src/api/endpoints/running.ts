import { apiClient } from '../client'

export interface BiomechanicsPoint {
  workout_id: number
  workout_date: string
  avg_cadence: number | null
  avg_gct: number | null
  avg_vo: number | null
  avg_vr: number | null
  avg_pace: number | null
  avg_hr: number | null
  fatigue_score: number | null
  cadence_drift_pct: number | null
  gct_drift_pct: number | null
  hr_drift_pct: number | null
}

export interface RunningTrendPoint {
  workout_date: string
  avg_cadence: number | null
  avg_gap: number | null
  decoupling_pct: number | null
  decoupling_status: 'efficient' | 'moderate_drift' | 'cardiac_drift' | null
  rei: number | null
}

export async function fetchBiomechanics(days = 365): Promise<BiomechanicsPoint[]> {
  const res = await apiClient.get('/running/biomechanics', { params: { days } })
  return res.data
}

export async function fetchRunningTrends(days = 365): Promise<RunningTrendPoint[]> {
  const res = await apiClient.get('/running/trends', { params: { days } })
  return res.data
}
