import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Animated, { useAnimatedStyle } from 'react-native-reanimated'
import { useTheme } from '../../../hooks/useTheme'
import { TEXT, SPACE, RADIUS } from '../../../theme'
import { useCountUp } from '../animations/useCountUp'
import { useStagger } from '../animations/useStagger'

interface SportBreakdown {
  key: string
  label: string
  sessions: number
  minutes: number
  km: number
}

interface Props {
  sessions: number
  totalMin: number
  totalKm: number
  sports: string[]
  recentLoad: SportBreakdown[]
}

const SPORT_ICONS: Record<string, string> = {
  running: '→', trail_run: '↗', cycling: '⊙', xc_mtb: '⊙',
  strength: '↑', bouldering: '◇', padel: '◈', swimming: '∿',
}

export function WeekInNumbersCard({ sessions, totalMin, totalKm, sports, recentLoad }: Props) {
  const theme = useTheme()
  const sessionsDisplay = useCountUp(sessions, { duration: 800 })
  const minDisplay = useCountUp(totalMin, { duration: 1000, delay: 150 })
  const kmDisplay = useCountUp(totalKm, { duration: 1100, delay: 300, decimals: 1 })
  const { opacities, translateYs } = useStagger(recentLoad.length + 1, { initialDelay: 600 })

  const titleStyle = useAnimatedStyle(() => ({
    opacity: opacities[0].value,
    transform: [{ translateY: translateYs[0].value }],
  }))

  return (
    <View style={styles.root}>
      <Text style={[TEXT.monoSmall, { color: theme.textFaint, marginBottom: SPACE.sm }]}>
        THIS WEEK
      </Text>

      <Animated.Text style={[TEXT.headingLarge, { color: theme.textPrimary }, titleStyle]}>
        A full week of work.
      </Animated.Text>
      <Text style={[TEXT.narrativeMedium, { color: theme.textMuted, marginBottom: SPACE.lg }]}>
        Seven days well spent.
      </Text>

      {/* Hero stats */}
      <View style={styles.statsRow}>
        {[
          ['SESSIONS', sessionsDisplay, null],
          ['MINUTES', minDisplay, null],
          ['KM', kmDisplay, null],
        ].map(([label, val]) => (
          <View key={label as string} style={styles.statBox}>
            <Animated.Text style={[TEXT.displayMedium, { color: theme.accent }]}>{val}</Animated.Text>
            <Text style={[TEXT.monoSmall, { color: theme.textFaint }]}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Sport breakdown */}
      <View style={styles.sportsSection}>
        {recentLoad.slice(0, 4).map((sport, i) => {
          const rowStyle = useAnimatedStyle(() => ({
            opacity: opacities[i + 1]?.value ?? 1,
            transform: [{ translateY: translateYs[i + 1]?.value ?? 0 }],
          }))
          return (
            <Animated.View key={sport.key} style={[styles.sportRow, rowStyle]}>
              <Text style={[TEXT.monoMedium, { color: theme.accent, width: 20 }]}>
                {SPORT_ICONS[sport.key] ?? '·'}
              </Text>
              <Text style={[TEXT.bodyMedium, { color: theme.textPrimary, flex: 1 }]}>
                {sport.label}
              </Text>
              <Text style={[TEXT.monoSmall, { color: theme.textMuted }]}>
                {sport.sessions} · {Math.round(sport.minutes)}m
              </Text>
            </Animated.View>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: SPACE.sm },
  statsRow: { flexDirection: 'row', gap: SPACE.sm, marginBottom: SPACE.lg },
  statBox: { flex: 1, alignItems: 'center' },
  sportsSection: { gap: SPACE.sm },
  sportRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.sm,
    paddingVertical: SPACE.xs,
  },
})
