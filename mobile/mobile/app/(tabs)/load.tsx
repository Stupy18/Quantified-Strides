import React, { useMemo } from 'react'
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native'
import Svg, { Path, Line, Circle, Text as SvgText } from 'react-native-svg'
import { ScreenWrapper } from '../../src/components/layout/ScreenWrapper'
import { InfoCard } from '../../src/components/blocks/InfoCard'
import { BodyFreshnessMap } from '../../src/components/blocks/BodyFreshnessMap'
import { WorkoutListRow } from '../../src/components/blocks/WorkoutListRow'
import { MetricLabel } from '../../src/components/primitives/MetricLabel'
import { SectionTitle } from '../../src/components/primitives/SectionTitle'
import { StatusBadge } from '../../src/components/primitives/StatusBadge'
import { Hairline } from '../../src/components/primitives/Hairline'
import { useTheme } from '../../src/hooks/useTheme'
import { useDashboard } from '../../src/hooks/useDashboard'
import { useTrainingHistory, useRecentWorkouts } from '../../src/hooks/useTrainingLoad'
import { TEXT, SPACE, FONT } from '../../src/theme'
import type { TrainingHistoryPoint, WorkoutListItem } from '../../src/api/endpoints/training'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRampRate(rate: number): string {
  const arrow = rate >= 0 ? '▲' : '▼'
  const sign  = rate >= 0 ? '+' : ''
  return `${arrow} ramp ${sign}${rate.toFixed(1)} /wk`
}

function formatTSB(tsb: number): string {
  return tsb >= 0 ? `+${Math.round(tsb)}` : `${Math.round(tsb)}`
}

function formatFormHeadline(label: string): { pre: string; italic: string } {
  if (['very fresh', 'fresh', 'neutral'].includes(label)) {
    return { pre: 'Form is ', italic: `${label}.` }
  }
  return { pre: 'Form: ', italic: `${label}.` }
}

function formatDashboardDate(d: string): string {
  const date = new Date(d)
  return `${date.toLocaleDateString('en-US', { weekday: 'long' })} · ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function formatWorkoutDate(dateStr: string): string {
  return new Date(dateStr)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    .toUpperCase()
}

const SPORT_TAGS: Record<string, string> = {
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

function sportTag(sport: string): string {
  return SPORT_TAGS[sport] ?? sport.toUpperCase().slice(0, 5)
}

function workoutTitle(item: WorkoutListItem): string {
  return item.workout_type ?? sportTag(item.sport)
}

function workoutSubtitle(item: WorkoutListItem): string {
  const parts: string[] = []
  if (item.duration_s) parts.push(formatDuration(item.duration_s))
  if (item.distance_m && item.distance_m > 100) parts.push(`${(item.distance_m / 1000).toFixed(1)} km`)
  return parts.join(' · ')
}

function buildChartPaths(points: TrainingHistoryPoint[]): {
  ctlPath: string; atlPath: string; dotY: number
} {
  if (points.length < 2) return { ctlPath: '', atlPath: '', dotY: 35 }
  const allVals = points.flatMap(p => [p.ctl, p.atl])
  const lo = Math.min(...allVals)
  const hi = Math.max(...allVals)
  const range = hi - lo || 1
  const mapX = (i: number) => ((i / (points.length - 1)) * 292 + 4).toFixed(1)
  const mapY = (v: number) => (65 - ((v - lo) / range) * 58 + 2).toFixed(1)
  const toPath = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${mapX(i)},${mapY(v)}`).join(' ')
  return {
    ctlPath: toPath(points.map(p => p.ctl)),
    atlPath: toPath(points.map(p => p.atl)),
    dotY:    parseFloat(mapY(points[points.length - 1].ctl)),
  }
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function LoadScreen() {
  const theme = useTheme()

  const { data: dash, isLoading: dashLoading, isError } = useDashboard()
  const { data: history, isLoading: histLoading } = useTrainingHistory(42)
  const { data: workouts } = useRecentWorkouts(14)

  const chart   = useMemo(() => buildChartPaths(history ?? []), [history])
  const tl      = dash?.training_load
  const muscles = dash?.muscle_freshness?.muscles
  const recent  = (workouts ?? []).slice(0, 4)

  const totalLoad = history
    ? `${Math.round(history.reduce((s, p) => s + p.load, 0))}`
    : tl ? `${Math.round(tl.ctl)}` : '—'

  const formLabel = tl ? formatFormHeadline(tl.freshness_label) : { pre: 'Form ', italic: '—' }
  const dateLabel = dash ? formatDashboardDate(String(dash.date)) : '—'

  if (isError) {
    return (
      <ScreenWrapper>
        <View style={styles.center}>
          <Text style={[TEXT.bodyMedium, { color: theme.textMuted }]}>Could not load training data.</Text>
        </View>
      </ScreenWrapper>
    )
  }

  return (
    <ScreenWrapper>

      {/* ── Page header ── */}
      <View style={styles.pageHeader}>
        <View style={{ flex: 1 }}>
          <MetricLabel style={styles.dateLabel}>{dateLabel}</MetricLabel>
          <Text>
            <Text style={[TEXT.displaySmall, { color: theme.textPrimary }]}>Training load </Text>
            <Text style={[TEXT.headingLarge, { color: theme.textMuted }]}>· last 42 days</Text>
          </Text>
        </View>
        <StatusBadge label={totalLoad} variant="outlined" style={styles.headerBadge} />
      </View>

      {/* ── Metrics card (dashboard) — inline spinner while loading ── */}
      <InfoCard>
        {dashLoading ? (
          <View style={styles.cardLoader}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : tl ? (
          <>
            <View style={styles.formHeaderRow}>
              <Text style={styles.formHeaderText}>
                <Text style={[TEXT.displaySmall, { color: theme.textPrimary }]}>{formLabel.pre}</Text>
                <Text style={[TEXT.displaySmall, { fontFamily: FONT.serifItalic, color: theme.accent }]}>
                  {formLabel.italic}
                </Text>
              </Text>
              <Text style={[TEXT.monoMedium, { color: theme.accent, textTransform: 'uppercase' }]}>
                {formatRampRate(tl.ramp_rate)}
              </Text>
            </View>

            <View style={styles.metricRow}>
              <View style={styles.metricCol}>
                <Text style={[TEXT.monoSmall, { color: theme.textMuted, textTransform: 'uppercase' }]}>FITNESS</Text>
                <Text style={[TEXT.displaySmall, { color: theme.textPrimary }]}>{Math.round(tl.ctl)}</Text>
                <Text style={[TEXT.monoSmall, { color: theme.textMuted, textTransform: 'uppercase' }]}>ctl</Text>
              </View>
              <View style={styles.metricCol}>
                <Text style={[TEXT.monoSmall, { color: theme.textMuted, textTransform: 'uppercase' }]}>FATIGUE</Text>
                <Text style={[TEXT.displaySmall, { color: theme.textPrimary }]}>{Math.round(tl.atl)}</Text>
                <Text style={[TEXT.monoSmall, { color: theme.textMuted, textTransform: 'uppercase' }]}>atl</Text>
              </View>
              <View style={styles.metricCol}>
                <Text style={[TEXT.monoSmall, { color: theme.textMuted, textTransform: 'uppercase' }]}>FORM</Text>
                <Text style={[TEXT.displaySmall, { color: tl.tsb >= 0 ? theme.accent : theme.alert }]}>
                  {formatTSB(tl.tsb)}
                </Text>
                <Text style={[TEXT.monoSmall, { color: theme.textMuted, textTransform: 'uppercase' }]}>tsb</Text>
              </View>
            </View>

            {dash?.recommendation?.why && (
              <>
                <Hairline />
                <Text style={[TEXT.narrativeMedium, { color: theme.textMuted, lineHeight: 22 }]}>
                  {dash.recommendation.why}
                </Text>
              </>
            )}
          </>
        ) : null}
      </InfoCard>

      {/* ── 42-day chart card (history) — renders as soon as history arrives ── */}
      <InfoCard>
        <MetricLabel style={styles.chartLabel}>CTL · ATL · 42 days</MetricLabel>
        {histLoading ? (
          <View style={styles.cardLoader}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : (
          <Svg width="100%" height={70} viewBox="0 0 300 70">
            <Line
              x1={0} y1={40} x2={300} y2={40}
              stroke={theme.textFaint} strokeWidth={0.5} strokeDasharray="3 3"
            />
            {chart.atlPath ? (
              <Path
                d={chart.atlPath}
                stroke={theme.textMuted} strokeWidth={1.2} strokeDasharray="4 3"
                opacity={0.7} fill="none"
              />
            ) : null}
            {chart.ctlPath ? (
              <>
                <Path d={chart.ctlPath} stroke={theme.accent} strokeWidth={2} fill="none" />
                <Circle cx={296} cy={chart.dotY} r={3} fill={theme.accent} />
              </>
            ) : null}
            {history && history.length > 0 && (
              <>
                <SvgText x={2} y={68} fontFamily={FONT.mono} fontSize={8} fill={theme.textMuted} opacity={0.6}>
                  {new Date(history[0].date)
                    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    .toUpperCase()}
                </SvgText>
                <SvgText x={270} y={68} fontFamily={FONT.mono} fontSize={8} fill={theme.textMuted} opacity={0.6}>
                  TODAY
                </SvgText>
              </>
            )}
          </Svg>
        )}
      </InfoCard>

      {/* ── Muscle freshness (dashboard) — inline spinner while loading ── */}
      <InfoCard>
        <View style={styles.freshnessHeader}>
          <MetricLabel style={styles.noMargin}>MUSCLE FRESHNESS</MetricLabel>
          <MetricLabel style={styles.noMargin}>TODAY</MetricLabel>
        </View>
        <Hairline />
        {dashLoading ? (
          <View style={styles.cardLoader}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : (
          <BodyFreshnessMap muscles={muscles} />
        )}
      </InfoCard>

      {/* ── Recent sessions (workouts) — renders independently ── */}
      {recent.length > 0 && (
        <>
          <SectionTitle title="Recent sessions" rightLabel="History →" />
          <InfoCard noPadding>
            {recent.map((session, i) => (
              <WorkoutListRow
                key={session.workout_id}
                title={workoutTitle(session)}
                subtitle={workoutSubtitle(session)}
                date={formatWorkoutDate(session.workout_date)}
                tag={sportTag(session.sport)}
                isLast={i === recent.length - 1}
              />
            ))}
          </InfoCard>
        </>
      )}

    </ScreenWrapper>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: SPACE.md,
    marginBottom: SPACE.lg,
  },
  dateLabel:       { marginBottom: SPACE.xs },
  headerBadge:     { marginTop: SPACE.xs },
  chartLabel:      { marginBottom: SPACE.sm },
  formHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: SPACE.lg,
  },
  formHeaderText:  { flex: 1, marginRight: SPACE.md },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACE.md,
  },
  metricCol:       { flex: 1, alignItems: 'center' },
  freshnessHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACE.xs,
  },
  noMargin:        { marginBottom: 0 },
  cardLoader:      { paddingVertical: SPACE.lg, alignItems: 'center' },
})
