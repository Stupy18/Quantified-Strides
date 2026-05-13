import { useEffect, useState, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  StyleSheet, Alert, Image, Animated, Modal, ScrollView,
  KeyboardAvoidingView, Platform, StatusBar,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { ScreenWrapper } from '../../src/components/layout/ScreenWrapper'
import { MetricLabel }   from '../../src/components/primitives/MetricLabel'
import { ActionButton }  from '../../src/components/primitives/ActionButton'
import { GhostButton }   from '../../src/components/primitives/GhostButton'
import { SportPickerMobile } from '../../src/components/blocks/SportPickerMobile'
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

// ─── Priority label ────────────────────────────────────────────────────────────

function priorityLabel(n: number): string {
  if (n >= 5) return 'Primary'
  if (n >= 3) return 'Secondary'
  return 'Light'
}

// ─── Theme toggle (preserved exactly as user had it) ──────────────────────────

function ThemeToggle() {
  const theme                    = useTheme()
  const { themeName, toggleTheme } = useThemeContext()
  const isCool                   = themeName === 'cool'

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
  const NUB_SIZE = 24
  const TRAVEL   = TRACK_W - NUB_SIZE - 8

  const nubX = anim.interpolate({
    inputRange:  [0, 1],
    outputRange: [4, 4 + TRAVEL],
  })

  return (
    <View style={settingsStyles.toggleRow}>
      <Text style={[settingsStyles.toggleIcon, { color: !isCool ? theme.accent : theme.textFaint }]}>☀︎</Text>
      <TouchableOpacity onPress={toggleTheme} activeOpacity={0.85}>
        <View style={[settingsStyles.track, { backgroundColor: theme.bgCardDeep, borderColor: theme.borderSubtle }]}>
          <Animated.View style={[settingsStyles.nub, { backgroundColor: theme.accent, transform: [{ translateX: nubX }] }]} />
        </View>
      </TouchableOpacity>
      <Text style={[settingsStyles.toggleIcon, { color: isCool ? theme.accent : theme.textFaint }]}>❄︎</Text>
    </View>
  )
}

// ─── Settings modal ────────────────────────────────────────────────────────────

interface SettingsModalProps {
  visible:  boolean
  onClose:  () => void
  profile:  UserProfile | null
  onSaved:  (updated: UserProfile) => void
  token:    string
}

function SettingsModal({ visible, onClose, profile, onSaved, token }: SettingsModalProps) {
  const theme  = useTheme()
  const [form, setForm]   = useState<Partial<UserProfile>>(profile ?? {})
  const [saving, setSaving] = useState(false)
  const slideAnim = useRef(new Animated.Value(0)).current

  // Sync form when profile changes (e.g. on first load)
  useEffect(() => { if (profile) setForm(profile) }, [profile])

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 1, useNativeDriver: true, tension: 70, friction: 12,
      }).start()
    } else {
      slideAnim.setValue(0)
    }
  }, [visible])

  function set<K extends keyof UserProfile>(k: K, v: UserProfile[K]) {
    setForm(p => ({ ...p, [k]: v }))
  }

  async function pickImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow access to your photo library.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7, base64: true,
    })
    if (result.canceled) return
    const asset = result.assets[0]
    let base64  = asset.base64
    if (!base64) base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' })
    set('profile_pic_url', `data:${asset.mimeType ?? 'image/jpeg'};base64,${base64}`)
  }

  async function save() {
    setSaving(true)
    try {
      const payload: UpdateProfilePayload = {
        name:            form.name,
        gender:          form.gender,
        goal:            form.goal,
        gym_days_week:   form.gym_days_week,
        primary_sports:  form.primary_sports ?? {},
        garmin_email:    form.garmin_email,
        garmin_password: form.garmin_password,
        ...(form.profile_pic_url ? { profile_pic_url: form.profile_pic_url } : {}),
      }
      const updated = await apiUpdateProfile(token, payload)
      onSaved(updated)
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      Alert.alert('Saved', 'Profile updated.')
      onClose()
    } catch {
      Alert.alert('Error', 'Failed to save profile.')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = [
    settingsStyles.input,
    { backgroundColor: theme.bgCard, borderColor: theme.borderSubtle, color: theme.textPrimary },
  ]

  const initials = form.name ? form.name[0].toUpperCase() : '?'

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[settingsStyles.modalRoot, { backgroundColor: theme.bgPage }]}>

        {/* Header bar */}
        <View style={[settingsStyles.modalHeader, { borderBottomColor: theme.divider }]}>
          <Text style={[settingsStyles.modalTitle, { color: theme.textFaint }]}>SETTINGS & PREFERENCES</Text>
          <TouchableOpacity onPress={onClose} style={[settingsStyles.closeBtn, { borderColor: theme.borderSubtle, backgroundColor: theme.bgCard }]}>
            <Text style={{ color: theme.textMuted, fontSize: 14 }}>✕</Text>
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={settingsStyles.modalBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            {/* Avatar */}
            <View style={settingsStyles.avatarCenter}>
              <TouchableOpacity onPress={pickImage} activeOpacity={0.8} style={settingsStyles.avatarWrap}>
                {form.profile_pic_url
                  ? <Image source={{ uri: form.profile_pic_url }} style={settingsStyles.avatarImg} />
                  : <View style={[settingsStyles.avatarPlaceholder, { backgroundColor: theme.bgCardDeep, borderColor: theme.borderSubtle }]}>
                      <Text style={[settingsStyles.avatarInitial, { color: theme.accent }]}>{initials}</Text>
                    </View>
                }
                <View style={[settingsStyles.editBadge, { backgroundColor: theme.accent }]}>
                  <Text style={{ color: '#fff', fontSize: 11 }}>✎</Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Name */}
            <MetricLabel>Name</MetricLabel>
            <TextInput style={inputStyle} value={form.name ?? ''} onChangeText={v => set('name', v)} autoCorrect={false} />

            {/* Biological sex */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: SPACE.md, marginBottom: 10 }}>
              <MetricLabel style={{ marginBottom: 0 }}>Biological sex</MetricLabel>
              <TouchableOpacity
                onPress={() => Alert.alert('Why we ask this', 'Biological sex is used solely for accurate athletic benchmarking; Things like VO2max norms and recovery baselines differ physiologically. It has nothing to do with how you identify.')}
                style={{ marginLeft: 6 }}
              >
                <Text style={{ fontFamily: 'JetBrainsMono', fontSize: 11, color: theme.textFaint }}>ⓘ</Text>
              </TouchableOpacity>
            </View>
            <View style={settingsStyles.chipRow}>
              {GENDERS.map(g => (
                <TouchableOpacity key={g.key} onPress={() => set('gender', g.key)}
                  style={[settingsStyles.chip, {
                    borderColor:     form.gender === g.key ? theme.accent : theme.borderSubtle,
                    backgroundColor: form.gender === g.key ? theme.bgCardDeep : 'transparent',
                  }]}>
                  <Text style={[settingsStyles.chipText, { color: form.gender === g.key ? theme.accent : theme.textMuted }]}>{g.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Training goal */}
            <MetricLabel style={{ marginTop: SPACE.md }}>Training goal</MetricLabel>
            <View style={settingsStyles.chipRow}>
              {GOALS.map(g => (
                <TouchableOpacity key={g.key} onPress={() => set('goal', g.key)}
                  style={[settingsStyles.chip, {
                    borderColor:     form.goal === g.key ? theme.accent : theme.borderSubtle,
                    backgroundColor: form.goal === g.key ? theme.bgCardDeep : 'transparent',
                  }]}>
                  <Text style={[settingsStyles.chipText, { color: form.goal === g.key ? theme.accent : theme.textMuted }]}>{g.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Gym days */}
            <MetricLabel style={{ marginTop: SPACE.md }}>Gym sessions / week</MetricLabel>
            <View style={settingsStyles.chipRow}>
              {[2, 3, 4, 5, 6].map(n => (
                <TouchableOpacity key={n} onPress={() => set('gym_days_week', n)}
                  style={[settingsStyles.chip, {
                    borderColor:     form.gym_days_week === n ? theme.accent : theme.borderSubtle,
                    backgroundColor: form.gym_days_week === n ? theme.bgCardDeep : 'transparent',
                  }]}>
                  <Text style={[settingsStyles.chipText, { color: form.gym_days_week === n ? theme.accent : theme.textMuted }]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Active sports */}
            <MetricLabel style={{ marginTop: SPACE.md }}>Active sports</MetricLabel>
            <Text style={{ fontFamily: 'JetBrainsMono', fontSize: 10, color: theme.textFaint, marginBottom: SPACE.sm, lineHeight: 16 }}>
              Tap to toggle. Set priority 1 (light) → 5 (primary focus).
            </Text>
            <SportPickerMobile
              value={form.primary_sports ?? {}}
              onChange={v => set('primary_sports', v)}
            />

            {/* Garmin */}
            <MetricLabel style={{ marginTop: SPACE.md }}>Garmin Connect</MetricLabel>
            <TextInput style={inputStyle} value={form.garmin_email ?? ''} onChangeText={v => set('garmin_email', v)}
              placeholder="Garmin email" placeholderTextColor={theme.textFaint}
              autoCapitalize="none" keyboardType="email-address" autoCorrect={false} />
            <TextInput style={[inputStyle, { marginTop: SPACE.sm }]} value={form.garmin_password ?? ''} onChangeText={v => set('garmin_password', v)}
              placeholder="Garmin password" placeholderTextColor={theme.textFaint} secureTextEntry />

            {/* Theme */}
            <View style={[settingsStyles.themeCard, { backgroundColor: theme.bgCard, borderColor: theme.borderSubtle }]}>
              <View style={{ flex: 1 }}>
                <MetricLabel style={{ marginBottom: 2 }}>Theme</MetricLabel>
                <Text style={[settingsStyles.themeHint, { color: theme.textFaint }]}>Warm amber · Cool crimson</Text>
              </View>
              <ThemeToggle />
            </View>

            {/* Save */}
            <ActionButton label={saving ? 'Saving…' : 'Save changes'} onPress={save}
              variant="accent" size="lg" fullWidth style={{ marginTop: SPACE.xl }} />

          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

// ─── Profile view ──────────────────────────────────────────────────────────────

export default function MeScreen() {
  const theme             = useTheme()
  const { token, logout } = useAuth()
  const [loading,  setLoading]  = useState(true)
  const [profile,  setProfile]  = useState<UserProfile | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    if (!token) { setLoading(false); return }
    apiGetMe(token)
      .then(p => setProfile(p))
      .catch(() => Alert.alert('Error', 'Could not load profile.'))
      .finally(() => setLoading(false))
  }, [token])

  async function handleLogout() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out', style: 'destructive',
        onPress: async () => {
          await AsyncStorage.removeItem('qs_checkin_date')
          useCheckInStore.getState().closeModal()
          useCheckInStore.setState({ submittedToday: false, hydrated: false })
          await logout()
        },
      },
    ])
  }

  if (loading) {
    return (
      <ScreenWrapper>
        <ActivityIndicator color={theme.accent} style={{ marginTop: SPACE.xl }} />
      </ScreenWrapper>
    )
  }

  const initials       = profile?.name ? profile.name[0].toUpperCase() : '?'
  const sportsEntries  = Object.entries(profile?.primary_sports ?? {})
    .sort(([, a], [, b]) => b - a)
  const garminConnected = !!(profile?.garmin_email && profile.garmin_email.trim())
  const goalLabel      = GOALS.find(g => g.key === profile?.goal)?.label ?? profile?.goal ?? '—'
  const sexLabel       = GENDERS.find(g => g.key === profile?.gender)?.label

  return (
    <ScreenWrapper scrollable>
      <View style={profileStyles.container}>

        {/* ── Header ── */}
        <View style={profileStyles.headerBlock}>
          <Text style={[profileStyles.thisIs, { color: theme.textFaint }]}>THIS IS</Text>
          <Text style={[profileStyles.youWord, { color: theme.accent }]}>YOU</Text>
          <View style={[profileStyles.rule, { backgroundColor: theme.accent }]} />
        </View>

        {/* ── Avatar + name + sex ── */}
        <View style={profileStyles.heroRow}>
          <View style={profileStyles.avatarWrap}>
            {profile?.profile_pic_url
              ? <Image source={{ uri: profile.profile_pic_url }} style={profileStyles.avatarImg} />
              : <View style={[profileStyles.avatarPlaceholder, { backgroundColor: theme.bgCardDeep, borderColor: theme.borderSubtle }]}>
                  <Text style={[profileStyles.avatarInitial, { color: theme.accent }]}>{initials}</Text>
                </View>
            }
          </View>
          <View style={profileStyles.heroText}>
            <Text style={[profileStyles.nameText, { color: theme.textPrimary }]}>
              {profile?.name ?? '—'}
            </Text>
            {sexLabel && (
              <Text style={[profileStyles.sexText, { color: theme.textFaint }]}>
                {sexLabel}
              </Text>
            )}
            <Text style={[profileStyles.emailText, { color: theme.textFaint }]}>
              {profile?.email ?? ''}
            </Text>
          </View>
        </View>

        {/* ── Goal + gym days ── */}
        <View style={[profileStyles.card, { backgroundColor: theme.bgCard, borderColor: theme.borderSubtle }]}>
          <View style={profileStyles.statRow}>
            <View style={profileStyles.statItem}>
              <Text style={[profileStyles.statLabel, { color: theme.textFaint }]}>GOAL</Text>
              <Text style={[profileStyles.statValue, { color: theme.textPrimary }]}>{goalLabel}</Text>
            </View>
            <View style={[profileStyles.statDivider, { backgroundColor: theme.divider }]} />
            <View style={profileStyles.statItem}>
              <Text style={[profileStyles.statLabel, { color: theme.textFaint }]}>GYM DAYS</Text>
              <Text style={[profileStyles.statValue, { color: theme.textPrimary }]}>
                {profile?.gym_days_week ?? '—'}<Text style={[profileStyles.statUnit, { color: theme.textFaint }]}> / wk</Text>
              </Text>
            </View>
          </View>
        </View>

        {/* ── Sports ── */}
        {sportsEntries.length > 0 && (
          <View style={[profileStyles.card, { backgroundColor: theme.bgCard, borderColor: theme.borderSubtle }]}>
            <Text style={[profileStyles.cardLabel, { color: theme.textFaint }]}>ACTIVE SPORTS</Text>
            {sportsEntries.map(([sport, priority]) => (
              <View key={sport} style={profileStyles.sportRow}>
                <Text style={[profileStyles.sportName, { color: theme.textPrimary }]}>
                  {sport.charAt(0).toUpperCase() + sport.slice(1).replace('_', ' ')}
                </Text>
                <View style={[profileStyles.priorityBadge, { borderColor: theme.accent + '50', backgroundColor: theme.accent + '15' }]}>
                  <Text style={[profileStyles.priorityText, { color: theme.accent }]}>
                    {priorityLabel(priority)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── Garmin status ── */}
        <View style={[profileStyles.card, { backgroundColor: theme.bgCard, borderColor: theme.borderSubtle }]}>
          <View style={profileStyles.garminRow}>
            <Text style={[profileStyles.garminLabel, { color: theme.textFaint }]}>GARMIN CONNECT</Text>
            <View style={[
              profileStyles.garminBadge,
              { backgroundColor: garminConnected ? theme.accent + '18' : theme.bgCardDeep,
                borderColor:     garminConnected ? theme.accent + '60' : theme.borderSubtle },
            ]}>
              <Text style={[profileStyles.garminStatus, { color: garminConnected ? theme.accent : theme.textFaint }]}>
                {garminConnected ? '● Connected' : '○ Not connected'}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Settings button ── */}
        <TouchableOpacity
          onPress={() => setSettingsOpen(true)}
          activeOpacity={0.8}
          style={[profileStyles.settingsBtn, { borderColor: theme.borderSubtle, backgroundColor: theme.bgCard }]}
        >
          <Text style={[profileStyles.settingsBtnText, { color: theme.textMuted }]}>⚙  SETTINGS & PREFERENCES</Text>
        </TouchableOpacity>

        {/* ── Logout ── */}
        <GhostButton
          label="Sign out"
          onPress={handleLogout}
          variant="danger"
          size="lg"
          fullWidth
          style={{ marginTop: SPACE.sm, marginBottom: SPACE.xl }}
        />

      </View>

      {/* ── Settings modal ── */}
      {token && (
        <SettingsModal
          visible={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          profile={profile}
          onSaved={updated => setProfile(updated)}
          token={token}
        />
      )}

    </ScreenWrapper>
  )
}

// ─── Profile view styles ───────────────────────────────────────────────────────

const AVATAR = 72

const profileStyles = StyleSheet.create({
  container:        { paddingVertical: SPACE.xl },

  headerBlock:      { marginBottom: SPACE.xl },
  thisIs:           { fontFamily: 'JetBrainsMono', fontSize: 10, letterSpacing: 4, marginBottom: 2 },
  youWord:          { fontFamily: 'Newsreader', fontSize: 48, lineHeight: 52 },
  rule:             { height: 1, width: 40, marginTop: 8, opacity: 0.6 },

  heroRow:          { flexDirection: 'row', alignItems: 'center', marginBottom: SPACE.xl, gap: SPACE.lg },
  avatarWrap:       { position: 'relative' },
  avatarImg:        { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 },
  avatarPlaceholder:{ width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  avatarInitial:    { fontFamily: 'Newsreader', fontSize: 30 },
  heroText:         { flex: 1 },
  nameText:         { fontFamily: 'Newsreader', fontSize: 26, lineHeight: 30 },
  sexText:          { fontFamily: 'JetBrainsMono', fontSize: 10, letterSpacing: 1.5, marginTop: 2 },
  emailText:        { fontFamily: 'JetBrainsMono', fontSize: 9, letterSpacing: 0.5, marginTop: 4, opacity: 0.6 },

  card:             { borderWidth: 1, borderRadius: RADIUS.lg, padding: SPACE.md, marginBottom: SPACE.md },
  cardLabel:        { fontFamily: 'JetBrainsMono', fontSize: 9, letterSpacing: 2, marginBottom: SPACE.sm },

  statRow:          { flexDirection: 'row', alignItems: 'center' },
  statItem:         { flex: 1, alignItems: 'center' },
  statDivider:      { width: 1, height: 36, marginHorizontal: SPACE.md },
  statLabel:        { fontFamily: 'JetBrainsMono', fontSize: 9, letterSpacing: 2, marginBottom: 4 },
  statValue:        { fontFamily: 'Newsreader', fontSize: 22 },
  statUnit:         { fontFamily: 'JetBrainsMono', fontSize: 11 },

  sportRow:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  sportName:        { fontFamily: 'JetBrainsMono', fontSize: 12, letterSpacing: 0.5 },
  priorityBadge:    { borderWidth: 1, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 3 },
  priorityText:     { fontFamily: 'JetBrainsMono', fontSize: 9, letterSpacing: 1 },

  garminRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  garminLabel:      { fontFamily: 'JetBrainsMono', fontSize: 9, letterSpacing: 2 },
  garminBadge:      { borderWidth: 1, borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 4 },
  garminStatus:     { fontFamily: 'JetBrainsMono', fontSize: 10, letterSpacing: 0.5 },

  settingsBtn:      { borderWidth: 1, borderRadius: RADIUS.lg, paddingVertical: SPACE.md, alignItems: 'center', marginBottom: SPACE.sm, marginTop: SPACE.lg },
  settingsBtnText:  { fontFamily: 'JetBrainsMono', fontSize: 11, letterSpacing: 2 },
})

// ─── Settings modal styles ─────────────────────────────────────────────────────

const settingsStyles = StyleSheet.create({
  modalRoot:    { flex: 1 },
  modalHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md, borderBottomWidth: 1 },
  modalTitle:   { fontFamily: 'JetBrainsMono', fontSize: 10, letterSpacing: 3 },
  closeBtn:     { width: 32, height: 32, borderRadius: RADIUS.full, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  modalBody:    { padding: SPACE.lg, paddingBottom: SPACE.xxxl },

  avatarCenter: { alignItems: 'center', marginBottom: SPACE.xl },
  avatarWrap:   { position: 'relative' },
  avatarImg:    { width: 80, height: 80, borderRadius: 40 },
  avatarPlaceholder: { width: 80, height: 80, borderRadius: 40, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  avatarInitial:{ fontFamily: 'Newsreader', fontSize: 32 },
  editBadge:    { position: 'absolute', bottom: 2, right: 2, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

  input:        { borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, marginBottom: 4 },
  chipRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip:         { borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 8 },
  chipText:     { fontSize: 12, fontFamily: 'JetBrainsMono', letterSpacing: 0.5 },

  themeCard:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: RADIUS.lg, paddingHorizontal: SPACE.md, paddingVertical: SPACE.md, marginTop: SPACE.xl },
  themeHint:    { fontFamily: 'JetBrainsMono', fontSize: 10, letterSpacing: 0.5 },

  toggleRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toggleIcon:   { fontSize: 18, width: 22, textAlign: 'center' },
  track:        { width: 72, height: 32, borderRadius: 16, borderWidth: 1, justifyContent: 'center' },
  nub:          { width: 24, height: 24, borderRadius: 12, position: 'absolute' },
})