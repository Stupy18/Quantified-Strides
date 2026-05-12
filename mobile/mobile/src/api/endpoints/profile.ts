import { apiClient } from '../client'
import type { UserProfile } from '../auth'

export async function fetchProfile(): Promise<UserProfile> {
  const res = await apiClient.get('/auth/me')
  return res.data
}
