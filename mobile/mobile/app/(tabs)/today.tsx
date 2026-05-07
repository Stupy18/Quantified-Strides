import { View, Text, StyleSheet } from 'react-native'
import { ScreenWrapper } from '../../src/components/layout/ScreenWrapper'
import { InfoCard }       from '../../src/components/blocks/InfoCard'
import { MetricTile }     from '../../src/components/blocks/MetricTile'
import { MetricLabel }    from '../../src/components/primitives/MetricLabel'
import { SectionTitle }   from '../../src/components/primitives/SectionTitle'
import { Hairline }       from '../../src/components/primitives/Hairline'
import { StatusBadge }    from '../../src/components/primitives/StatusBadge'
import { ActionButton }   from '../../src/components/primitives/ActionButton'
import { MiniBarChart }   from '../../src/components/primitives/MiniBarChart'
import { LiveHRPill }     from '../../src/components/primitives/LiveHRPill'
import { useTheme }       from '../../src/hooks/useTheme'
import { TEXT, SPACE, RADIUS } from '../../src/theme'

// Mirrors the shape of DashboardSchema so swapping to useDashboard() later
// is a one-line change.
const MOCK = {
  user:        { name: 'Vlad', city: 'Cluj' },
  liveHR:      58,
  greeting:    'Good morning,',
  narrative:   'The nervous system is generous today.',
  prescription: {
    tag:      'Z2 · Aerobic',
    headline: 'A quiet aerobic hour,',
    headlineItalic: 'on soft ground.',
    why:      'Form is fresh, heart steady, last night gave you an honest seven. Bank the fitness without spending it.',
    metrics:  [
      { label: 'Time',  value: '60–75 min' },
      { label: 'Heart', value: '145–158 bpm' },
      { label: 'Pace',  value: '5:20–45' },
    ],
    duration: '65 min',
  },
  hrv: {
    value:    72,
    unit:     'ms',
    badge:    '+4 above',
    history:  [64, 62, 66, 68, 65, 70, 72],
    caption:  'Four above baseline. A generous read.',
  },
  sleep: {
    value:    7.4,
    unit:     'h · 82',
    badge:    'honest',
    history:  [6, 8, 5, 9, 7, 4, 7.4],
    caption:  'Not a full measure — but earned.',
  },
}

function formatHeader(city: string) {
  const now = new Date()
  const day = now.toLocaleDateString('en-US', { weekday: 'long' })
  const md  = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const hm  = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${day} · ${md} · ${hm} · ${city}`
}

export default function TodayScreen() {
  const theme = useTheme()
  const headerLine = formatHeader(MOCK.user.city)

  return (
    <ScreenWrapper>
      {/* Status row */}
      <View style={styles.statusRow}>
        <Text style={[TEXT.monoMedium, { color: theme.textMuted, flex: 1 }]} numberOfLines={1}>
          {headerLine.toUpperCase()}
        </Text>
        <LiveHRPill bpm={MOCK.liveHR} />
      </View>

      {/* Hero greeting */}
      <View style={{ marginTop: SPACE.md }}>
        <Text style={[TEXT.displayLarge, { color: theme.textPrimary, lineHeight: 46 }]}>
          {MOCK.greeting}
        </Text>
        <Text style={[TEXT.displayLarge, styles.italicAccent, { color: theme.accent, lineHeight: 46 }]}>
          {MOCK.user.name}.
        </Text>
        <Text style={[TEXT.narrativeLarge, { color: theme.textMuted, marginTop: SPACE.md }]}>
          “{MOCK.narrative}”
        </Text>
      </View>

      {/* Prescription card */}
      <InfoCard style={{ marginTop: SPACE.xl }}>
        <View style={styles.cardHeader}>
          <MetricLabel style={{ marginBottom: 0 }}>Today's Prescription</MetricLabel>
          <StatusBadge label={MOCK.prescription.tag} variant="filled" />
        </View>
        <Hairline />
        <Text style={[TEXT.displaySmall, { color: theme.textPrimary, marginTop: SPACE.md, lineHeight: 30 }]}>
          {MOCK.prescription.headline}
        </Text>
        <Text style={[TEXT.displaySmall, styles.italicAccent, { color: theme.accent, lineHeight: 30, marginBottom: SPACE.md }]}>
          {MOCK.prescription.headlineItalic}
        </Text>
        <Text style={[TEXT.bodyMedium, { color: theme.textMuted, marginBottom: SPACE.lg }]}>
          {MOCK.prescription.why}
        </Text>

        <View style={styles.metricRow}>
          {MOCK.prescription.metrics.map(m => (
            <View key={m.label} style={[styles.metricChip, { backgroundColor: theme.bgCardDeep }]}>
              <Text style={[TEXT.monoSmall, { color: theme.textMuted }]}>{m.label.toUpperCase()}</Text>
              <Text style={[TEXT.bodyMedium, { color: theme.textPrimary, marginTop: 4 }]}>{m.value}</Text>
            </View>
          ))}
        </View>

        <ActionButton
          label="Begin — out the door"
          onPress={() => {}}
          variant="alert"
          size="lg"
          fullWidth
          rightLabel={`est. ${MOCK.prescription.duration}`}
        />
      </InfoCard>

      <SectionTitle title="This morning · the body's account" rightLabel="All →" />

      <View style={styles.tileRow}>
        <MetricTile
          label="HRV · RMSSD"
          value={MOCK.hrv.value}
          unit={MOCK.hrv.unit}
          badgeLabel={MOCK.hrv.badge}
          sparklineData={MOCK.hrv.history}
          caption={MOCK.hrv.caption}
        />
        <View style={{ width: SPACE.sm }} />
        <MetricTile
          label="Sleep · Night"
          value={MOCK.sleep.value}
          unit={MOCK.sleep.unit}
          badgeLabel={MOCK.sleep.badge}
          chart={<MiniBarChart dataPoints={MOCK.sleep.history} height={32} />}
          caption={MOCK.sleep.caption}
        />
      </View>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  statusRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACE.sm, gap: SPACE.sm },
  cardHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.sm },
  italicAccent:  { fontFamily: 'Newsreader_Italic' },
  metricRow:     { flexDirection: 'row', gap: SPACE.xs, marginBottom: SPACE.lg },
  metricChip:    { flex: 1, borderRadius: RADIUS.md, padding: SPACE.sm + 2 },
  tileRow:       { flexDirection: 'row', marginTop: SPACE.sm },
})