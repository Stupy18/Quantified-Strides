import { useQuery } from '@tanstack/react-query'
import { fetchBiomechanics } from '../api/endpoints/running'

export function useBiomechanics(days = 365) {
  return useQuery({
    queryKey: ['biomechanics', days],
    queryFn: () => fetchBiomechanics(days),
    staleTime: 1000 * 60 * 5,
  })
}
