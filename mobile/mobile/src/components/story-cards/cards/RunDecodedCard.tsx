import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Animated, { useAnimatedStyle, SharedValue } from 'react-native-reanimated'
import { useTheme } from '../../../hooks/useTheme'
import { TEXT, SPACE, RADIUS } from '../../../theme'
import { useStagger } from '../animations/useStagger'

interface Props {
  cadence: number | null
  gct: number | null
  vo: number | null
  hrDrift: number | null
  fatigue: number | null
  date: string
}

interface MetricBarProps {
  label: string
  value: number
  unit: string
  norm: number  // 0–1 fill ratio
  color: string
  opacity: SharedValue<number>
  translateY: SharedValue<number>
}

function MetricBar({ label, value, unit, norm, color, opacity, translateY }: MetricBarProps) {
  const theme = useTheme()
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }))
  return (
    <Animated.View style={[styles.metricRow, style]}>
      <Text style={[TEXT.monoSmall, { color: theme.textFaint, width: 100 }]}>{label}</Text>
      <View style={[styles.barTrack, { backgroundColor: theme.bgCardDeep }]}>
        <View style={[styles.barFill, { width: `${Math.min(100, norm * 100)}%`, backgroundColor: color }]} />
      </View>
      <Text style={[TEXT.monoMedium, { color: theme.textPrimary, width: 60, textAlign: 'right' }]}>
        {value} {unit}
      </Text>
    </Animated.View>
  )
}

export function RunDecodedCard({ cadence, gct, vo, hrDrift, fatigue, date }: Props) {
  const theme = useTheme()
  const { opacities, translateYs } = useStagger(5, { initialDelay: 300, delayMs: 150 })

  const metrics = [
    cadence != null ? { label: 'CADENCE', value: Math.round(cadence), unit: 'spm', norm: Math.min(1, cadence / 185) } : null,
    gct != null ? { label: 'CONTACT TIME', value: Math.round(gct), unit: 'ms', norm: Math.max(0, 1 - (gct - 200) / 100) } : null,
    vo != null ? { label: 'VERT. OSC.', value: Math.round(vo), unit: 'mm', norm: Math.max(0, 1 - (vo - 60) / 60) } : null,
    hrDrift != null ? { label: 'HR DRIFT', value: Math.abs(hrDrift).toFixed(1) as any, unit: '%', norm: Math.max(0, 1 - Math.abs(hrDrift) / 10) } : null,
    fatigue != null ? { label: 'FATIGUE IDX', value: Math.round(fatigue), unit: '', norm: Math.max(0, 1 - fatigue / 100) } : null,
  ].filter(Boolean) as Array<{ label: string; value: number; unit: string; norm: number }>

  const narrativeStyle = useAnimatedStyle(() => ({
    opacity: opacities[4]?.value ?? 1,
    transform: [{ translateY: translateYs[4]?.value ?? 0 }],
  }))

  const decouplingStatus =
    hrDrift != null
      ? Math.abs(hrDrift) < 5 ? 'efficient' : Math.abs(hrDrift) < 8 ? 'moderate drift' : 'cardiac drift'
      : null

  return (
    <View style={styles.root}>
      <Text style={[TEXT.monoSmall, { color: theme.textFaint, marginBottom: SPACE.sm }]}>
        RUN DECODED · {new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase()}
      </Text>

      <Text style={[TEXT.headingLarge, { color: theme.textPrimary, marginBottom: SPACE.xs }]}>
        The mechanics,
      </Text>
      <Text style={[TEXT.headingLarge, { color: theme.accent, fontStyle: 'italic', marginBottom: SPACE.lg }]}>
        laid bare.
      </Text>

      <View style={styles.bars}>
        {metrics.map((m, i) => (
          <MetricBar
            key={m.label}
            label={m.label}
            value={m.value}
            unit={m.unit}
            norm={m.norm}
            color={theme.accent}
            opacity={opacities[i] ?? opacities[0]}
            translateY={translateYs[i] ?? translateYs[0]}
          />
        ))}
      </View>

      {decouplingStatus && (
        <Animated.View style={[styles.statusBadge, { borderColor: theme.accent + '55', backgroundColor: theme.accent + '15' }, narrativeStyle]}>
          <Text style={[TEXT.monoSmall, { color: theme.accent }]}>
            AEROBIC COUPLING — {decouplingStatus.toUpperCase()}
          </Text>
        </Animated.View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: SPACE.sm },
  bars: { gap: SPACE.sm, marginBottom: SPACE.md },
  metricRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  barTrack: { flex: 1, height: 4, borderRadius: RADIUS.pill, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: RADIUS.pill },
  statusBadge: { borderWidth: 1, borderRadius: RADIUS.sm, paddingHorizontal: SPACE.sm, paddingVertical: SPACE.xs, alignSelf: 'flex-start' },
})
