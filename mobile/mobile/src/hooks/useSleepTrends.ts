import { useQuery } from '@tanstack/react-query'
import { fetchSleepTrends } from '../api/endpoints/sleep'

export function useSleepTrends(days = 30) {
  return useQuery({
    queryKey: ['sleep-trends', days],
    queryFn: () => fetchSleepTrends(days),
    staleTime: 1000 * 60 * 5,
  })
}
