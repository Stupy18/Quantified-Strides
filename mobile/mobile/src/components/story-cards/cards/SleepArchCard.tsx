import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Animated, { useAnimatedStyle } from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { useTheme } from '../../../hooks/useTheme'
import { TEXT, SPACE } from '../../../theme'
import { useCountUp } from '../animations/useCountUp'
import { usePathDraw } from '../animations/usePathDraw'
import { useStagger } from '../animations/useStagger'

interface NightPoint {
  sleep_date: string
  sleep_score: number | null
  overnight_hrv: number | null
  duration_minutes: number | null
}

interface Props {
  avgScore: number
  todayScore: number | null
  todayHrv: number | null
  nights: NightPoint[]
}

const CHART_W = 260
const CHART_H = 60

function buildScorePath(nights: NightPoint[]): { path: string; length: number } {
  const valid = nights.filter((n) => n.sleep_score != null)
  if (valid.length < 2) return { path: '', length: 0 }
  const scores = valid.map((n) => n.sleep_score!)
  const min = Math.min(...scores) - 5
  const max = Math.max(...scores) + 5
  const range = max - min
  const coords = valid.map((n, i) => {
    const x = (i / (valid.length - 1)) * CHART_W
    const y = CHART_H - ((n.sleep_score! - min) / range) * (CHART_H - 8) - 4
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  return { path: `M${coords.join(' L')}`, length: CHART_W * 1.3 }
}

export function SleepArchCard({ avgScore, todayScore, todayHrv, nights }: Props) {
  const theme = useTheme()
  const scoreDisplay = useCountUp(avgScore, { duration: 900 })
  const { path, length } = buildScorePath(nights)
  const dashOffset = usePathDraw(length, { delay: 500, duration: 1600 })
  const { opacities, translateYs } = useStagger(nights.length + 1, { initialDelay: 400, delayMs: 80 })

  const titleStyle = useAnimatedStyle(() => ({
    opacity: opacities[0].value,
    transform: [{ translateY: translateYs[0].value }],
  }))

  const scoreQuality =
    avgScore >= 85 ? 'Exceptional' : avgScore >= 75 ? 'Solid' : avgScore >= 65 ? 'Adequate' : 'Restorative work needed'

  return (
    <View style={styles.root}>
      <Text style={[TEXT.monoSmall, { color: theme.textFaint, marginBottom: SPACE.sm }]}>
        SLEEP ARCHITECTURE · 7 NIGHTS
      </Text>

      <View style={styles.heroRow}>
        <Animated.Text style={[TEXT.displayLarge, { color: theme.accent }]}>
          {scoreDisplay}
        </Animated.Text>
        <Text style={[TEXT.headingMedium, { color: theme.textMuted }]}>avg</Text>
      </View>

      <Animated.Text style={[TEXT.narrativeMedium, { color: theme.textMuted, marginBottom: SPACE.md }, titleStyle]}>
        {scoreQuality}. Seven nights of honest rest.
      </Animated.Text>

      {/* 7-night score sparkline */}
      <View style={styles.chart}>
        <Svg width={CHART_W} height={CHART_H}>
          <Path
            d={path}
            fill="none"
            stroke={theme.accent}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={[length, length]}
            strokeDashoffset={dashOffset as any}
          />
        </Svg>
        <View style={styles.chartLabels}>
          <Text style={[TEXT.monoSmall, { color: theme.textFaint }]}>7 NIGHTS AGO</Text>
          <Text style={[TEXT.monoSmall, { color: theme.textFaint }]}>LAST NIGHT</Text>
        </View>
      </View>

      {/* Night bars — score as bar height */}
      <View style={styles.barRow}>
        {nights.slice(-7).map((night, i) => {
          const score = night.sleep_score ?? 0
          const barStyle = useAnimatedStyle(() => ({
            opacity: opacities[i + 1]?.value ?? 1,
            transform: [{ scaleY: opacities[i + 1]?.value ?? 1 }],
          }))
          const heightPct = Math.max(0.1, score / 100)
          return (
            <View key={night.sleep_date} style={styles.barWrap}>
              <Animated.View
                style={[
                  styles.barFill,
                  { height: 40 * heightPct, backgroundColor: theme.accent + (score >= 75 ? 'CC' : '55') },
                  barStyle,
                ]}
              />
              <Text style={[TEXT.monoSmall, { color: theme.textFaint, fontSize: 7 }]}>
                {new Date(night.sleep_date).toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 2).toUpperCase()}
              </Text>
            </View>
          )
        })}
      </View>

      {todayHrv != null && (
        <Text style={[TEXT.monoSmall, { color: theme.textFaint, marginTop: SPACE.sm }]}>
          OVERNIGHT HRV · {Math.round(todayHrv)} MS
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: SPACE.sm },
  heroRow: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACE.sm, marginBottom: SPACE.xs },
  chart: { marginVertical: SPACE.sm },
  chartLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  barRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 50, marginTop: SPACE.sm },
  barWrap: { alignItems: 'center', gap: 4, flex: 1 },
  barFill: { width: 16, borderRadius: 3 },
})
