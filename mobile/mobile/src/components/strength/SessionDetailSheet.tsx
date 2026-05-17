import React, { useRef, useEffect } from 'react'
import {
  Modal, View, Text, ScrollView, Pressable, TouchableOpacity,
  StyleSheet, PanResponder, Animated, Easing, ActivityIndicator,
} from 'react-native'
import { useQuery } from '@tanstack/react-query'
import {
  fetchStrengthSessionDetail,
  type StrengthSetDetail,
} from '../../api/endpoints/strength'
import { useTheme } from '../../hooks/useTheme'
import { MetricLabel } from '../primitives/MetricLabel'
import { Hairline } from '../primitives/Hairline'
import { TEXT, SPACE, RADIUS } from '../../theme'

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const days    = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  const months  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${days[date.getDay()]} · ${months[date.getMonth()]} ${date.getDate()}`
}

function sessionTypeLabel(t: 'upper' | 'lower' | null): string {
  if (t === 'upper') return 'Upper body'
  if (t === 'lower') return 'Lower body'
  return 'Full body'
}

function formatSet(set: StrengthSetDetail): string {
  const reps = set.reps != null ? `${set.reps} reps` : null
  const weight = set.total_weight_kg != null
    ? `${set.total_weight_kg} kg`
    : set.weight_kg != null
      ? `${set.weight_kg} kg`
      : set.is_bodyweight ? 'bodyweight' : null
  const modifier = set.per_hand ? ' /hand' : set.per_side ? ' /side' : ''
  return [reps, weight ? weight + modifier : null].filter(Boolean).join(' × ') || '—'
}

interface Props {
  sessionId: number | null
  onClose:   () => void
}

export function SessionDetailSheet({ sessionId, onClose }: Props) {
  const theme   = useTheme()
  const visible = sessionId != null

  const { data: session, isLoading } = useQuery({
    queryKey: ['sessionDetail', sessionId],
    queryFn:  () => fetchStrengthSessionDetail(sessionId!),
    enabled:  sessionId != null,
    staleTime: 5 * 60 * 1000,
  })

  const translateY = useRef(new Animated.Value(600)).current

  useEffect(() => {
    if (visible) {
      translateY.setValue(600)
      Animated.spring(translateY, {
        toValue: 0, useNativeDriver: true, tension: 80, friction: 12,
      }).start()
    }
  }, [visible, sessionId])

  const dragResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  (_, { dy }) => dy > 3,
      onPanResponderMove:           (_, { dy }) => { if (dy > 0) translateY.setValue(dy) },
      onPanResponderRelease: (_, { dy }) => {
        if (dy > 60) {
          Animated.timing(translateY, {
            toValue: 700, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true,
          }).start(() => onClose())
        } else {
          Animated.spring(translateY, {
            toValue: 0, useNativeDriver: true, tension: 120, friction: 14,
          }).start()
        }
      },
    })
  ).current

  const totalSets = session?.exercises.reduce((acc, ex) => acc + ex.sets.length, 0) ?? 0

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />

      <Animated.View style={[
        styles.sheet,
        { backgroundColor: theme.bgCard, borderColor: theme.borderSubtle },
        { transform: [{ translateY }] },
      ]}>

        {/* Drag handle */}
        <View style={styles.handleRow} {...dragResponder.panHandlers}>
          <View style={[styles.handle, { backgroundColor: theme.textFaint }]} />
        </View>

        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.divider }]}>
          <View style={styles.headerTop}>
            <MetricLabel style={styles.noMargin}>
              {session ? formatDate(session.session_date) : ' '}
            </MetricLabel>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: theme.bgCardDeep, borderColor: theme.borderSubtle }]}
            >
              <Text style={[TEXT.bodyLarge, { color: theme.textMuted, lineHeight: 18 }]}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={[TEXT.displaySmall, { color: theme.textPrimary, lineHeight: 34 }]}>
            {session ? sessionTypeLabel(session.session_type) : ' '}
          </Text>
          {session && (
            <Text style={[TEXT.narrativeMedium, { color: theme.textMuted, marginTop: SPACE.xs }]}>
              {session.exercises.length} exercise{session.exercises.length !== 1 ? 's' : ''} · {totalSets} set{totalSets !== 1 ? 's' : ''}
            </Text>
          )}
        </View>

        {/* Body */}
        {isLoading ? (
          <View style={styles.loadingCenter}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : session ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.body}
          >
            {session.exercises.map((ex) => (
              <View
                key={ex.exercise_id}
                style={[styles.exCard, { backgroundColor: theme.bgCardDeep, borderColor: theme.borderSubtle }]}
              >
                <Text style={[TEXT.headingMedium, { color: theme.textPrimary, letterSpacing: -0.15, marginBottom: SPACE.sm }]}>
                  {ex.name}
                </Text>
                {ex.sets.map((set, si) => (
                  <View
                    key={set.set_id}
                    style={[styles.setRow, si > 0 && { borderTopWidth: 1, borderTopColor: theme.divider }]}
                  >
                    <Text style={[TEXT.monoSmall, { color: theme.textFaint, width: 44, textTransform: 'uppercase' }]}>
                      Set {set.set_number}
                    </Text>
                    <Text style={[TEXT.bodyMedium, { color: theme.textPrimary }]}>
                      {formatSet(set)}
                    </Text>
                  </View>
                ))}
                {ex.notes && (
                  <>
                    <Hairline />
                    <Text style={[TEXT.narrativeSmall, { color: theme.textFaint, marginTop: SPACE.xs }]}>
                      {ex.notes}
                    </Text>
                  </>
                )}
              </View>
            ))}
          </ScrollView>
        ) : null}
      </Animated.View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    maxHeight: '85%',
    borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl,
    borderWidth: 1, borderBottomWidth: 0,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25, shadowRadius: 16, elevation: 24,
  },
  handleRow:     { alignItems: 'center', paddingTop: SPACE.md, paddingBottom: SPACE.sm },
  handle:        { width: 36, height: 4, borderRadius: 2 },
  header:        { paddingHorizontal: SPACE.lg, paddingBottom: SPACE.md, borderBottomWidth: 1 },
  headerTop:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.xs },
  noMargin:      { marginBottom: 0 },
  closeBtn:      { width: 32, height: 32, borderRadius: RADIUS.full, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  loadingCenter: { paddingVertical: 48, alignItems: 'center' },
  body:          { padding: SPACE.lg, paddingBottom: 48 },
  exCard:        { borderRadius: RADIUS.lg, padding: SPACE.md, marginBottom: SPACE.md, borderWidth: 1 },
  setRow:        { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingVertical: SPACE.sm },
})
