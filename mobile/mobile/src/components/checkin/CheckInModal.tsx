import React, { useState, useRef, useEffect } from 'react'
import {
  Modal, View, Text, ScrollView, TextInput,
  TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform,
  PanResponder, Animated, Easing,
} from 'react-native'
import { useCheckInStore } from '../../store/checkInStore'
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

type TimeOption = 'full' | 'short'
type GoingOut   = 'no'   | 'yes'

const INITIAL_SIGNALS = [
  { label: 'Overall feel', score: 4 },
  { label: 'Legs',         score: 3 },
  { label: 'Upper body',   score: 4 },
  { label: 'Joints',       score: 5 },
]

export function CheckInModal() {
  const theme = useTheme()
  const { modalVisible, closeModal, submitCheckIn } = useCheckInStore()

  const [signals, setSignals]           = useState(INITIAL_SIGNALS)
  const [timeAvailable, setTimeAvail]   = useState<TimeOption>('full')
  const [goingOut, setGoingOut]         = useState<GoingOut>('no')
  const [injuryNotes, setInjuryNotes]   = useState('')

  const updateSignal = (index: number, score: number) =>
    setSignals(prev => prev.map((s, i) => i === index ? { ...s, score } : s))

  // ── Drag-to-dismiss ───────────────────────────────────────────────────────
  // Start off-screen so there's no flash when animationType="none"
  const translateY = useRef(new Animated.Value(600)).current

  // Drive the entrance animation ourselves — spring up from off-screen
  useEffect(() => {
    if (modalVisible) {
      translateY.setValue(600)
      Animated.spring(translateY, {
        toValue:         0,
        useNativeDriver: true,
        tension:         80,
        friction:        12,
      }).start()
    }
  }, [modalVisible])

  const dragResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      // Claim the gesture only on downward movement so the ScrollView still scrolls up
      onMoveShouldSetPanResponder: (_, { dy }) => dy > 3,
      // Sheet follows the finger in real time (downward only)
      onPanResponderMove: (_, { dy }) => {
        if (dy > 0) translateY.setValue(dy)
      },
      onPanResponderRelease: (_, { dy }) => {
        if (dy > 60) {
          // Slide the sheet off-screen, then close
          Animated.timing(translateY, {
            toValue:         700,
            duration:        200,
            easing:          Easing.in(Easing.cubic),
            useNativeDriver: true,
          }).start(() => closeModal())
        } else {
          // Not far enough — snap back
          Animated.spring(translateY, {
            toValue:         0,
            useNativeDriver: true,
            tension:         120,
            friction:        14,
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
      {/* ── Dim backdrop — does not close modal on tap ── */}
      <View style={styles.backdrop} />

      {/* ── Bottom sheet ── */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kavWrapper}
      >
        <Animated.View style={[
          styles.sheet,
          { backgroundColor: theme.bgCard, borderColor: theme.borderSubtle },
          { transform: [{ translateY }] },
        ]}>

          {/* Drag handle — touch here and pull down ≥ 60 px to dismiss */}
          <View style={styles.handleRow} {...dragResponder.panHandlers}>
            <View style={[styles.handle, { backgroundColor: theme.textFaint }]} />
          </View>

          {/* ── Header — non-scrollable ── */}
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

          {/* ── Scrollable body ── */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
          >

            {/* Body signals card */}
            <View style={[styles.card, { backgroundColor: theme.bgCardDeep, borderColor: theme.borderSubtle }]}>
              <MetricLabel>BODY SIGNALS</MetricLabel>

              {signals.map((signal, idx) => (
                <View
                  key={signal.label}
                  style={{ marginBottom: idx < signals.length - 1 ? SPACE.lg : 0 }}
                >
                  <View style={styles.signalTop}>
                    <Text style={[TEXT.bodyLarge, { color: theme.textPrimary, fontWeight: '500' }]}>
                      {signal.label}
                    </Text>
                    <Text style={[TEXT.monoMedium, { color: theme.accent }]}>
                      {signal.score} / 5
                    </Text>
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

            {/* Context card */}
            <View style={[styles.card, { backgroundColor: theme.bgCardDeep, borderColor: theme.borderSubtle, marginBottom: SPACE.lg }]}>
              <MetricLabel>CONTEXT</MetricLabel>

              <Text style={[TEXT.bodyMedium, { color: theme.textMuted, marginBottom: SPACE.sm }]}>
                Time available
              </Text>
              <View style={[styles.chipRow, { marginBottom: SPACE.md }]}>
                <ToggleChip label="Full session"  isSelected={timeAvailable === 'full'}  onPress={() => setTimeAvail('full')}  />
                <ToggleChip label="Short session" isSelected={timeAvailable === 'short'} onPress={() => setTimeAvail('short')} />
              </View>

              <Text style={[TEXT.bodyMedium, { color: theme.textMuted, marginBottom: SPACE.sm }]}>
                Going out tonight?
              </Text>
              <View style={[styles.chipRow, { marginBottom: SPACE.md }]}>
                <ToggleChip label="No"  isSelected={goingOut === 'no'}  onPress={() => setGoingOut('no')}  />
                <ToggleChip label="Yes" isSelected={goingOut === 'yes'} onPress={() => setGoingOut('yes')} />
              </View>

              <Text style={[TEXT.bodyMedium, { color: theme.textMuted, marginBottom: SPACE.sm }]}>
                Injury notes
              </Text>
              <TextInput
                style={[
                  TEXT.narrativeMedium,
                  styles.textInput,
                  {
                    color:           theme.textPrimary,
                    backgroundColor: theme.bgPage,
                    borderColor:     theme.borderSubtle,
                  },
                ]}
                placeholder="Anything nagging?"
                placeholderTextColor={theme.textFaint}
                multiline
                numberOfLines={2}
                value={injuryNotes}
                onChangeText={setInjuryNotes}
              />
            </View>

            {/* Submit */}
            <TouchableOpacity
              onPress={submitCheckIn}
              activeOpacity={0.85}
              style={[styles.submitButton, { backgroundColor: theme.accent }]}
            >
              <Text style={[
                TEXT.headingMedium,
                { fontFamily: FONT.serifItalic, color: theme.textOnAccent, letterSpacing: -0.01 },
              ]}>
                Submit check-in
              </Text>
            </TouchableOpacity>

            {/* Footer */}
            <Text style={[TEXT.monoSmall, { color: theme.textFaint, textAlign: 'center' }]}>
              LAST SUBMITTED: YESTERDAY AT 08:54
            </Text>

          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  kavWrapper: {
    position:       'absolute',
    bottom:         0,
    left:           0,
    right:          0,
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight:            '88%',
    borderTopLeftRadius:  RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    borderWidth:          1,
    borderBottomWidth:    0,
    shadowColor:          '#000',
    shadowOffset:         { width: 0, height: -4 },
    shadowOpacity:        0.25,
    shadowRadius:         16,
    elevation:            24,
  },
  handleRow: {
    alignItems:    'center',
    paddingTop:    SPACE.md,
    paddingBottom: SPACE.sm,
  },
  handle: {
    width:        36,
    height:       4,
    borderRadius: 2,
  },
  header: {
    paddingHorizontal: SPACE.lg,
    paddingBottom:     SPACE.md,
    borderBottomWidth: 1,
  },
  headerTop: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   SPACE.xs,
  },
  noMargin: { marginBottom: 0 },
  closeButton: {
    width:          32,
    height:         32,
    borderRadius:   RADIUS.full,
    borderWidth:    1,
    alignItems:     'center',
    justifyContent: 'center',
  },
  body: {
    padding:       SPACE.lg,
    paddingBottom: SPACE.xxxl,
  },
  card: {
    borderRadius:  RADIUS.lg,
    padding:       SPACE.md,
    marginBottom:  SPACE.md,
    borderWidth:   1,
  },
  signalTop: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   SPACE.sm,
  },
  dotsRow: {
    flexDirection: 'row',
    gap:           SPACE.sm,
  },
  dot: {
    width:        SPACE.lg,
    height:       SPACE.lg,
    borderRadius: RADIUS.full,
    borderWidth:  1.5,
  },
  chipRow: {
    flexDirection: 'row',
    gap:           SPACE.sm,
  },
  textInput: {
    paddingHorizontal: SPACE.md,
    paddingVertical:   SPACE.sm,
    borderRadius:      RADIUS.md,
    borderWidth:       1,
  },
  submitButton: {
    borderRadius:   RADIUS.md,
    paddingVertical:   SPACE.md,
    paddingHorizontal: SPACE.lg,
    alignItems:     'center',
    marginBottom:   SPACE.sm,
  },
})
