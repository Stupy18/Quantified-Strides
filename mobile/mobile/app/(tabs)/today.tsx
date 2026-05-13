import React, { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { ScreenWrapper } from '../../src/components/layout/ScreenWrapper'
import { useTheme } from '../../src/hooks/useTheme'
import { TEXT, SPACE, RADIUS } from '../../src/theme'
import { useDashboard } from '../../src/hooks/useDashboard'
import { useTrainingHistory } from '../../src/hooks/useTrainingLoad'
import { useRecentWorkouts } from '../../src/hooks/useTrainingLoad'
import { useBiomechanics } from '../../src/hooks/useBiomechanics'
import { useSleepTrends } from '../../src/hooks/useSleepTrends'
import { useStrengthSessions } from '../../src/hooks/useStrengthSessions'
import {
  getActiveMoments,
  evaluateTriggers,
  purgeExpiredMoments,
  StoryMoment,
} from '../../src/utils/storyTriggers'

const CARD_TYPE_LABELS: Record<string, string> = {
  form_fresh: 'Form is Fresh',
  week_in_numbers: 'This Week in Numbers',
  new_pr: 'New Personal Record',
  nervous_system: 'The Nervous System Speaks',
  fitness_trajectory: 'Fitness Trajectory',
  run_decoded: 'Run Decoded',
  iron_session: 'The Iron Session',
  body_ready: 'Body Ready',
  sleep_arch: 'Sleep Architecture',
  month_review: 'Month in Review',
}

function MomentSurface({ moment }: { moment: StoryMoment }) {
  const theme = useTheme()
  const hoursLeft = Math.max(0, Math.round((moment.expiresAt - Date.now()) / (1000 * 60 * 60)))

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => router.push({ pathname: '/stories', params: { initialType: moment.type } })}
      style={[styles.momentCard, { backgroundColor: theme.bgCard, borderColor: theme.accent + '44' }]}
    >
      <View style={styles.momentTop}>
        <Text style={[TEXT.monoSmall, { color: theme.accent }]}>YOUR MOMENT</Text>
        <Text style={[TEXT.monoSmall, { color: theme.textFaint }]}>
          fades in {hoursLeft}h
        </Text>
      </View>

      <View style={[styles.momentDivider, { backgroundColor: theme.accent + '33' }]} />

      <Text style={[TEXT.headingMedium, { color: theme.textPrimary, marginTop: SPACE.sm }]}>
        {CARD_TYPE_LABELS[moment.type] ?? 'A moment'}
      </Text>
      <Text style={[TEXT.narrativeSmall, { color: theme.textMuted, marginTop: 2 }]}>
        Tap to view and share — it won't last.
      </Text>

      <Text style={[TEXT.monoSmall, { color: theme.accent, marginTop: SPACE.md }]}>
        VIEW MOMENT →
      </Text>
    </TouchableOpacity>
  )
}

export default function TodayScreen() {
  const theme = useTheme()
  const [activeMoment, setActiveMoment] = useState<StoryMoment | null>(null)
  const [triggersRun, setTriggersRun] = useState(false)

  const { data: dashboard } = useDashboard()
  const { data: trainingHistory } = useTrainingHistory(42)
  const { data: recentWorkouts } = useRecentWorkouts(14)
  const { data: biomechanics } = useBiomechanics(365)
  const { data: sleepTrends } = useSleepTrends(30)
  const { data: strengthSessions } = useStrengthSessions(90)

  // Purge expired moments on mount
  useEffect(() => {
    purgeExpiredMoments().then(() =>
      getActiveMoments().then((moments) => setActiveMoment(moments[0] ?? null))
    )
  }, [])

  // Evaluate triggers once all data is available
  useEffect(() => {
    if (triggersRun) return
    if (!dashboard || !trainingHistory || !recentWorkouts) return

    evaluateTriggers({
      dashboard,
      trainingHistory: trainingHistory ?? [],
      recentWorkouts: recentWorkouts ?? [],
      biomechanics: biomechanics ?? [],
      sleepTrends: sleepTrends ?? [],
      strengthSessions: strengthSessions ?? [],
    }).then(() =>
      getActiveMoments().then((moments) => {
        setActiveMoment(moments[0] ?? null)
        setTriggersRun(true)
      })
    )
  }, [dashboard, trainingHistory, recentWorkouts, biomechanics, sleepTrends, strengthSessions])

  return (
    <ScreenWrapper scrollable>
      <View style={styles.header}>
        <Text style={[TEXT.displayLarge, { color: theme.textPrimary }]}>Today</Text>
        <Text style={[TEXT.narrativeMedium, { color: theme.textMuted }]}>
          Good morning, Vlad.
        </Text>
      </View>

      {/* Moment surface — only rendered when an active moment exists */}
      {activeMoment && <MomentSurface moment={activeMoment} />}

      {/* Placeholder for remaining Today tab content */}
      <View style={[styles.placeholder, { borderColor: theme.borderSubtle }]}>
        <Text style={[TEXT.narrativeMedium, { color: theme.textFaint, textAlign: 'center' }]}>
          Prescription, readiness, and load cards{'\n'}will live here.
        </Text>
      </View>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  header: { marginBottom: SPACE.lg },
  momentCard: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: SPACE.lg,
    marginBottom: SPACE.lg,
  },
  momentTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  momentDivider: { height: 1, marginTop: SPACE.sm },
  placeholder: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    padding: SPACE.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACE.sm,
  },
})
