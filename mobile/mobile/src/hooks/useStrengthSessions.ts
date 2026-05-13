import { useQuery } from '@tanstack/react-query'
import { fetchStrengthSessions } from '../api/endpoints/strength'

export function useStrengthSessions(days = 90) {
  return useQuery({
    queryKey: ['strength-sessions', days],
    queryFn: () => fetchStrengthSessions(days),
    staleTime: 1000 * 60 * 5,
  })
}
