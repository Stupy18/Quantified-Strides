import { useQuery } from '@tanstack/react-query'
import { fetchTrainingHistory, fetchRecentWorkouts } from '../api/endpoints/training'

export function useTrainingHistory(days = 42) {
  return useQuery({
    queryKey: ['training-history', days],
    queryFn: () => fetchTrainingHistory(days),
    staleTime: 1000 * 60 * 5,
  })
}

export function useRecentWorkouts(days = 14) {
  return useQuery({
    queryKey: ['recent-workouts', days],
    queryFn: () => fetchRecentWorkouts(days),
    staleTime: 1000 * 60 * 5,
  })
}
