import type { WorkoutListItem } from '../api/endpoints/training'

export const SPORT_TAGS: Record<string, string> = {
  running:           'RUN',
  trail_running:     'TRAIL',
  cycling:           'BIKE',
  mountain_biking:   'MTB',
  strength_training: 'GYM',
  climbing:          'CLIMB',
  swimming:          'SWIM',
  hiking:            'HIKE',
  skiing:            'SKI',
  snowboarding:      'SNW',
}

export function sportTag(sport: string): string {
  return SPORT_TAGS[sport] ?? sport.toUpperCase().slice(0, 5)
}

export function workoutTitle(item: WorkoutListItem): string {
  return item.workout_type ?? sportTag(item.sport)
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function workoutSubtitle(item: WorkoutListItem): string {
  const parts: string[] = []
  if (item.duration_s) parts.push(formatDuration(item.duration_s))
  if (item.distance_m && item.distance_m > 100) parts.push(`${(item.distance_m / 1000).toFixed(1)} km`)
  return parts.join(' · ')
}

export function formatWorkoutDate(dateStr: string): string {
  return new Date(dateStr)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    .toUpperCase()
}