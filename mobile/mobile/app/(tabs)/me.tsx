import { useEffect, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  StyleSheet, Alert, Image, Animated,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { ScreenWrapper } from '../../src/components/layout/ScreenWrapper'
import { MetricLabel }   from '../../src/components/primitives/MetricLabel'
import { ActionButton }  from '../../src/components/primitives/ActionButton'
import { GhostButton }   from '../../src/components/primitives/GhostButton'
import { useTheme }      from '../../src/hooks/useTheme'
import { useThemeContext } from '../../src/context/ThemeContext'
import { useAuth }       from '../../src/context/AuthContext'
import { useCheckInStore } from '../../src/store/checkInStore'
import { apiGetMe, apiUpdateProfile, UserProfile, UpdateProfilePayload } from '../../src/api/auth'
import { queryClient } from '../../src/api/queryClient'
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

// ─── Theme toggle ─────────────────────────────────────────────────────────────

function ThemeToggle() {
  const theme                    = useTheme()
  const { themeName, toggleTheme } = useThemeContext()
  const isCool                   = themeName === 'cool'

  // Slide the nub: 0 = cool (left), 1 = warm (right)
  const [anim] = useState(new Animated.Value(isCool ? 1 : 0))

  useEffect(() => {
    Animated.spring(anim, {
      toValue:         isCool ? 1 : 0,
      useNativeDriver: true,
      tension:         80,
      friction:        10,
    }).start()
  }, [isCool])

  const TRACK_W  = 72
  const TRACK_H  = 32
  const NUB_SIZE = 24
  const TRAVEL   = TRACK_W - NUB_SIZE - 8  // 8 = 4px padding each side

  const nubX = anim.interpolate({
    inputRange:  [0, 1],
    outputRange: [4, 4 + TRAVEL],
  })

  return (
    <View style={styles.toggleRow}>
      {/* Sun */}
      <Text style={[styles.toggleIcon, { color: !isCool ? theme.accent : theme.textFaint }]}>☀︎</Text>

      <TouchableOpacity onPress={toggleTheme} activeOpacity={0.85}>
        <View style={[
          styles.track,
          { backgroundColor: theme.bgCardDeep, borderColor: theme.borderSubtle },
        ]}>
          <Animated.View
            style={[
              styles.nub,
              {
                backgroundColor: theme.accent,
                transform: [{ translateX: nubX }],
              },
            ]}
          />
        </View>
      </TouchableOpacity>

      {/* Snowflake */}
      <Text style={[styles.toggleIcon, { color: isCool ? theme.accent : theme.textFaint }]}>❄︎</Text>
    </View>
  )
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function MeScreen() {
  const theme         = useTheme()
  const { token, logout } = useAuth()
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
      base64: true,
    })
    if (result.canceled) return
    const asset    = result.assets[0]
    let base64     = asset.base64
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
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      Alert.alert('Saved', 'Profile updated.')
    } catch {
      Alert.alert('Error', 'Failed to save profile.')
    } finally {
      setSaving(false)
    }
  }


  async function handleLogout() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          // Reset check-in store so next user/session starts fresh
          await AsyncStorage.removeItem('qs_checkin_date')  // ← add this line
          useCheckInStore.getState().closeModal()
          useCheckInStore.setState({ submittedToday: false, hydrated: false })
          await logout()
          // AuthGate in _layout will redirect to /(auth)/login automatically
        },
      },
    ])
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
              <Image source={{ uri: form.profile_pic_url }} style={styles.avatarImage} />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: theme.bgCardDeep, borderColor: theme.borderSubtle }]}>
                <Text style={[styles.avatarInitial, { color: theme.accent }]}>{initials}</Text>
              </View>
            )}
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

        {/* ── Theme toggle ── */}
        <View style={[styles.themeCard, { backgroundColor: theme.bgCard, borderColor: theme.borderSubtle }]}>
          <View style={styles.themeCardLeft}>
            <MetricLabel style={{ marginBottom: 2 }}>Theme</MetricLabel>
            <Text style={[styles.themeHint, { color: theme.textFaint }]}>
              Warm amber · Cool crimson
            </Text>
          </View>
          <ThemeToggle />
        </View>

        {/* ── Save ── */}
        <ActionButton
          label={saving ? 'Saving…' : 'Save changes'}
          onPress={save}
          variant="accent"
          size="lg"
          fullWidth
          style={{ marginTop: SPACE.xl }}
        />

        {/* ── Logout ── */}
        <GhostButton
          label="Sign out"
          onPress={handleLogout}
          variant="danger"
          size="lg"
          fullWidth
          style={{ marginTop: SPACE.md, marginBottom: SPACE.xl }}
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

  // Theme toggle card
  themeCard:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: RADIUS.lg, paddingHorizontal: SPACE.md, paddingVertical: SPACE.md, marginTop: SPACE.xl },
  themeCardLeft:    { flex: 1 },
  themeHint:        { fontFamily: 'JetBrainsMono', fontSize: 10, letterSpacing: 0.5 },

  // Toggle
  toggleRow:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toggleIcon:       { fontSize: 18, width: 22, textAlign: 'center' },
  track:            { width: 72, height: 32, borderRadius: 16, borderWidth: 1, justifyContent: 'center' },
  nub:              { width: 24, height: 24, borderRadius: 12, position: 'absolute' },

})