import { useQuery, useInfiniteQuery } from '@tanstack/react-query'
import { fetchTrainingHistory, fetchRecentWorkouts, fetchWorkoutHistoryPage } from '../api/endpoints/training'

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

export function useWorkoutHistory(days = 90) {
  return useQuery({
    queryKey: ['workout-history', days],
    queryFn: () => fetchRecentWorkouts(days),
    staleTime: 1000 * 60 * 5,
  })
}

export function useWorkoutHistoryInfinite(days = 90) {
  return useInfiniteQuery({
    queryKey: ['workout-history-infinite', days],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      fetchWorkoutHistoryPage(days, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      if (lastPage.length === 0) return undefined
      return lastPage[lastPage.length - 1].workout_date
    },
    staleTime: 1000 * 60 * 5,
  })
}
