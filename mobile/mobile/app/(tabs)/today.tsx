import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native'
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
import { useDashboard }   from '../../src/hooks/useDashboard'
import { useAuth }        from '../../src/context/AuthContext'
import { useTheme }       from '../../src/hooks/useTheme'
import { TEXT, SPACE, RADIUS } from '../../src/theme'

// Fields the backend doesn't expose yet — keep as static fallbacks until
// the dashboard schema is extended.
const FALLBACK = {
  city:          'Cluj',
  liveHR:        58,
  hrvHistory:    [64, 62, 66, 68, 65, 70, 72],
  sleepHistory:  [6, 8, 5, 9, 7, 4, 7.4],
  heartTarget:   '145–158 bpm',
  paceTarget:    '5:20–45',
  hrvCaption:    'A read worth trusting.',
  sleepCaption:  'Last night, in your own bed.',
}

function formatHeader(city: string, now: Date) {
  const day = now.toLocaleDateString('en-US', { weekday: 'long' })
  const md  = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const hm  = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${day} · ${md} · ${hm} ·\n${city}`
}

function greetingFor(now: Date): string {
  const h = now.getHours()
  if (h < 12) return 'Good morning,'
  if (h < 18) return 'Good afternoon,'
  return 'Good evening,'
}

function formatHrvBadge(deviation: number | null | undefined): string | undefined {
  if (deviation == null) return undefined
  const rounded = Math.round(deviation)
  if (rounded === 0) return 'baseline'
  return rounded > 0 ? `+${rounded} above` : `${rounded} below`
}

// Backend returns recommendation.primary as a single string (e.g. "Z2 Bike + Upper Gym").
// Split at the first comma to recreate the two-tone serif headline; if there's no
// comma, the second line is empty and only the first line renders.
function splitHeadline(primary: string | null | undefined): [string, string] {
  if (!primary) return ['', '']
  const i = primary.indexOf(',')
  if (i === -1) return [primary, '']
  return [primary.slice(0, i + 1), primary.slice(i + 1).trim()]
}

export default function TodayScreen() {
  const theme = useTheme()
  const { user } = useAuth()
  const { data, isLoading, error } = useDashboard()
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    // Align the first tick to the top of the next minute, then tick every 60s.
    let interval: ReturnType<typeof setInterval> | null = null
    const timeout = setTimeout(() => {
      setNow(new Date())
      interval = setInterval(() => setNow(new Date()), 60_000)
    }, 60_000 - (Date.now() % 60_000))
    return () => {
      clearTimeout(timeout)
      if (interval) clearInterval(interval)
    }
  }, [])

  if (isLoading) {
    return (
      <ScreenWrapper>
        <View style={styles.center}>
          <ActivityIndicator color={theme.accent} />
        </View>
      </ScreenWrapper>
    )
  }

  if (error || !data) {
    return (
      <ScreenWrapper>
        <View style={styles.center}>
          <Text style={[TEXT.bodyMedium, { color: theme.textMuted }]}>
            Couldn't load today's dashboard.
          </Text>
        </View>
      </ScreenWrapper>
    )
  }

  const headerLine     = formatHeader(FALLBACK.city, now)
  const greeting       = greetingFor(now)
  const name           = user?.name ?? 'there'

  const rec            = data.recommendation
  const [head1, head2] = splitHeadline(rec?.primary)
  const tagLabel       = rec?.intensity ? rec.intensity : 'Today'
  const duration       = rec?.duration ?? '—'
  // No actionable session means a true rest day — hide chips + CTA.
  const isRestDay      = rec?.intensity == null && rec?.duration == null

  const hrvValue       = data.hrv_status?.last_hrv != null ? Math.round(data.hrv_status.last_hrv) : '—'
  const hrvBadge       = formatHrvBadge(data.hrv_status?.deviation)

  const sleepDuration  = data.sleep?.duration != null ? data.sleep.duration.toFixed(1) : '—'
  const sleepScore     = data.sleep?.score != null ? Math.round(data.sleep.score) : null
  const sleepUnit      = sleepScore != null ? `h · ${sleepScore}` : 'h'

  return (
    <ScreenWrapper style={{ paddingBottom: 0 }} contentContainerStyle={{ paddingBottom: SPACE.lg }}>
      {/* Status row */}
      <View style={styles.statusRow}>
        <Text style={[TEXT.monoMedium, { color: theme.textMuted, flex: 1 }]}>
          {headerLine.toUpperCase()}
        </Text>
        <LiveHRPill bpm={FALLBACK.liveHR} />
      </View>

      {/* Hero greeting */}
      <View style={{ marginTop: SPACE.md }}>
        <Text style={[TEXT.displayLarge, { color: theme.textPrimary, lineHeight: 46 }]}>
          {greeting}
        </Text>
        <Text style={[TEXT.displayLarge, styles.italicAccent, { color: theme.accent, lineHeight: 46 }]}>
          {name}.
        </Text>
        {rec?.narrative && (
          <Text style={[TEXT.narrativeLarge, { color: theme.textMuted, marginTop: SPACE.md }]}>
            “{rec.narrative}”
          </Text>
        )}
      </View>

      {/* Prescription card */}
      <InfoCard style={{ marginTop: SPACE.xl }}>
        <View style={styles.cardHeader}>
          <MetricLabel style={{ marginBottom: 0 }}>Today's Prescription</MetricLabel>
          <StatusBadge label={tagLabel} variant="filled" />
        </View>
        <Hairline />
        {head1 ? (
          <Text style={[TEXT.displaySmall, { color: theme.textPrimary, marginTop: SPACE.md, lineHeight: 30 }]}>
            {head1}
          </Text>
        ) : null}
        {head2 ? (
          <Text style={[TEXT.displaySmall, styles.italicAccent, { color: theme.accent, lineHeight: 30, marginBottom: SPACE.md }]}>
            {head2}
          </Text>
        ) : null}
        {rec?.why ? (
          <Text style={[TEXT.bodyMedium, { color: theme.textMuted, marginTop: head2 ? 0 : SPACE.md, marginBottom: SPACE.lg }]}>
            {rec.why}
          </Text>
        ) : null}

        {!isRestDay && (
          <>
            <View style={styles.metricRow}>
              {[
                { label: 'Time',  value: duration },
                { label: 'Heart', value: FALLBACK.heartTarget },
                { label: 'Pace',  value: FALLBACK.paceTarget },
              ].map(m => (
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
              rightLabel={`est. ${duration}`}
            />
          </>
        )}
      </InfoCard>

      <SectionTitle title="This morning · the body's account" rightLabel="All →" />

      <View style={styles.tileRow}>
        <MetricTile
          label={'HRV ·\nRMSSD'}
          value={hrvValue}
          unit="ms"
          badgeLabel={hrvBadge}
          sparklineData={FALLBACK.hrvHistory}
          caption={FALLBACK.hrvCaption}
        />
        <View style={{ width: SPACE.sm }} />
        <MetricTile
          label={'Sleep ·\nNight'}
          value={sleepDuration}
          unit={sleepUnit}
          chart={<MiniBarChart dataPoints={FALLBACK.sleepHistory} height={32} />}
          caption={FALLBACK.sleepCaption}
        />
      </View>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: SPACE.xxl },
  statusRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACE.sm, gap: SPACE.sm },
  cardHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.sm },
  italicAccent:  { fontFamily: 'Newsreader_Italic' },
  metricRow:     { flexDirection: 'row', gap: SPACE.xs, marginBottom: SPACE.lg },
  metricChip:    { flex: 1, borderRadius: RADIUS.md, padding: SPACE.sm + 2 },
  tileRow:       { flexDirection: 'row', marginTop: SPACE.sm },
})