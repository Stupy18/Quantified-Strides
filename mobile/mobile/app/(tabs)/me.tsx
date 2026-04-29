import { useEffect, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  StyleSheet, Alert, Image,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system'
import { ScreenWrapper } from '../../src/components/layout/ScreenWrapper'
import { MetricLabel }   from '../../src/components/primitives/MetricLabel'
import { ActionButton }  from '../../src/components/primitives/ActionButton'
import { useTheme }      from '../../src/hooks/useTheme'
import { useAuth }       from '../../src/context/AuthContext'
import { apiGetMe, apiUpdateProfile, UserProfile, UpdateProfilePayload } from '../../src/api/auth'
import { SPACE, RADIUS, TEXT } from '../../src/theme'

type Goal   = 'athlete' | 'strength' | 'hypertrophy'
type Gender = 'male' | 'female'

const GENDERS: { key: Gender; label: string }[] = [
  { key: 'male',   label: 'Male' },
  { key: 'female', label: 'Female' },
]

const GOALS: { key: Goal; label: string }[] = [
  { key: 'athlete',     label: 'Multi-sport athlete' },
  { key: 'strength',    label: 'Strength' },
  { key: 'hypertrophy', label: 'Hypertrophy' },
]

export default function MeScreen() {
  const theme             = useTheme()
  const { token }         = useAuth()
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [profile,  setProfile]  = useState<UserProfile | null>(null)
  const [form,     setForm]     = useState<Partial<UserProfile>>({})

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

  async function pickImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,           // ask the picker to hand us base64 directly
    })
    if (result.canceled) return
    const asset = result.assets[0]
    // Prefer the base64 the picker already computed; fall back to FileSystem
    let base64 = asset.base64
    if (!base64) {
      base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' })
    }
    const mimeType = asset.mimeType ?? 'image/jpeg'
    set('profile_pic_url', `data:${mimeType};base64,${base64}`)
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
        ...(form.profile_pic_url ? { profile_pic_url: form.profile_pic_url } : {}),
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

  const initials = form.name ? form.name[0].toUpperCase() : '?'

  return (
    <ScreenWrapper>
      <View style={styles.container}>

        {/* ── Header ── */}
        <View style={styles.headerBlock}>
          <Text style={[styles.thisIsYou, { color: theme.textFaint }]}>THIS IS</Text>
          <Text style={[styles.youWord, { color: theme.accent }]}>YOU</Text>
          <View style={[styles.headingRule, { backgroundColor: theme.accent }]} />
        </View>

        {/* ── Avatar ── */}
        <View style={styles.avatarRow}>
          <TouchableOpacity onPress={pickImage} activeOpacity={0.8} style={styles.avatarWrap}>
            {form.profile_pic_url ? (
              <Image
                source={{ uri: form.profile_pic_url }}
                style={styles.avatarImage}
              />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: theme.bgCardDeep, borderColor: theme.borderSubtle }]}>
                <Text style={[styles.avatarInitial, { color: theme.accent }]}>{initials}</Text>
              </View>
            )}
            {/* Edit badge */}
            <View style={[styles.editBadge, { backgroundColor: theme.accent }]}>
              <Text style={styles.editBadgeText}>✎</Text>
            </View>
          </TouchableOpacity>
          {profile?.email && (
            <Text style={[TEXT.monoSmall, { color: theme.textFaint, marginTop: SPACE.sm }]}>
              {profile.email}
            </Text>
          )}
        </View>

        {/* ── Name ── */}
        <MetricLabel>Name</MetricLabel>
        <TextInput
          style={inputStyle}
          value={form.name ?? ''}
          onChangeText={v => set('name', v)}
          autoCorrect={false}
        />

        {/* ── Gender ── */}
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

        {/* ── Training goal ── */}
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

        {/* ── Gym days ── */}
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

        {/* ── Garmin ── */}
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

        {/* ── Save ── */}
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

const AVATAR_SIZE = 96

const styles = StyleSheet.create({
  container:        { paddingVertical: SPACE.xl },

  // Header
  headerBlock:      { marginBottom: SPACE.xl },
  thisIsYou:        { fontFamily: 'JetBrainsMono', fontSize: 11, letterSpacing: 4, marginBottom: 2 },
  youWord:          { fontFamily: 'Newsreader', fontSize: 48, lineHeight: 52 },
  headingRule:      { height: 1, width: 40, marginTop: 8, opacity: 0.6 },

  // Avatar
  avatarRow:        { alignItems: 'center', marginBottom: SPACE.xl },
  avatarWrap:       { position: 'relative' },
  avatarImage:      { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 },
  avatarPlaceholder:{ width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  avatarInitial:    { fontFamily: 'Newsreader', fontSize: 36 },
  editBadge:        { position: 'absolute', bottom: 2, right: 2, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  editBadgeText:    { color: '#fff', fontSize: 12 },

  // Fields
  input:            { borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, marginBottom: 4 },
  chipRow:          { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip:             { borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 8 },
  chipText:         { fontSize: 12, fontFamily: 'JetBrainsMono', letterSpacing: 0.5 },
})