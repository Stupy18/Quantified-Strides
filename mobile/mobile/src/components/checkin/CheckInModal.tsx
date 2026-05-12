import React, { useState, useRef, useEffect } from 'react'
import {
  Modal, View, Text, ScrollView, TextInput,
  TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform,
  PanResponder, Animated, Easing, ActivityIndicator,
} from 'react-native'
import { useCheckInStore } from '../../store/checkInStore'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../hooks/useTheme'
import { MetricLabel } from '../primitives/MetricLabel'
import { ToggleChip } from '../primitives/ToggleChip'
import { TEXT, SPACE, RADIUS, FONT } from '../../theme'

function getTodayLabel(): string {
  const now    = new Date()
  const days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${days[now.getDay()]} · ${months[now.getMonth()]} ${now.getDate()}`
}

type TimeOption = 'short' | 'medium' | 'long'   // all three DB-valid values
type GoingOut   = 'no' | 'yes'

const INITIAL_SIGNALS = [
  { label: 'Overall feel', score: 4 },
  { label: 'Legs',         score: 3 },
  { label: 'Upper body',   score: 4 },
  { label: 'Joints',       score: 5 },
]

export function CheckInModal() {
  const theme = useTheme()
  const { token } = useAuth()
  const { modalVisible, closeModal, submitCheckIn, loading, error } = useCheckInStore()

  const [signals, setSignals]         = useState(INITIAL_SIGNALS)
  const [timeAvailable, setTimeAvail] = useState<TimeOption>('medium')
  const [goingOut, setGoingOut]       = useState<GoingOut>('no')
  const [injuryNotes, setInjuryNotes] = useState('')

  const updateSignal = (index: number, score: number) =>
    setSignals(prev => prev.map((s, i) => i === index ? { ...s, score } : s))

  async function handleSubmit() {
    if (!token) return
    await submitCheckIn(token, {
      overall:       signals[0].score*2,
      legs:          signals[1].score*2,
      upperBody:     signals[2].score*2,
      joints:        signals[3].score*2,
      timeAvailable,
      goingOut:      goingOut === 'yes',
      injuryNotes,
    })
  }

  // ── Drag-to-dismiss ───────────────────────────────────────────────────────
  const translateY = useRef(new Animated.Value(600)).current

  useEffect(() => {
    if (modalVisible) {
      translateY.setValue(600)
      Animated.spring(translateY, {
        toValue: 0, useNativeDriver: true, tension: 80, friction: 12,
      }).start()
    }
  }, [modalVisible])

  const dragResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  (_, { dy }) => dy > 3,
      onPanResponderMove:           (_, { dy }) => { if (dy > 0) translateY.setValue(dy) },
      onPanResponderRelease: (_, { dy }) => {
        if (dy > 60) {
          Animated.timing(translateY, {
            toValue: 700, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true,
          }).start(() => closeModal())
        } else {
          Animated.spring(translateY, {
            toValue: 0, useNativeDriver: true, tension: 120, friction: 14,
          }).start()
        }
      },
    })
  ).current

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={closeModal}
    >
      <View style={styles.backdrop} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kavWrapper}
      >
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
              <MetricLabel style={styles.noMargin}>{getTodayLabel()}</MetricLabel>
              <TouchableOpacity
                onPress={closeModal}
                style={[styles.closeButton, { backgroundColor: theme.bgCardDeep, borderColor: theme.borderSubtle }]}
              >
                <Text style={[TEXT.bodyLarge, { color: theme.textMuted, lineHeight: 18 }]}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={[TEXT.displaySmall, { color: theme.textPrimary, lineHeight: 34 }]}>
              {'How do you '}
              <Text style={{ fontFamily: FONT.serifItalic, color: theme.accent }}>arrive</Text>
              {' today?'}
            </Text>
            <Text style={[TEXT.narrativeMedium, { color: theme.textMuted, marginTop: SPACE.xs }]}>
              Your answer shapes the prescription.
            </Text>
          </View>

          {/* Scrollable body */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
          >
            {/* Body signals */}
            <View style={[styles.card, { backgroundColor: theme.bgCardDeep, borderColor: theme.borderSubtle }]}>
              <MetricLabel>BODY SIGNALS</MetricLabel>
              {signals.map((signal, idx) => (
                <View key={signal.label} style={{ marginBottom: idx < signals.length - 1 ? SPACE.lg : 0 }}>
                  <View style={styles.signalTop}>
                    <Text style={[TEXT.bodyLarge, { color: theme.textPrimary, fontWeight: '500' }]}>
                      {signal.label}
                    </Text>
                    <Text style={[TEXT.monoMedium, { color: theme.accent }]}>{signal.score} / 5</Text>
                  </View>
                  <View style={styles.dotsRow}>
                    {[1, 2, 3, 4, 5].map(i => (
                      <TouchableOpacity
                        key={i}
                        onPress={() => updateSignal(idx, i)}
                        style={[
                          styles.dot,
                          {
                            backgroundColor: i <= signal.score ? theme.accent : 'transparent',
                            borderColor:     i <= signal.score ? theme.accent : theme.textFaint,
                          },
                        ]}
                      />
                    ))}
                  </View>
                </View>
              ))}
            </View>

            {/* Context */}
            <View style={[styles.card, { backgroundColor: theme.bgCardDeep, borderColor: theme.borderSubtle, marginBottom: SPACE.lg }]}>
              <MetricLabel>CONTEXT</MetricLabel>

              <Text style={[TEXT.bodyMedium, { color: theme.textMuted, marginBottom: SPACE.sm }]}>Time available</Text>
              {/* Three chips — short / medium / long — matching DB constraint */}
              <View style={[styles.chipRow, { marginBottom: SPACE.md }]}>
                <ToggleChip label="Short"  isSelected={timeAvailable === 'short'}  onPress={() => setTimeAvail('short')}  />
                <ToggleChip label="Medium" isSelected={timeAvailable === 'medium'} onPress={() => setTimeAvail('medium')} />
                <ToggleChip label="Long"   isSelected={timeAvailable === 'long'}   onPress={() => setTimeAvail('long')}   />
              </View>

              <Text style={[TEXT.bodyMedium, { color: theme.textMuted, marginBottom: SPACE.sm }]}>Going out tonight?</Text>
              <View style={[styles.chipRow, { marginBottom: SPACE.md }]}>
                <ToggleChip label="No"  isSelected={goingOut === 'no'}  onPress={() => setGoingOut('no')}  />
                <ToggleChip label="Yes" isSelected={goingOut === 'yes'} onPress={() => setGoingOut('yes')} />
              </View>

              <Text style={[TEXT.bodyMedium, { color: theme.textMuted, marginBottom: SPACE.sm }]}>Injury notes</Text>
              <TextInput
                style={[
                  TEXT.narrativeMedium,
                  styles.textInput,
                  { color: theme.textPrimary, backgroundColor: theme.bgPage, borderColor: theme.borderSubtle },
                ]}
                placeholder="Anything nagging? (optional)"
                placeholderTextColor={theme.textFaint}
                multiline
                numberOfLines={2}
                value={injuryNotes}
                onChangeText={setInjuryNotes}
              />
            </View>

            {error && (
              <Text style={[TEXT.monoSmall, { color: theme.bgAlert, textAlign: 'center', marginBottom: SPACE.sm }]}>
                {error}
              </Text>
            )}

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.85}
              style={[styles.submitButton, { backgroundColor: theme.accent, opacity: loading ? 0.6 : 1 }]}
            >
              {loading
                ? <ActivityIndicator color={theme.textOnAccent} />
                : (
                  <Text style={[TEXT.headingMedium, { fontFamily: FONT.serifItalic, color: theme.textOnAccent, letterSpacing: -0.01 }]}>
                    Submit check-in
                  </Text>
                )
              }
            </TouchableOpacity>

            <Text style={[TEXT.monoSmall, { color: theme.textFaint, textAlign: 'center' }]}>
              {getTodayLabel().toUpperCase()}
            </Text>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop:    { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  kavWrapper:  { position: 'absolute', bottom: 0, left: 0, right: 0, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '88%', borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl,
    borderWidth: 1, borderBottomWidth: 0,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 24,
  },
  handleRow:   { alignItems: 'center', paddingTop: SPACE.md, paddingBottom: SPACE.sm },
  handle:      { width: 36, height: 4, borderRadius: 2 },
  header:      { paddingHorizontal: SPACE.lg, paddingBottom: SPACE.md, borderBottomWidth: 1 },
  headerTop:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.xs },
  noMargin:    { marginBottom: 0 },
  closeButton: { width: 32, height: 32, borderRadius: RADIUS.full, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  body:        { padding: SPACE.lg, paddingBottom: SPACE.xxxl },
  card:        { borderRadius: RADIUS.lg, padding: SPACE.md, marginBottom: SPACE.md, borderWidth: 1 },
  signalTop:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.sm },
  dotsRow:     { flexDirection: 'row', gap: SPACE.sm },
  dot:         { width: SPACE.lg, height: SPACE.lg, borderRadius: RADIUS.full, borderWidth: 1.5 },
  chipRow:     { flexDirection: 'row', gap: SPACE.sm },
  textInput:   { paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, borderRadius: RADIUS.md, borderWidth: 1 },
  submitButton:{ borderRadius: RADIUS.md, paddingVertical: SPACE.md, paddingHorizontal: SPACE.lg, alignItems: 'center', marginBottom: SPACE.sm },
})