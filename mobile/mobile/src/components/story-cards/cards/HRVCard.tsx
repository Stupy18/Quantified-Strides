import React, { useEffect } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { useTheme } from '../../../hooks/useTheme'
import { TEXT, SPACE, FONT } from '../../../theme'
import { useCountUp } from '../animations/useCountUp'
import { usePathDraw } from '../animations/usePathDraw'

interface HRVNight {
  date: string
  hrv: number
  baseline: number
}

interface Props {
  lastHrv: number
  baseline: number
  deviation: number
  status: 'elevated' | 'normal' | 'suppressed'
  trend: 'rising' | 'stable' | 'falling' | null
  nights?: HRVNight[]
}

const CHART_W = 300
const CHART_H = 72

function buildHRVPath(nights: HRVNight[]): { path: string; basePath: string; length: number } {
  if (nights.length < 2) return { path: '', basePath: '', length: 0 }
  const allVals = nights.flatMap((n) => [n.hrv, n.baseline])
  const min = Math.min(...allVals) - 4
  const max = Math.max(...allVals) + 4
  const range = max - min
  const toY = (v: number) => CHART_H - ((v - min) / range) * (CHART_H - 8) - 4
  const hrv = nights.map((n, i) => `${((i / (nights.length - 1)) * CHART_W).toFixed(1)},${toY(n.hrv).toFixed(1)}`).join(' L')
  const base = nights.map((n, i) => `${((i / (nights.length - 1)) * CHART_W).toFixed(1)},${toY(n.baseline).toFixed(1)}`).join(' L')
  return { path: `M${hrv}`, basePath: `M${base}`, length: CHART_W * 1.3 }
}

export function HRVCard({ lastHrv, baseline, deviation, status, trend, nights = [] }: Props) {
  const theme = useTheme()
  const hrvDisplay = useCountUp(lastHrv, { duration: 1200, delay: 200 })
  const { path, basePath, length } = buildHRVPath(nights)
  const dashOffset = usePathDraw(length, { delay: 900, duration: 1600 })

  const isElevated = status === 'elevated'
  const isSuppressed = status === 'suppressed'
  const accentColor = isElevated ? theme.accent : isSuppressed ? theme.bgAlert : theme.textMuted

  const pulseScale = useSharedValue(1)
  const pulseOpacity = useSharedValue(0.5)
  useEffect(() => {
    pulseScale.value = withDelay(2200, withRepeat(withTiming(2.2, { duration: 1600, easing: Easing.out(Easing.quad) }), -1, false))
    pulseOpacity.value = withDelay(2200, withRepeat(withTiming(0, { duration: 1600 }), -1, false))
  }, [])

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
    position: 'absolute',
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: accentColor,
    top: 1, left: 1,
  }))
  const statusLabel = isElevated ? 'ELEVATED' : isSuppressed ? 'SUPPRESSED' : 'NORMAL'
  const narrative = isElevated
    ? 'The nervous system\nis generous today.'
    : isSuppressed
    ? 'The body is asking\nfor recovery.'
    : 'The nervous system\nis speaking quietly.'

  const trendSymbol = trend === 'rising' ? '↑' : trend === 'falling' ? '↓' : '→'

  return (
    <View style={styles.root}>
      {/* Label row */}
      <View style={styles.labelRow}>
        <Text style={[TEXT.monoSmall, { color: theme.textFaint }]}>HRV · RMSSD</Text>
        <Text style={[TEXT.monoSmall, { color: theme.textFaint }]}>7-NIGHT TREND</Text>
      </View>

      {/* Hero number */}
      <View style={styles.heroBlock}>
        <Text style={[styles.heroNumber, { color: accentColor }]}>
          {hrvDisplay}
        </Text>
        <Text style={[styles.heroUnit, { color: theme.textMuted }]}>ms</Text>
      </View>

      {/* Gold accent line */}
      <View style={[styles.accentLine, { backgroundColor: accentColor }]} />

      {/* Status + trend row */}
      <View style={styles.statusRow}>
        <View style={styles.pulseWrap}>
          <Animated.View style={pulseStyle} />
          <View style={[styles.dot, { backgroundColor: accentColor }]} />
        </View>
        <Text style={[TEXT.monoLarge, { color: accentColor, letterSpacing: 2 }]}>
          {statusLabel}
        </Text>
        {trend && (
          <Text style={[TEXT.monoLarge, { color: theme.textFaint, marginLeft: 'auto' }]}>
            {trendSymbol} {trend.toUpperCase()}
          </Text>
        )}
      </View>

      {/* Narrative */}
      <Text style={[styles.narrative, { color: theme.textPrimary }]}>
        {narrative}
      </Text>

      {/* Chart */}
      {nights.length >= 2 && (
        <View style={styles.chartWrap}>
          <Svg width={CHART_W} height={CHART_H}>
            <Path d={basePath} fill="none" stroke={theme.textFaint} strokeWidth={1} strokeDasharray={[3, 5]} opacity={0.5} />
            <Path
              d={path}
              fill="none"
              stroke={accentColor}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeDasharray={[length, length]}
              strokeDashoffset={dashOffset as any}
            />
          </Svg>
          <View style={styles.chartFooter}>
            <Text style={[TEXT.monoSmall, { color: theme.textFaint }]}>7 NIGHTS</Text>
            <Text style={[TEXT.monoSmall, { color: theme.textFaint }]}>
              BASELINE {Math.round(baseline)} ms
            </Text>
          </View>
        </View>
      )}

      {/* Deviation */}
      <View style={[styles.deviationRow, { borderTopColor: theme.borderSubtle }]}>
        <Text style={[TEXT.monoMedium, { color: accentColor }]}>
          {deviation > 0 ? '+' : ''}{deviation.toFixed(1)} SD
        </Text>
        <Text style={[TEXT.monoMedium, { color: theme.textFaint }]}>
          FROM PERSONAL BASELINE
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: SPACE.xs },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACE.sm,
  },
  heroBlock: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: SPACE.md,
  },
  heroNumber: {
    fontFamily: FONT.serif,
    fontSize: 88,
    letterSpacing: -3,
    lineHeight: 88,
  },
  heroUnit: {
    fontFamily: FONT.serif,
    fontSize: 28,
    letterSpacing: -0.5,
    marginBottom: 12,
    marginLeft: SPACE.sm,
  },
  accentLine: {
    height: 3,
    width: '100%',
    marginBottom: SPACE.md,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    marginBottom: SPACE.md,
  },
  pulseWrap: { position: 'relative', width: 12, height: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  narrative: {
    fontFamily: FONT.serifItalic,
    fontSize: 22,
    lineHeight: 30,
    letterSpacing: -0.3,
    marginBottom: SPACE.lg,
  },
  chartWrap: { flex: 1, justifyContent: 'flex-end' },
  chartFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACE.xs,
  },
  deviationRow: {
    flexDirection: 'row',
    gap: SPACE.sm,
    paddingTop: SPACE.sm,
    borderTopWidth: 1,
    marginTop: SPACE.sm,
  },
})
