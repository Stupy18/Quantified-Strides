import { useQuery } from '@tanstack/react-query'
import { fetchHRVHistory } from '../api/endpoints/training'

export function useHRVHistory(days = 30) {
  return useQuery({
    queryKey: ['hrv-history', days],
    queryFn: () => fetchHRVHistory(days),
    staleTime: 1000 * 60 * 5,
  })
}
