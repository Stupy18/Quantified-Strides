import { useState } from 'react'
import { View, TextInput, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Platform } from 'react-native'
import { useRouter } from 'expo-router'
import DateTimePicker from '@react-native-community/datetimepicker'
import { ScreenWrapper } from '../../src/components/layout/ScreenWrapper'
import { SectionTitle }  from '../../src/components/primitives/SectionTitle'
import { MetricLabel }   from '../../src/components/primitives/MetricLabel'
import { ActionButton }  from '../../src/components/primitives/ActionButton'
import { useAuth }       from '../../src/context/AuthContext'
import { useTheme }      from '../../src/hooks/useTheme'
import { SPACE, RADIUS, TEXT } from '../../src/theme'

// ─── Types ────────────────────────────────────────────────────────────────────

type Goal = 'athlete' | 'strength' | 'hypertrophy'
type Gender = 'male' | 'female' | 'non_binary' | 'prefer_not_to_say'

const GOALS: { key: Goal; label: string }[] = [
  { key: 'athlete',     label: 'Multi-sport athlete' },
  { key: 'strength',    label: 'Strength' },
  { key: 'hypertrophy', label: 'Hypertrophy' },
]

const GENDERS: { key: Gender; label: string }[] = [
  { key: 'male',              label: 'Male' },
  { key: 'female',            label: 'Female' },
  { key: 'non_binary',        label: 'Non-binary' },
  { key: 'prefer_not_to_say', label: 'Prefer not to say' },
]

interface FormData {
  name: string
  email: string
  password: string
  confirm: string
  date_of_birth: string   // always "YYYY-MM-DD" or ""
  gender: Gender | ''
  goal: Goal
  gym_days_week: number
  primary_sports: Record<string, number>
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format a Date object → "YYYY-MM-DD" (the format the backend expects) */
function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Display string shown on the button when a date is selected */
function toDisplayDate(isoDate: string): string {
  if (!isoDate) return 'Select date (optional)'
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}/${y}`
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepDots({ current, total }: { current: number; total: number }) {
  const theme = useTheme()
  return (
    <View style={styles.dots}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            { backgroundColor: i + 1 <= current ? theme.accent : theme.borderSubtle },
          ]}
        />
      ))}
    </View>
  )
}

// ─── Step 1: Credentials ──────────────────────────────────────────────────────

function StepCredentials({
  data, onChange, onNext,
}: { data: FormData; onChange: (k: keyof FormData, v: any) => void; onNext: () => void }) {
  const theme = useTheme()
  const [error, setError] = useState<string | null>(null)

  // Date picker state
  const [showPicker, setShowPicker] = useState(false)
  const pickerDate = data.date_of_birth
    ? new Date(data.date_of_birth)
    : new Date(2000, 0, 1)

  const inputStyle = [
    styles.input,
    { backgroundColor: theme.bgCard, borderColor: theme.borderSubtle, color: theme.textPrimary },
  ]

  function validate() {
    if (!data.name || !data.email || !data.password) { setError('Please fill in all required fields'); return }
    if (data.password.length < 6)                    { setError('Password must be at least 6 characters'); return }
    if (data.password !== data.confirm)              { setError('Passwords do not match'); return }
    setError(null)
    onNext()
  }

  function handleDateChange(_: any, selected?: Date) {
    // On Android the picker closes automatically; on iOS it stays open
    if (Platform.OS === 'android') setShowPicker(false)
    if (selected) onChange('date_of_birth', toISODate(selected))
  }

  function clearDate() {
    onChange('date_of_birth', '')
  }

  return (
    <View>
      <SectionTitle title="Create account" />

      <MetricLabel>Name</MetricLabel>
      <TextInput style={inputStyle} value={data.name} onChangeText={v => onChange('name', v)}
        placeholder="Your name" placeholderTextColor={theme.textFaint} autoCorrect={false} />

      <MetricLabel style={{ marginTop: SPACE.md }}>Email</MetricLabel>
      <TextInput style={inputStyle} value={data.email} onChangeText={v => onChange('email', v)}
        placeholder="you@example.com" placeholderTextColor={theme.textFaint}
        autoCapitalize="none" keyboardType="email-address" autoCorrect={false} />

      <MetricLabel style={{ marginTop: SPACE.md }}>Password</MetricLabel>
      <TextInput style={inputStyle} value={data.password} onChangeText={v => onChange('password', v)}
        placeholder="Min 6 characters" placeholderTextColor={theme.textFaint} secureTextEntry />

      <MetricLabel style={{ marginTop: SPACE.md }}>Confirm password</MetricLabel>
      <TextInput style={inputStyle} value={data.confirm} onChangeText={v => onChange('confirm', v)}
        placeholder="••••••••" placeholderTextColor={theme.textFaint} secureTextEntry />

      {/* ── Date of birth ────────────────────────────────────────────────── */}
      <MetricLabel
        style={{ marginTop: SPACE.md }}
        suffix={<Text style={{ color: theme.textFaint }}> (optional)</Text>}
      >
        Date of birth
      </MetricLabel>

      {/* Trigger button */}
      <TouchableOpacity
        onPress={() => setShowPicker(true)}
        style={[
          styles.input,
          styles.dobButton,
          { backgroundColor: theme.bgCard, borderColor: theme.borderSubtle },
        ]}
      >
        <Text style={[
          styles.dobButtonText,
          { color: data.date_of_birth ? theme.textPrimary : theme.textFaint },
        ]}>
          {toDisplayDate(data.date_of_birth)}
        </Text>

        {/* Clear button — only shown when a date is set */}
        {data.date_of_birth ? (
          <TouchableOpacity onPress={clearDate} hitSlop={8}>
            <Text style={{ color: theme.textFaint, fontSize: 16, lineHeight: 18 }}>✕</Text>
          </TouchableOpacity>
        ) : null}
      </TouchableOpacity>

      {/* iOS: inline spinner inside the card; Android: modal dialog */}
      {showPicker && (
        <>
          <DateTimePicker
            value={pickerDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            maximumDate={new Date()}          // can't pick future dates
            minimumDate={new Date(1900, 0, 1)}
            onChange={handleDateChange}
          />
          {/* iOS needs an explicit "Done" button to dismiss */}
          {Platform.OS === 'ios' && (
            <TouchableOpacity
              onPress={() => setShowPicker(false)}
              style={[styles.iosDoneButton, { borderColor: theme.accent }]}
            >
              <Text style={[styles.iosDoneText, { color: theme.accent }]}>Done</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {/* ── Gender ───────────────────────────────────────────────────── */}
      <MetricLabel style={{ marginTop: SPACE.md }}>Gender</MetricLabel>
      <View style={styles.chipRow}>
        {GENDERS.map(g => (
          <TouchableOpacity
            key={g.key}
            onPress={() => onChange('gender', g.key)}
            style={[
              styles.chip,
              {
                borderColor:     data.gender === g.key ? theme.accent : theme.borderSubtle,
                backgroundColor: data.gender === g.key ? theme.bgCardDeep : 'transparent',
              },
            ]}
          >
            <Text style={[styles.chipText, { color: data.gender === g.key ? theme.accent : theme.textMuted }]}>
              {g.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {error && <Text style={[styles.error, { color: theme.bgAlert }]}>{error}</Text>}

      <ActionButton label="Continue →" onPress={validate} variant="accent" size="lg" fullWidth style={{ marginTop: SPACE.lg }} />
    </View>
  )
}

// ─── Step 2: Sport profile ────────────────────────────────────────────────────

function StepProfile({
  data, onChange, onSubmit, loading, error,
}: {
  data: FormData
  onChange: (k: keyof FormData, v: any) => void
  onSubmit: () => void
  loading: boolean
  error: string | null
}) {
  const theme = useTheme()

  function setGoal(g: Goal) { onChange('goal', g) }
  function setGymDays(n: number) { onChange('gym_days_week', n) }

  return (
    <View>
      <SectionTitle title="Sport profile" />

      {/* Goal picker */}
      <MetricLabel>Training goal</MetricLabel>
      <View style={styles.chipRow}>
        {GOALS.map(g => (
          <TouchableOpacity
            key={g.key}
            onPress={() => setGoal(g.key)}
            style={[
              styles.chip,
              {
                borderColor:     data.goal === g.key ? theme.accent : theme.borderSubtle,
                backgroundColor: data.goal === g.key ? theme.bgCardDeep : 'transparent',
              },
            ]}
          >
            <Text style={[styles.chipText, { color: data.goal === g.key ? theme.accent : theme.textMuted }]}>
              {g.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Gym days */}
      <MetricLabel style={{ marginTop: SPACE.lg }}>Gym sessions / week</MetricLabel>
      <View style={styles.chipRow}>
        {[2, 3, 4, 5, 6].map(n => (
          <TouchableOpacity
            key={n}
            onPress={() => setGymDays(n)}
            style={[
              styles.chip,
              {
                borderColor:     data.gym_days_week === n ? theme.accent : theme.borderSubtle,
                backgroundColor: data.gym_days_week === n ? theme.bgCardDeep : 'transparent',
              },
            ]}
          >
            <Text style={[styles.chipText, { color: data.gym_days_week === n ? theme.accent : theme.textMuted }]}>
              {n}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.hint, { color: theme.textFaint }]}>
        You can add specific sports and priorities in your profile after signing up.
      </Text>

      {error && <Text style={[styles.error, { color: theme.bgAlert }]}>{error}</Text>}

      {loading
        ? <ActivityIndicator color={theme.accent} style={{ marginTop: SPACE.lg }} />
        : (
          <ActionButton
            label="Create account"
            onPress={onSubmit}
            variant="accent"
            size="lg"
            fullWidth
            style={{ marginTop: SPACE.lg }}
          />
        )
      }
    </View>
  )
}

// ─── Step 3: Verify email ─────────────────────────────────────────────────────

function StepVerify({ email, onBack }: { email: string; onBack: () => void }) {
  const theme = useTheme()
  return (
    <View style={styles.verifyContainer}>
      <Text style={styles.verifyIcon}>📬</Text>
      <SectionTitle title="Check your inbox" />
      <Text style={[styles.verifyText, { color: theme.textMuted }]}>
        We sent a verification link to{' '}
        <Text style={{ color: theme.textPrimary }}>{email}</Text>.{'\n'}
        Click the link to activate your account.
      </Text>
      <ActionButton
        label="Back to sign in"
        onPress={onBack}
        variant="ghost"
        size="md"
        fullWidth
        style={{ marginTop: SPACE.xl }}
      />
    </View>
  )
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function RegisterScreen() {
  const theme  = useTheme()
  const router = useRouter()
  const { register } = useAuth()

  const [step,    setStep]    = useState(1)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [data,    setData]    = useState<FormData>({
    name: '', email: '', password: '', confirm: '', date_of_birth: '',
    gender: '',
    goal: 'athlete', gym_days_week: 3, primary_sports: {},
  })

  function onChange(k: keyof FormData, v: any) {
    setData(p => ({ ...p, [k]: v }))
  }

  async function submit() {
    setError(null)
    setLoading(true)
    try {
      await register({
        name:            data.name,
        email:           data.email.trim().toLowerCase(),
        password:        data.password,
        goal:            data.goal,
        gym_days_week:   data.gym_days_week,
        primary_sports:  data.primary_sports,
        ...(data.date_of_birth ? { date_of_birth: data.date_of_birth } : {}),
        ...(data.gender        ? { gender:        data.gender }        : {}),
      })
      setStep(3)
    } catch (err: any) {
      const msg = err.message?.includes('400') || err.message?.toLowerCase().includes('exist')
        ? 'Email already registered'
        : 'Registration failed — please try again'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScreenWrapper>
      <View style={styles.container}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.appName, { color: theme.accent }]}>QUANTIFIEDSTRIDES</Text>
          {step < 3 && <StepDots current={step} total={2} />}
        </View>

        {/* Card */}
        <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.borderSubtle }]}>
          {step === 1 && <StepCredentials data={data} onChange={onChange} onNext={() => setStep(2)} />}
          {step === 2 && <StepProfile data={data} onChange={onChange} onSubmit={submit} loading={loading} error={error} />}
          {step === 3 && <StepVerify email={data.email} onBack={() => router.replace('/(auth)/login')} />}
        </View>

        {/* Switch to login */}
        {step < 3 && (
          <ActionButton
            label="Already have an account? Sign in"
            onPress={() => router.push('/(auth)/login')}
            variant="ghost"
            size="sm"
            fullWidth
            style={{ marginTop: SPACE.md }}
          />
        )}

      </View>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  container:         { paddingVertical: SPACE.xl },
  header:            { alignItems: 'center', marginBottom: SPACE.xl },
  appName:           { fontSize: 13, letterSpacing: 3, fontFamily: 'JetBrainsMono', fontWeight: '700' },
  dots:              { flexDirection: 'row', gap: 6, marginTop: 12 },
  dot:               { height: 4, width: 28, borderRadius: 2 },
  card:              { borderWidth: 1, borderRadius: RADIUS.lg, padding: SPACE.lg, marginBottom: SPACE.sm },
  input:             { borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, marginBottom: 4 },
  dobButton:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dobButtonText:     { fontSize: 14, fontFamily: 'JetBrainsMono' },
  iosDoneButton:     { alignSelf: 'flex-end', marginTop: 4, borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: 16, paddingVertical: 6 },
  iosDoneText:       { fontSize: 13, fontFamily: 'JetBrainsMono', fontWeight: '600' },
  chipRow:           { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip:              { borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 8 },
  chipText:          { fontSize: 12, fontFamily: 'JetBrainsMono', letterSpacing: 0.5 },
  error:             { fontSize: 12, marginTop: SPACE.sm, fontFamily: 'JetBrainsMono' },
  hint:              { fontSize: 11, fontFamily: 'JetBrainsMono', marginTop: SPACE.md, lineHeight: 18 },
  verifyContainer:   { alignItems: 'center', paddingVertical: SPACE.lg },
  verifyIcon:        { fontSize: 48, marginBottom: SPACE.md },
  verifyText:        { fontSize: 13, textAlign: 'center', lineHeight: 20, fontFamily: 'JetBrainsMono' },
})