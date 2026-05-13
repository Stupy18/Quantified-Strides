import { apiClient } from '../client'

export interface SleepTrendPoint {
  sleep_date: string
  sleep_score: number | null
  overnight_hrv: number | null
  rhr: number | null
  duration_minutes: number | null
  body_battery_change: number | null
}

export async function fetchSleepTrends(days = 30): Promise<SleepTrendPoint[]> {
  const res = await apiClient.get('/sleep/trends', { params: { days } })
  return res.data
}
