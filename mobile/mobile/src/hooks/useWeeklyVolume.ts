import { useQuery } from '@tanstack/react-query'
import { fetchWeeklyVolume } from '../api/endpoints/training'

export function useWeeklyVolume(weeks = 12) {
  return useQuery({
    queryKey: ['weekly-volume', weeks],
    queryFn: () => fetchWeeklyVolume(weeks),
    staleTime: 1000 * 60 * 5,
  })
}
