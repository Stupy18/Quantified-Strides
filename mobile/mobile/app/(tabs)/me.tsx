import { useEffect, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  StyleSheet, Alert,
} from 'react-native'
import { ScreenWrapper } from '../../src/components/layout/ScreenWrapper'
import { MetricLabel }   from '../../src/components/primitives/MetricLabel'
import { ActionButton }  from '../../src/components/primitives/ActionButton'
import { useTheme }      from '../../src/hooks/useTheme'
import { useAuth }       from '../../src/context/AuthContext'
import { apiGetMe, apiUpdateProfile, UserProfile, UpdateProfilePayload } from '../../src/api/auth'
import { SPACE, RADIUS, TEXT } from '../../src/theme'

type Goal   = 'athlete' | 'strength' | 'hypertrophy'
type Gender = 'male' | 'female' | 'non_binary' | 'prefer_not_to_say'

const GENDERS: { key: Gender; label: string }[] = [
  { key: 'male',              label: 'Male' },
  { key: 'female',            label: 'Female' },
  { key: 'non_binary',        label: 'Non-binary' },
  { key: 'prefer_not_to_say', label: 'Prefer not to say' },
]

const GOALS: { key: Goal; label: string }[] = [
  { key: 'athlete',     label: 'Multi-sport athlete' },
  { key: 'strength',    label: 'Strength' },
  { key: 'hypertrophy', label: 'Hypertrophy' },
]

export default function MeScreen() {
  const theme        = useTheme()
  const { token }    = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [form,    setForm]    = useState<Partial<UserProfile>>({})

  useEffect(() => {
    if (!token) { setLoading(false); return }
    apiGetMe(token)
      .then(p => { setProfile(p); setForm(p) })
      .catch(() => Alert.alert('Error', 'Could not load profile.'))
      .finally(() => setLoading(false))
  }, [token])

  function set<K extends keyof UserProfile>(k: K, v: UserProfile[K]) {
    setForm(p => ({ ...p, [k]: v }))
  }

  async function save() {
    if (!token) return
    setSaving(true)
    try {
      const payload: UpdateProfilePayload = {
        name:            form.name,
        gender:          form.gender,
        goal:            form.goal,
        gym_days_week:   form.gym_days_week,
        garmin_email:    form.garmin_email,
        garmin_password: form.garmin_password,
      }
      const updated = await apiUpdateProfile(token, payload)
      setProfile(updated)
      setForm(updated)
      Alert.alert('Saved', 'Profile updated.')
    } catch {
      Alert.alert('Error', 'Failed to save profile.')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = [
    styles.input,
    { backgroundColor: theme.bgCard, borderColor: theme.borderSubtle, color: theme.textPrimary },
  ]

  if (loading) {
    return (
      <ScreenWrapper>
        <ActivityIndicator color={theme.accent} style={{ marginTop: SPACE.xl }} />
      </ScreenWrapper>
    )
  }

  return (
    <ScreenWrapper>
      <View style={styles.container}>

        {/* Heading */}
        <Text style={[TEXT.headingLarge, { color: theme.textPrimary, marginBottom: SPACE.lg }]}>
          Profile
        </Text>

        {/* Email read-only */}
        {profile?.email && (
          <Text style={[TEXT.monoSmall, { color: theme.textFaint, marginBottom: SPACE.lg }]}>
            {profile.email}
          </Text>
        )}

        {/* Name */}
        <MetricLabel>Name</MetricLabel>
        <TextInput
          style={inputStyle}
          value={form.name ?? ''}
          onChangeText={v => set('name', v)}
          autoCorrect={false}
        />

        {/* Gender */}
        <MetricLabel style={{ marginTop: SPACE.md }}>Gender</MetricLabel>
        <View style={styles.chipRow}>
          {GENDERS.map(g => (
            <TouchableOpacity
              key={g.key}
              onPress={() => set('gender', g.key)}
              style={[
                styles.chip,
                {
                  borderColor:     form.gender === g.key ? theme.accent : theme.borderSubtle,
                  backgroundColor: form.gender === g.key ? theme.bgCardDeep : 'transparent',
                },
              ]}
            >
              <Text style={[styles.chipText, { color: form.gender === g.key ? theme.accent : theme.textMuted }]}>
                {g.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Training goal */}
        <MetricLabel style={{ marginTop: SPACE.md }}>Training goal</MetricLabel>
        <View style={styles.chipRow}>
          {GOALS.map(g => (
            <TouchableOpacity
              key={g.key}
              onPress={() => set('goal', g.key)}
              style={[
                styles.chip,
                {
                  borderColor:     form.goal === g.key ? theme.accent : theme.borderSubtle,
                  backgroundColor: form.goal === g.key ? theme.bgCardDeep : 'transparent',
                },
              ]}
            >
              <Text style={[styles.chipText, { color: form.goal === g.key ? theme.accent : theme.textMuted }]}>
                {g.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Gym days */}
        <MetricLabel style={{ marginTop: SPACE.md }}>Gym sessions / week</MetricLabel>
        <View style={styles.chipRow}>
          {[2, 3, 4, 5, 6].map(n => (
            <TouchableOpacity
              key={n}
              onPress={() => set('gym_days_week', n)}
              style={[
                styles.chip,
                {
                  borderColor:     form.gym_days_week === n ? theme.accent : theme.borderSubtle,
                  backgroundColor: form.gym_days_week === n ? theme.bgCardDeep : 'transparent',
                },
              ]}
            >
              <Text style={[styles.chipText, { color: form.gym_days_week === n ? theme.accent : theme.textMuted }]}>
                {n}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Garmin */}
        <MetricLabel style={{ marginTop: SPACE.md }}>Garmin Connect</MetricLabel>
        <TextInput
          style={inputStyle}
          value={form.garmin_email ?? ''}
          onChangeText={v => set('garmin_email', v)}
          placeholder="Garmin email"
          placeholderTextColor={theme.textFaint}
          autoCapitalize="none"
          keyboardType="email-address"
          autoCorrect={false}
        />
        <TextInput
          style={[inputStyle, { marginTop: SPACE.sm }]}
          value={form.garmin_password ?? ''}
          onChangeText={v => set('garmin_password', v)}
          placeholder="Garmin password"
          placeholderTextColor={theme.textFaint}
          secureTextEntry
        />

        {/* Save */}
        <ActionButton
          label={saving ? 'Saving…' : 'Save changes'}
          onPress={save}
          variant="accent"
          size="lg"
          fullWidth
          style={{ marginTop: SPACE.xl }}
        />

      </View>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  container: { paddingVertical: SPACE.xl },
  input:     { borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, marginBottom: 4 },
  chipRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip:      { borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 8 },
  chipText:  { fontSize: 12, fontFamily: 'JetBrainsMono', letterSpacing: 0.5 },
})