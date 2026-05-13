import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated'
import { useTheme } from '../../../hooks/useTheme'
import { TEXT, SPACE, RADIUS } from '../../../theme'
import { useCountUp } from '../animations/useCountUp'
import { useStagger } from '../animations/useStagger'
import { useEffect } from 'react'

interface Props {
  totalSessions: number
  totalKm: number
  sports: Record<string, number>
  currentCtl: number | null
  monthName?: string
}

export function MonthReviewCard({ totalSessions, totalKm, sports, currentCtl, monthName }: Props) {
  const theme = useTheme()
  const sessionsDisplay = useCountUp(totalSessions, { duration: 1000 })
  const kmDisplay = useCountUp(totalKm, { duration: 1200, delay: 200, decimals: 1 })
  const ctlDisplay = currentCtl ? useCountUp(currentCtl, { duration: 900, delay: 500 }) : null

  const sportEntries = Object.entries(sports).sort(([, a], [, b]) => b - a)
  const { opacities, translateYs } = useStagger(sportEntries.length + 1, { initialDelay: 800, delayMs: 120 })

  const titleOpacity = useSharedValue(0)
  const achievePulse = useSharedValue(1)
  useEffect(() => {
    titleOpacity.value = withTiming(1, { duration: 600 })
    achievePulse.value = withDelay(
      1800,
      withRepeat(
        withSequence(
          withTiming(1.04, { duration: 600, easing: Easing.inOut(Easing.sin) }),
          withTiming(1, { duration: 600, easing: Easing.inOut(Easing.sin) })
        ),
        3,
        false
      )
    )
  }, [])

  const titleStyle = useAnimatedStyle(() => ({ opacity: titleOpacity.value }))
  const achieveStyle = useAnimatedStyle(() => ({ transform: [{ scale: achievePulse.value }] }))

  const displayMonth = monthName ?? new Date(new Date().setMonth(new Date().getMonth() - 1))
    .toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  return (
    <View style={styles.root}>
      <Text style={[TEXT.monoSmall, { color: theme.textFaint, marginBottom: SPACE.sm }]}>
        {displayMonth.toUpperCase()} · IN REVIEW
      </Text>

      <Animated.View style={titleStyle}>
        <Text style={[TEXT.headingLarge, { color: theme.textPrimary }]}>A month well trained.</Text>
        <Text style={[TEXT.narrativeMedium, { color: theme.textMuted, marginBottom: SPACE.lg }]}>
          The body keeps its ledger.
        </Text>
      </Animated.View>

      {/* Hero numbers */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Animated.Text style={[TEXT.displayMedium, { color: theme.accent }]}>
            {sessionsDisplay}
          </Animated.Text>
          <Text style={[TEXT.monoSmall, { color: theme.textFaint }]}>SESSIONS</Text>
        </View>
        <View style={styles.statBox}>
          <Animated.Text style={[TEXT.displayMedium, { color: theme.accent }]}>
            {kmDisplay}
          </Animated.Text>
          <Text style={[TEXT.monoSmall, { color: theme.textFaint }]}>KM</Text>
        </View>
        {ctlDisplay && (
          <View style={styles.statBox}>
            <Animated.Text style={[TEXT.displayMedium, { color: theme.accent }]}>
              {ctlDisplay}
            </Animated.Text>
            <Text style={[TEXT.monoSmall, { color: theme.textFaint }]}>CTL</Text>
          </View>
        )}
      </View>

      {/* Sport breakdown */}
      <View style={styles.sportSection}>
        {sportEntries.slice(0, 5).map(([sport, count], i) => {
          const rowStyle = useAnimatedStyle(() => ({
            opacity: opacities[i]?.value ?? 1,
            transform: [{ translateY: translateYs[i]?.value ?? 0 }],
          }))
          const pct = count / totalSessions
          return (
            <Animated.View key={sport} style={[styles.sportRow, rowStyle]}>
              <Text style={[TEXT.monoSmall, { color: theme.textFaint, width: 90 }]}>
                {sport.replace('_', ' ').toUpperCase()}
              </Text>
              <View style={[styles.barTrack, { backgroundColor: theme.bgCardDeep }]}>
                <View style={[styles.barFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: theme.accent }]} />
              </View>
              <Text style={[TEXT.monoSmall, { color: theme.textMuted, width: 28, textAlign: 'right' }]}>
                {count}×
              </Text>
            </Animated.View>
          )
        })}
      </View>

      {/* Pulsing achievement badge */}
      <Animated.View style={[styles.achieveBadge, { borderColor: theme.accent + '55', backgroundColor: theme.accent + '14' }, achieveStyle]}>
        <Text style={[TEXT.monoSmall, { color: theme.accent }]}>
          {totalSessions} SESSIONS COMPLETED
        </Text>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: SPACE.sm },
  statsRow: { flexDirection: 'row', gap: SPACE.md, marginBottom: SPACE.lg },
  statBox: { flex: 1, alignItems: 'center' },
  sportSection: { gap: SPACE.xs, marginBottom: SPACE.md },
  sportRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  barTrack: { flex: 1, height: 4, borderRadius: RADIUS.pill, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: RADIUS.pill },
  achieveBadge: { borderWidth: 1, borderRadius: RADIUS.sm, paddingHorizontal: SPACE.md, paddingVertical: SPACE.xs, alignSelf: 'center', marginTop: SPACE.sm },
})
