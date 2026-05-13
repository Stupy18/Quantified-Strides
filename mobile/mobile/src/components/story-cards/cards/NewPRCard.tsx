import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Circle } from 'react-native-svg'
import { useTheme } from '../../../hooks/useTheme'
import { TEXT, SPACE } from '../../../theme'
import { useCountUp } from '../animations/useCountUp'
import { useEffect } from 'react'

interface Props {
  exerciseName: string
  newPR: number
  previousPR: number
  sessionDate: string
}

// Particle positions (deterministic, not random — same every render)
const PARTICLES = [
  { cx: 40, cy: 30, r: 3 }, { cx: 70, cy: 15, r: 2 }, { cx: 100, cy: 35, r: 4 },
  { cx: 130, cy: 10, r: 2 }, { cx: 160, cy: 28, r: 3 }, { cx: 50, cy: 55, r: 2 },
  { cx: 90, cy: 50, r: 4 }, { cx: 120, cy: 60, r: 2 }, { cx: 150, cy: 45, r: 3 },
]

export function NewPRCard({ exerciseName, newPR, previousPR, sessionDate }: Props) {
  const theme = useTheme()
  const scale = useSharedValue(0.3)
  const particleOpacity = useSharedValue(0)
  const deltaOpacity = useSharedValue(0)
  const prDisplay = useCountUp(newPR, { duration: 900, delay: 300, decimals: 1 })
  const delta = newPR - previousPR

  useEffect(() => {
    scale.value = withDelay(200, withSpring(1, { damping: 12, stiffness: 160 }))
    particleOpacity.value = withDelay(600, withSequence(
      withTiming(1, { duration: 400 }),
      withDelay(800, withTiming(0, { duration: 600 }))
    ))
    deltaOpacity.value = withDelay(900, withTiming(1, { duration: 400 }))
  }, [])

  const heroStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))
  const particleStyle = useAnimatedStyle(() => ({
    opacity: particleOpacity.value,
    position: 'absolute', top: 0, left: 0,
  }))
  const deltaStyle = useAnimatedStyle(() => ({ opacity: deltaOpacity.value }))

  return (
    <View style={styles.root}>
      <Text style={[TEXT.monoSmall, { color: theme.textFaint, marginBottom: SPACE.sm }]}>
        PERSONAL RECORD
      </Text>

      <Text style={[TEXT.narrativeMedium, { color: theme.textMuted, marginBottom: SPACE.xs }]}>
        {exerciseName}
      </Text>

      <View style={styles.heroWrap}>
        {/* Gold particles burst */}
        <Animated.View style={particleStyle}>
          <Svg width={200} height={80}>
            {PARTICLES.map((p, i) => (
              <Circle key={i} cx={p.cx} cy={p.cy} r={p.r} fill={theme.accent} opacity={0.7} />
            ))}
          </Svg>
        </Animated.View>

        <Animated.Text
          style={[TEXT.displayLarge, { color: theme.accent, fontSize: 64 }, heroStyle]}
        >
          {prDisplay}
        </Animated.Text>
        <Text style={[TEXT.headingMedium, { color: theme.textMuted }]}>kg</Text>
      </View>

      <Animated.View style={[styles.deltaRow, deltaStyle]}>
        <Text style={[TEXT.monoMedium, { color: theme.accent }]}>
          ▲ +{delta.toFixed(1)} kg from previous best
        </Text>
      </Animated.View>

      <Text style={[TEXT.narrativeSmall, { color: theme.textFaint, marginTop: SPACE.md }]}>
        The bar remembers what the mind forgets.
      </Text>

      <Text style={[TEXT.monoSmall, { color: theme.textFaint, marginTop: SPACE.lg }]}>
        {new Date(sessionDate).toLocaleDateString('en-GB', {
          weekday: 'long', day: 'numeric', month: 'long',
        }).toUpperCase()}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: SPACE.sm },
  heroWrap: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACE.xs, marginVertical: SPACE.md, position: 'relative' },
  deltaRow: { marginTop: SPACE.xs },
})
