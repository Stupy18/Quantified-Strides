import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Svg, { Path, Line, Circle, Text as SvgText } from 'react-native-svg'
import { ScreenWrapper } from '../../src/components/layout/ScreenWrapper'
import { InfoCard } from '../../src/components/blocks/InfoCard'
import { BodyFreshnessMap } from '../../src/components/blocks/BodyFreshnessMap'
import { MetricLabel } from '../../src/components/primitives/MetricLabel'
import { SectionTitle } from '../../src/components/primitives/SectionTitle'
import { StatusBadge } from '../../src/components/primitives/StatusBadge'
import { Hairline } from '../../src/components/primitives/Hairline'
import { useTheme } from '../../src/hooks/useTheme'
import { TEXT, SPACE, FONT } from '../../src/theme'

const MOCK_LOAD = {
  date: 'Friday · Apr 25',
  totalLoad: '420+',
  rampRate: '▲ ramp +4.2 /wk',
  ctl: 64,
  atl: 58,
  tsb: 6,
  narrative: 'Last time you were this fresh, you ran your winter PR. Jan 14.',
}

const MOCK_WEEK = [
  { day: '17', dayName: 'FRI', title: 'Easy aerobic hour',       subtitle: 'Z2 · soft ground',      tag: 'RUN'      },
  { day: '18', dayName: 'SAT', title: 'The iron forty-five',     subtitle: 'posterior chain',        tag: 'STRENGTH' },
  { day: '19', dayName: 'SUN', title: 'Long run, progressive',   subtitle: '18 km · last 4 at MP',  tag: 'LONG'     },
  { day: '21', dayName: 'TUE', title: 'Threshold, three by ten', subtitle: 'two-minute float',       tag: 'QUALITY'  },
]

export default function LoadScreen() {
  const theme = useTheme()

  return (
    <ScreenWrapper>

      {/* ── Section 1: Page header ── */}
      <View style={styles.pageHeader}>
        <View style={{ flex: 1 }}>
          <MetricLabel style={styles.dateLabel}>{MOCK_LOAD.date}</MetricLabel>
          <Text>
            <Text style={[TEXT.displaySmall, { color: theme.textPrimary }]}>Training load </Text>
            <Text style={[TEXT.headingLarge, { color: theme.textMuted }]}>· last 42 days</Text>
          </Text>
        </View>
        <StatusBadge label={MOCK_LOAD.totalLoad} variant="outlined" style={styles.headerBadge} />
      </View>

      {/* ── Section 2: Form card ── */}
      <InfoCard>

        {/* 2a — Header: "Form is fresh." + ramp rate */}
        <View style={styles.formHeaderRow}>
          <Text style={styles.formHeaderText}>
            <Text style={[TEXT.displaySmall, { color: theme.textPrimary }]}>Form </Text>
            <Text style={[TEXT.displaySmall, { fontFamily: FONT.serifItalic, color: theme.accent }]}>is fresh.</Text>
          </Text>
          <Text style={[TEXT.monoMedium, { color: theme.accent, textTransform: 'uppercase' }]}>
            {MOCK_LOAD.rampRate}
          </Text>
        </View>

        {/* 2b — FITNESS / FATIGUE / FORM metric grid */}
        <View style={styles.metricRow}>
          <View style={styles.metricCol}>
            <Text style={[TEXT.monoSmall, { color: theme.textMuted, textTransform: 'uppercase' }]}>FITNESS</Text>
            <Text style={[TEXT.displaySmall, { color: theme.textPrimary }]}>{MOCK_LOAD.ctl}</Text>
            <Text style={[TEXT.monoSmall, { color: theme.textMuted, textTransform: 'uppercase' }]}>ctl</Text>
          </View>
          <View style={styles.metricCol}>
            <Text style={[TEXT.monoSmall, { color: theme.textMuted, textTransform: 'uppercase' }]}>FATIGUE</Text>
            <Text style={[TEXT.displaySmall, { color: theme.textPrimary }]}>{MOCK_LOAD.atl}</Text>
            <Text style={[TEXT.monoSmall, { color: theme.textMuted, textTransform: 'uppercase' }]}>atl</Text>
          </View>
          <View style={styles.metricCol}>
            <Text style={[TEXT.monoSmall, { color: theme.textMuted, textTransform: 'uppercase' }]}>FORM</Text>
            <Text style={[TEXT.displaySmall, { color: theme.accent }]}>+{MOCK_LOAD.tsb}</Text>
            <Text style={[TEXT.monoSmall, { color: theme.textMuted, textTransform: 'uppercase' }]}>tsb</Text>
          </View>
        </View>

        <Hairline />

        {/* 2c — 42-day CTL/ATL SVG chart */}
        <Svg width="100%" height={70} viewBox="0 0 300 70">
          <Line
            x1={0} y1={40} x2={300} y2={40}
            stroke={theme.textFaint} strokeWidth={0.5} strokeDasharray="3 3"
          />
          {/* ATL — dashed, muted */}
          <Path
            d="M0,60 C30,54 60,62 90,50 S150,44 180,40 S250,26 300,22"
            stroke={theme.textMuted} strokeWidth={1.2} strokeDasharray="4 3" opacity={0.7} fill="none"
          />
          {/* CTL — solid, accent */}
          <Path
            d="M0,56 C30,52 60,46 90,42 S150,32 180,26 S250,18 300,12"
            stroke={theme.accent} strokeWidth={2} fill="none"
          />
          <Circle cx={300} cy={12} r={3} fill={theme.accent} />
          <SvgText x={2}   y={68} fontFamily={FONT.mono} fontSize={8} fill={theme.textMuted} opacity={0.6}>MAR 06</SvgText>
          <SvgText x={270} y={68} fontFamily={FONT.mono} fontSize={8} fill={theme.textMuted} opacity={0.6}>TODAY</SvgText>
        </Svg>

        <Hairline />

        {/* 2d — Narrative memory line */}
        <Text style={[TEXT.narrativeMedium, { color: theme.textMuted, lineHeight: 22 }]}>
          {MOCK_LOAD.narrative}
        </Text>

      </InfoCard>

      {/* ── Section 3: Muscle freshness card ── */}
      <InfoCard>
        <View style={styles.freshnessHeader}>
          <MetricLabel style={styles.noMargin}>MUSCLE FRESHNESS</MetricLabel>
          <MetricLabel style={styles.noMargin}>TODAY</MetricLabel>
        </View>
        <Hairline />
        <BodyFreshnessMap />
      </InfoCard>

      {/* ── Section 4: The week ahead ── */}
      <SectionTitle title="The week ahead" rightLabel="Calendar →" />
      <InfoCard noPadding>
        {MOCK_WEEK.map((session, i) => (
          <React.Fragment key={session.day}>
            <WeekRow session={session} theme={theme} />
            {i < MOCK_WEEK.length - 1 && <Hairline />}
          </React.Fragment>
        ))}
      </InfoCard>

    </ScreenWrapper>
  )
}

// ── Local sub-component (screen-specific, not reusable globally) ─────────────

type Session = typeof MOCK_WEEK[number]
type Theme = ReturnType<typeof useTheme>

function WeekRow({ session, theme }: { session: Session; theme: Theme }) {
  return (
    <View style={styles.weekRow}>
      <View style={styles.weekDateCol}>
        <Text style={[TEXT.displaySmall, { color: theme.accent, fontWeight: '500' }]}>
          {session.day}
        </Text>
        <Text style={[TEXT.monoSmall, { color: theme.textFaint, marginTop: SPACE.xs, textTransform: 'uppercase' }]}>
          {session.dayName}
        </Text>
      </View>
      <View style={styles.weekMidCol}>
        <Text style={[TEXT.bodyLarge, { color: theme.textPrimary, fontWeight: '500' }]}>
          {session.title}
        </Text>
        <Text style={[TEXT.narrativeMedium, { color: theme.textMuted, marginTop: SPACE.xs }]}>
          {session.subtitle}
        </Text>
      </View>
      <StatusBadge label={session.tag} variant="outlined" />
    </View>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: SPACE.md,
    marginBottom: SPACE.lg,
  },
  dateLabel: {
    marginBottom: SPACE.xs,
  },
  headerBadge: {
    marginTop: SPACE.xs,
  },
  formHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: SPACE.lg,
  },
  formHeaderText: {
    flex: 1,
    marginRight: SPACE.md,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACE.md,
  },
  metricCol: {
    flex: 1,
    alignItems: 'center',
  },
  freshnessHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACE.xs,
  },
  noMargin: {
    marginBottom: 0,
  },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
  },
  weekDateCol: {
    width: 54,
    alignItems: 'center',
  },
  weekMidCol: {
    flex: 1,
    marginRight: SPACE.md,
  },
})
