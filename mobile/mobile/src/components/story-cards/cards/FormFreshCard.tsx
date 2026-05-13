import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Animated, { useAnimatedStyle } from 'react-native-reanimated'
import Svg, { Path, Circle } from 'react-native-svg'
import { useTheme } from '../../../hooks/useTheme'
import { TEXT, SPACE } from '../../../theme'
import { useCountUp } from '../animations/useCountUp'
import { usePathDraw } from '../animations/usePathDraw'
import { useStagger } from '../animations/useStagger'

interface Props {
  tsb: number
  ctl: number
  atl: number
  rampRate?: number
  history: { date: string; tsb: number }[]
}

const CHART_W = 280
const CHART_H = 56

function buildSparkPath(points: number[]): { path: string; length: number } {
  if (points.length < 2) return { path: '', length: 0 }
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const coords = points.map((v, i) => {
    const x = (i / (points.length - 1)) * CHART_W
    const y = CHART_H - ((v - min) / range) * (CHART_H - 8) - 4
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  return { path: `M${coords.join(' L')}`, length: CHART_W * 1.3 }
}

export function FormFreshCard({ tsb, ctl, atl, rampRate, history }: Props) {
  const theme = useTheme()
  const tsbDisplay = useCountUp(tsb, { duration: 1000 })
  const ctlDisplay = useCountUp(ctl, { duration: 900, delay: 400 })
  const { opacities, translateYs } = useStagger(3, { initialDelay: 800 })

  const tsbValues = history.map((p) => p.tsb)
  const { path: sparkPath, length: pathLen } = buildSparkPath(tsbValues)
  const dashOffset = usePathDraw(pathLen, { delay: 300, duration: 1600 })

  const noteStyle = useAnimatedStyle(() => ({
    opacity: opacities[2].value,
    transform: [{ translateY: translateYs[2].value }],
  }))
  const ctlRowStyle = useAnimatedStyle(() => ({
    opacity: opacities[0].value,
    transform: [{ translateY: translateYs[0].value }],
  }))
  const badgeStyle = useAnimatedStyle(() => ({
    opacity: opacities[1].value,
    transform: [{ translateY: translateYs[1].value }],
  }))

  return (
    <View style={styles.root}>
      <Text style={[TEXT.monoSmall, { color: theme.textFaint, marginBottom: SPACE.sm }]}>
        FORM · TSB
      </Text>

      <View style={styles.heroRow}>
        <Animated.Text style={[TEXT.displayLarge, { color: theme.accent }]}>
          {tsbDisplay}
        </Animated.Text>
        <Animated.View style={[styles.freshBadge, { backgroundColor: theme.accent + '22', borderColor: theme.accent + '66' }, badgeStyle]}>
          <Text style={[TEXT.monoSmall, { color: theme.accent }]}>FRESH</Text>
        </Animated.View>
      </View>

      <Text style={[TEXT.narrativeMedium, { color: theme.textMuted, marginBottom: SPACE.md }]}>
        Form is generous today.
      </Text>

      {/* Sparkline */}
      <View style={styles.chart}>
        <Svg width={CHART_W} height={CHART_H}>
          <Path
            d={sparkPath}
            fill="none"
            stroke={theme.accent}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={[pathLen, pathLen]}
            strokeDashoffset={dashOffset as any}
          />
          {tsbValues.length > 0 && (
            <Circle
              cx={CHART_W}
              cy={CHART_H - ((tsbValues[tsbValues.length - 1] - Math.min(...tsbValues)) /
                (Math.max(...tsbValues) - Math.min(...tsbValues) || 1)) *
                (CHART_H - 8) - 4}
              r={3}
              fill={theme.accent}
            />
          )}
        </Svg>
      </View>

      {/* CTL / ATL row */}
      <Animated.View style={[styles.metricsRow, ctlRowStyle]}>
        {[['FITNESS', ctlDisplay, 'CTL'], ['FATIGUE', `${Math.round(atl)}`, 'ATL']].map(([label, val, sub]) => (
          <View key={label} style={styles.metricBox}>
            <Text style={[TEXT.monoSmall, { color: theme.textFaint }]}>{label}</Text>
            <Animated.Text style={[TEXT.displaySmall, { color: theme.textPrimary }]}>{val}</Animated.Text>
            <Text style={[TEXT.monoSmall, { color: theme.textFaint }]}>{sub}</Text>
          </View>
        ))}
        {rampRate != null && (
          <View style={styles.metricBox}>
            <Text style={[TEXT.monoSmall, { color: theme.textFaint }]}>RAMP</Text>
            <Text style={[TEXT.displaySmall, { color: rampRate > 0 ? theme.accent : theme.textMuted }]}>
              {rampRate > 0 ? '+' : ''}{rampRate.toFixed(1)}
            </Text>
            <Text style={[TEXT.monoSmall, { color: theme.textFaint }]}>/WK</Text>
          </View>
        )}
      </Animated.View>

      <Animated.Text style={[TEXT.narrativeSmall, { color: theme.textFaint, marginTop: SPACE.md }, noteStyle]}>
        The body has absorbed the work. Now spend it wisely.
      </Animated.Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: SPACE.sm },
  heroRow: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACE.sm, marginBottom: SPACE.xs },
  freshBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: SPACE.sm, paddingVertical: 3, marginBottom: 6 },
  chart: { marginVertical: SPACE.md },
  metricsRow: { flexDirection: 'row', gap: SPACE.md },
  metricBox: { flex: 1 },
})
