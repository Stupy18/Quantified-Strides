import React, { useState, useMemo, useRef } from 'react'
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native'
import { ScreenWrapper } from '../../src/components/layout/ScreenWrapper'
import { InfoCard } from '../../src/components/blocks/InfoCard'
import { WorkoutListRow } from '../../src/components/blocks/WorkoutListRow'
import { FilterChip } from '../../src/components/primitives/FilterChip'
import { SectionTitle } from '../../src/components/primitives/SectionTitle'
import { MetricLabel } from '../../src/components/primitives/MetricLabel'
import { SparklineChart } from '../../src/components/primitives/SparklineChart'
import { useTheme } from '../../src/hooks/useTheme'
import { useWorkoutHistoryInfinite } from '../../src/hooks/useTrainingLoad'
import { sportTag, workoutTitle, workoutSubtitle, formatWorkoutDate } from '../../src/utils/workout'
import { TEXT, SPACE } from '../../src/theme'

// ── Filter config ──────────────────────────────────────────────────────────────

const PREVIEW_COUNT = 5

const FILTERS = ['All', 'Run', 'Strength', 'MTB', 'Climb'] as const
type Filter = typeof FILTERS[number]

const SPORT_FILTER: Record<Filter, string[]> = {
  All:      [],
  Run:      ['running', 'trail_running'],
  Strength: ['strength_training'],
  MTB:      ['mountain_biking'],
  Climb:    ['climbing'],
}

// ── Placeholder trend data (no API endpoint for these yet) ────────────────────

const TRENDS = [
  {
    label:   'Running economy',
    caption: 'GAP trend · last 30 days',
    points:  [4, 5, 4.5, 6, 5.5, 7, 7.4],
  },
  {
    label:   'Squat 1RM',
    caption: 'Estimated · last cycle',
    points:  [100, 105, 108, 110, 112, 120, 127],
  },
]

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function HistoryScreen() {
  const theme = useTheme()
  const scrollRef = useRef<ScrollView>(null)
  const [activeFilter, setActiveFilter] = useState<Filter>('All')
  const [showAll, setShowAll] = useState(false)

  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useWorkoutHistoryInfinite(90)

  const workouts = data?.pages.flat() ?? []

  const filtered = useMemo(() => {
    if (activeFilter === 'All') return workouts
    return workouts.filter(w => SPORT_FILTER[activeFilter].includes(w.sport))
  }, [workouts, activeFilter])

  const visible = showAll ? filtered : filtered.slice(0, PREVIEW_COUNT)
  const hasMore = filtered.length > PREVIEW_COUNT

  const collapse = () => {
    setShowAll(false)
    scrollRef.current?.scrollTo({ y: 0, animated: true })
  }

  return (
    <ScreenWrapper scrollRef={scrollRef}>

      {/* ── Page header ── */}
      <View style={styles.pageHeader}>
        <Text style={[TEXT.displaySmall, { color: theme.textPrimary }]}>History</Text>
      </View>

      {/* ── Filter chips ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
        style={styles.filtersRow}
      >
        {FILTERS.map(f => (
          <FilterChip
            key={f}
            label={f}
            isActive={activeFilter === f}
            onPress={() => { setActiveFilter(f); setShowAll(false) }}
          />
        ))}
      </ScrollView>

      {/* ── Workout list ── */}
      <SectionTitle
        title="Workouts"
        rightLabel={hasMore ? (showAll ? 'Show less' : `See all ${filtered.length} →`) : undefined}
        onRightPress={showAll ? collapse : () => setShowAll(true)}
      />
      <InfoCard noPadding>
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : isError ? (
          <View style={styles.center}>
            <Text style={[TEXT.narrativeMedium, { color: theme.textMuted }]}>
              Could not load workouts.
            </Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.center}>
            <Text style={[TEXT.narrativeMedium, { color: theme.textMuted }]}>
              No {activeFilter === 'All' ? '' : activeFilter.toLowerCase() + ' '}sessions in the last {(data?.pages.length ?? 1) * 90} days.
            </Text>
          </View>
        ) : (
          visible.map((w, i) => (
            <WorkoutListRow
              key={w.workout_id}
              title={workoutTitle(w)}
              subtitle={workoutSubtitle(w)}
              date={formatWorkoutDate(w.workout_date)}
              tag={sportTag(w.sport)}
              isLast={i === visible.length - 1}
            />
          ))
        )}
      </InfoCard>

      {showAll && (
        <View style={styles.actionRow}>
          <TouchableOpacity onPress={collapse}>
            <Text style={[TEXT.monoSmall, { color: theme.textMuted, textTransform: 'uppercase' }]}>
              ↑ Show less
            </Text>
          </TouchableOpacity>
          {hasNextPage && (
            <TouchableOpacity onPress={() => fetchNextPage()} disabled={isFetchingNextPage}>
              {isFetchingNextPage
                ? <ActivityIndicator color={theme.accent} size="small" />
                : <Text style={[TEXT.monoSmall, { color: theme.textMuted, textTransform: 'uppercase' }]}>
                    Load older →
                  </Text>
              }
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── Trends (static placeholders — no API wired yet) ── */}
      <SectionTitle title="Trends" rightLabel="See all →" />
      <View style={styles.trendGrid}>
        {TRENDS.map(t => (
          <InfoCard key={t.label} style={styles.trendCard}>
            <MetricLabel>{t.label}</MetricLabel>
            <SparklineChart dataPoints={t.points} height={36} />
            <Text style={[TEXT.narrativeSmall, { color: theme.textMuted, marginTop: SPACE.sm, lineHeight: 17 }]}>
              {t.caption}
            </Text>
          </InfoCard>
        ))}
      </View>

    </ScreenWrapper>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  pageHeader: {
    marginTop: SPACE.md,
    marginBottom: SPACE.lg,
  },
  filtersRow: {
    marginBottom: SPACE.lg,
  },
  filters: {
    flexDirection: 'row',
    gap: SPACE.sm,
  },
  center: {
    paddingVertical: SPACE.xl,
    alignItems: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACE.md,
  },
  trendGrid: {
    flexDirection: 'row',
    gap: SPACE.sm,
    marginBottom: SPACE.md,
  },
  trendCard: {
    flex: 1,
    marginBottom: 0,
  },
})