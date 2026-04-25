import { apiClient } from '../client'

export async function fetchDashboard() {
  const res = await apiClient.get('/dashboard')
  return res.data
}
