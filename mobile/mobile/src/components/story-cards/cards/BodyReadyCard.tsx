import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Animated, { useAnimatedStyle } from 'react-native-reanimated'
import { useTheme } from '../../../hooks/useTheme'
import { TEXT, SPACE } from '../../../theme'
import { useCountUp } from '../animations/useCountUp'
import { useStagger } from '../animations/useStagger'

interface Props {
  overallFeel: number // 1–5
  legs: number
  upper: number
  joints: number
  muscles: Record<string, number> // muscle key → freshness 0–1
}

const MUSCLE_DISPLAY_ORDER = ['shoulders', 'arms', 'core', 'quads', 'calves', 'glutes', 'hamstrings']

function freshnessLabel(v: number): string {
  if (v >= 0.8) return 'FRESH'
  if (v >= 0.6) return 'READY'
  if (v >= 0.4) return 'MODERATE'
  return 'FATIGUED'
}

function freshnessColor(v: number, accent: string, muted: string, faint: string): string {
  if (v >= 0.8) return accent
  if (v >= 0.5) return muted
  return faint
}

export function BodyReadyCard({ overallFeel, legs, upper, joints, muscles }: Props) {
  const theme = useTheme()
  const scoreDisplay = useCountUp(overallFeel, { duration: 800 })

  const muscleKeys = MUSCLE_DISPLAY_ORDER.filter((k) => muscles[k] != null)
  const { opacities, translateYs } = useStagger(muscleKeys.length + 1, { initialDelay: 600, delayMs: 100 })

  const readinessStyle = useAnimatedStyle(() => ({
    opacity: opacities[0].value,
    transform: [{ translateY: translateYs[0].value }],
  }))

  return (
    <View style={styles.root}>
      <Text style={[TEXT.monoSmall, { color: theme.textFaint, marginBottom: SPACE.sm }]}>
        BODY READY
      </Text>

      <View style={styles.heroRow}>
        <Animated.Text style={[TEXT.displayLarge, { color: theme.accent }]}>
          {scoreDisplay}
        </Animated.Text>
        <Text style={[TEXT.displayMedium, { color: theme.textMuted }]}>/5</Text>
      </View>

      <Animated.Text
        style={[TEXT.narrativeMedium, { color: theme.textMuted, marginBottom: SPACE.lg }, readinessStyle]}
      >
        The system checks in — and it is ready.
      </Animated.Text>

      {/* Body signal tiles */}
      <View style={styles.bodyTiles}>
        {[['OVERALL', overallFeel], ['LEGS', legs], ['UPPER', upper], ['JOINTS', joints]].map(
          ([label, val]) => (
            <View key={label} style={[styles.tile, { backgroundColor: theme.bgCardDeep, borderColor: theme.borderSubtle }]}>
              <Text style={[TEXT.monoSmall, { color: theme.textFaint }]}>{label}</Text>
              <Text style={[TEXT.headingMedium, { color: theme.textPrimary }]}>{val}</Text>
              <View style={styles.dotRow}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.dot,
                      { backgroundColor: i < (val as number) ? theme.accent : theme.textFaint + '44' },
                    ]}
                  />
                ))}
              </View>
            </View>
          )
        )}
      </View>

      {/* Muscle freshness map */}
      {muscleKeys.length > 0 && (
        <View style={styles.muscleSection}>
          <Text style={[TEXT.monoSmall, { color: theme.textFaint, marginBottom: SPACE.sm }]}>
            MUSCLE FRESHNESS
          </Text>
          {muscleKeys.slice(0, 5).map((key, i) => {
            const v = muscles[key]
            const rowStyle = useAnimatedStyle(() => ({
              opacity: opacities[i + 1]?.value ?? 1,
              transform: [{ translateY: translateYs[i + 1]?.value ?? 0 }],
            }))
            const color = freshnessColor(v, theme.accent, theme.textMuted, theme.textFaint)
            return (
              <Animated.View key={key} style={[styles.muscleRow, rowStyle]}>
                <Text style={[TEXT.monoSmall, { color: theme.textFaint, width: 90 }]}>
                  {key.toUpperCase()}
                </Text>
                <View style={[styles.barTrack, { backgroundColor: theme.bgCardDeep }]}>
                  <View style={[styles.barFill, { width: `${Math.round(v * 100)}%`, backgroundColor: color }]} />
                </View>
                <Text style={[TEXT.monoSmall, { color, width: 60, textAlign: 'right' }]}>
                  {freshnessLabel(v)}
                </Text>
              </Animated.View>
            )
          })}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: SPACE.sm },
  heroRow: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACE.xs, marginBottom: SPACE.xs },
  bodyTiles: { flexDirection: 'row', gap: 8, marginBottom: SPACE.lg, flexWrap: 'wrap' },
  tile: { flex: 1, minWidth: 60, borderRadius: 10, borderWidth: 1, padding: SPACE.sm, alignItems: 'center', gap: 4 },
  dotRow: { flexDirection: 'row', gap: 3 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  muscleSection: {},
  muscleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.xs },
  barTrack: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 2 },
})
