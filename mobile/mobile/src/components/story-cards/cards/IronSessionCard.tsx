import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Animated, { useAnimatedStyle, SharedValue } from 'react-native-reanimated'
import { useTheme } from '../../../hooks/useTheme'
import { TEXT, SPACE, RADIUS, FONT } from '../../../theme'
import { useCountUp } from '../animations/useCountUp'
import { useStagger } from '../animations/useStagger'

interface Props {
  sessionDate: string
  sessionType: 'upper' | 'lower' | null
  totalSets: number
  totalExercises: number
  exercises: string[]
}

function ExerciseItem({
  name,
  index,
  opacity,
  translateY,
}: {
  name: string
  index: number
  opacity: SharedValue<number>
  translateY: SharedValue<number>
}) {
  const theme = useTheme()
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }))
  return (
    <Animated.View style={[styles.exerciseRow, style]}>
      <Text style={[TEXT.monoSmall, { color: theme.accent, width: 24 }]}>
        {String(index + 1).padStart(2, '0')}
      </Text>
      <View style={[styles.exerciseLine, { backgroundColor: theme.accent + '33' }]} />
      <Text style={[TEXT.bodyMedium, { color: theme.textPrimary, flex: 1 }]}>{name}</Text>
    </Animated.View>
  )
}

export function IronSessionCard({ sessionDate, sessionType, totalSets, totalExercises, exercises }: Props) {
  const theme = useTheme()
  const setsDisplay = useCountUp(totalSets, { duration: 1000, delay: 300 })
  const exDisplay = useCountUp(totalExercises, { duration: 800, delay: 500 })
  const { opacities, translateYs } = useStagger(exercises.length, { initialDelay: 900, delayMs: 120 })

  const sessionLabel = sessionType === 'upper'
    ? 'Upper body,'
    : sessionType === 'lower'
    ? 'Lower body,'
    : 'Full session,'

  const formattedDate = new Date(sessionDate)
    .toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    .toUpperCase()

  return (
    <View style={styles.root}>
      {/* Label */}
      <Text style={[TEXT.monoSmall, { color: theme.textFaint, marginBottom: SPACE.md }]}>
        THE IRON SESSION · {formattedDate}
      </Text>

      {/* Headline */}
      <Text style={[styles.headlineMain, { color: theme.textPrimary }]}>
        {sessionLabel}
      </Text>
      <Text style={[styles.headlineAccent, { color: theme.accent }]}>
        completed.
      </Text>

      {/* Gold accent line */}
      <View style={[styles.accentLine, { backgroundColor: theme.accent }]} />

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statBlock}>
          <Text style={[styles.statNumber, { color: theme.accent }]}>{setsDisplay}</Text>
          <Text style={[TEXT.monoSmall, { color: theme.textFaint }]}>SETS</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: theme.borderSubtle }]} />
        <View style={styles.statBlock}>
          <Text style={[styles.statNumber, { color: theme.textPrimary }]}>{exDisplay}</Text>
          <Text style={[TEXT.monoSmall, { color: theme.textFaint }]}>MOVEMENTS</Text>
        </View>
      </View>

      {/* Separator */}
      <View style={[styles.separator, { backgroundColor: theme.borderSubtle }]} />

      {/* Exercise list */}
      <View style={styles.exerciseList}>
        {exercises.slice(0, 5).map((name, i) => (
          <ExerciseItem
            key={name}
            name={name}
            index={i}
            opacity={opacities[i] ?? opacities[0]}
            translateY={translateYs[i] ?? translateYs[0]}
          />
        ))}
      </View>

      {/* Bottom narrative */}
      <Text style={[styles.narrative, { color: theme.textFaint }]}>
        The adaptation happens{'\n'}in the hours that follow.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: SPACE.xs },
  headlineMain: {
    fontFamily: FONT.serif,
    fontSize: 36,
    letterSpacing: -0.8,
    lineHeight: 40,
  },
  headlineAccent: {
    fontFamily: FONT.serifItalic,
    fontSize: 36,
    letterSpacing: -0.8,
    lineHeight: 40,
    marginBottom: SPACE.md,
  },
  accentLine: {
    height: 3,
    width: '100%',
    marginBottom: SPACE.lg,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACE.lg,
  },
  statBlock: {
    flex: 1,
    alignItems: 'center',
    gap: SPACE.xs,
  },
  statNumber: {
    fontFamily: FONT.serif,
    fontSize: 64,
    letterSpacing: -2,
    lineHeight: 68,
  },
  statDivider: {
    width: 1,
    height: 56,
  },
  separator: {
    height: 1,
    width: '100%',
    marginBottom: SPACE.md,
  },
  exerciseList: {
    flex: 1,
    gap: SPACE.sm,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
  },
  exerciseLine: {
    width: 1,
    height: 14,
  },
  narrative: {
    fontFamily: FONT.serifItalic,
    fontSize: 13,
    lineHeight: 19,
    marginTop: SPACE.md,
  },
})
