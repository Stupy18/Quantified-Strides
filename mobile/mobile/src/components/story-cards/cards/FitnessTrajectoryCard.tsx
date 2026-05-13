import React, { useEffect } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Path, Circle, Line, Text as SvgText } from 'react-native-svg'
import { useTheme } from '../../../hooks/useTheme'
import { TEXT, SPACE } from '../../../theme'
import { useCountUp } from '../animations/useCountUp'
import { usePathDraw } from '../animations/usePathDraw'

interface HistoryPoint { date: string; ctl: number }

interface Props {
  currentCtl: number
  rampRate: number
  history: HistoryPoint[]
}

const CHART_W = 270
const CHART_H = 80

function buildCTLPath(points: HistoryPoint[]): { path: string; length: number } {
  if (points.length < 2) return { path: '', length: 0 }
  const vals = points.map((p) => p.ctl)
  const min = Math.min(...vals) - 2
  const max = Math.max(...vals) + 2
  const range = max - min
  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * CHART_W
    const y = CHART_H - ((p.ctl - min) / range) * (CHART_H - 8) - 4
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  return { path: `M${coords.join(' L')}`, length: CHART_W * 1.4 }
}

export function FitnessTrajectoryCard({ currentCtl, rampRate, history }: Props) {
  const theme = useTheme()
  const ctlDisplay = useCountUp(currentCtl, { duration: 1100 })
  const { path, length } = buildCTLPath(history)
  const dashOffset = usePathDraw(length, { delay: 400, duration: 1800 })

  const dotScale = useSharedValue(0)
  const badgeOpacity = useSharedValue(0)
  useEffect(() => {
    dotScale.value = withDelay(2000, withSpring(1, { damping: 10, stiffness: 200 }))
    badgeOpacity.value = withDelay(2200, withTiming(1, { duration: 350 }))
  }, [])

  const dotStyle = useAnimatedStyle(() => ({ transform: [{ scale: dotScale.value }] }))
  const badgeStyle = useAnimatedStyle(() => ({ opacity: badgeOpacity.value }))

  const lastPoint = history[history.length - 1]
  const allVals = history.map((p) => p.ctl)
  const min = Math.min(...allVals) - 2
  const max = Math.max(...allVals) + 2
  const range = max - min
  const lastY = lastPoint ? CHART_H - ((lastPoint.ctl - min) / range) * (CHART_H - 8) - 4 : CHART_H / 2

  return (
    <View style={styles.root}>
      <Text style={[TEXT.monoSmall, { color: theme.textFaint, marginBottom: SPACE.sm }]}>
        FITNESS TRAJECTORY · CTL
      </Text>

      <View style={styles.heroRow}>
        <Animated.Text style={[TEXT.displayLarge, { color: theme.accent }]}>
          {ctlDisplay}
        </Animated.Text>
        <Animated.View
          style={[styles.rampBadge, { backgroundColor: theme.accent + '22', borderColor: theme.accent + '55' }, badgeStyle]}
        >
          <Text style={[TEXT.monoSmall, { color: theme.accent }]}>
            ▲ +{rampRate?.toFixed(1)} /WK
          </Text>
        </Animated.View>
      </View>

      <Text style={[TEXT.narrativeMedium, { color: theme.textMuted, marginBottom: SPACE.md }]}>
        Fitness is climbing. Two weeks of honest work.
      </Text>

      {/* CTL curve drawing itself */}
      <View style={styles.chart}>
        <Svg width={CHART_W} height={CHART_H}>
          <Line x1={0} y1={CHART_H - 2} x2={CHART_W} y2={CHART_H - 2}
            stroke={theme.textFaint} strokeWidth={0.5} opacity={0.4} />
          <Path
            d={path}
            fill="none"
            stroke={theme.accent}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={[length, length]}
            strokeDashoffset={dashOffset as any}
          />
          <Animated.View style={[{ position: 'absolute', left: CHART_W - 5, top: lastY - 5 }, dotStyle]}>
            <Svg width={10} height={10}>
              <Circle cx={5} cy={5} r={4} fill={theme.accent} />
            </Svg>
          </Animated.View>
        </Svg>
        <View style={styles.chartLabels}>
          <Text style={[TEXT.monoSmall, { color: theme.textFaint }]}>6 WEEKS AGO</Text>
          <Text style={[TEXT.monoSmall, { color: theme.textFaint }]}>TODAY</Text>
        </View>
      </View>

      <Text style={[TEXT.narrativeSmall, { color: theme.textFaint, marginTop: SPACE.md }]}>
        Chronic load is a measure of what the body has become, not what it did.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: SPACE.sm },
  heroRow: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACE.sm, marginBottom: SPACE.xs },
  rampBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: SPACE.sm, paddingVertical: 3, marginBottom: 6 },
  chart: { marginTop: SPACE.xs },
  chartLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
})
