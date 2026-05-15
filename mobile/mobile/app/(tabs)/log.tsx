import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, StyleSheet, TextInput, ScrollView,
  TouchableOpacity, ActivityIndicator, type TextInput as TextInputType,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { InfoCard }       from '../../src/components/blocks/InfoCard'
import { WorkoutListRow } from '../../src/components/blocks/WorkoutListRow'
import { MetricLabel }    from '../../src/components/primitives/MetricLabel'
import { Hairline }       from '../../src/components/primitives/Hairline'
import { CheckInFAB }          from '../../src/components/checkin/CheckInFAB'
import { CheckInModal }         from '../../src/components/checkin/CheckInModal'
import { SessionDetailSheet }   from '../../src/components/strength/SessionDetailSheet'
import { useTheme }       from '../../src/hooks/useTheme'
import { TEXT, SPACE, RADIUS, FONT } from '../../src/theme'
import {
  searchExercises, createStrengthSession, fetchStrengthSessions,
  type ExerciseResult, type StrengthSessionListItem,
} from '../../src/api/endpoints/strength'
import { saveWorkoutReflection } from '../../src/api/endpoints/checkin'

// ── Types ─────────────────────────────────────────────────────────────────────

type SessionDisplayType = 'upper_push' | 'upper_pull' | 'lower' | 'full'
interface SetInput       { reps: string; weight_kg: string }
interface ExerciseInput  { id: string; name: string; sets: SetInput[] }

let _lid = 0
const nextId = () => String(++_lid)

// ── Session type config ───────────────────────────────────────────────────────

const SESSION_TYPES: { key: SessionDisplayType; label: string; apiValue: 'upper' | 'lower' | null }[] = [
  { key: 'upper_push', label: 'Upper push', apiValue: 'upper' },
  { key: 'upper_pull', label: 'Upper pull', apiValue: 'upper' },
  { key: 'lower',      label: 'Lower body', apiValue: 'lower' },
  { key: 'full',       label: 'Full body',  apiValue: null    },
]

// ── Date helpers ──────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toLocaleDateString('en-CA')
}

function formatSessionDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()
}

function sessionTypeLabel(t: 'upper' | 'lower' | null): string {
  if (t === 'upper') return 'Upper body'
  if (t === 'lower') return 'Lower body'
  return 'Full body'
}

function sessionTypeTag(t: 'upper' | 'lower' | null): string {
  if (t === 'upper') return 'UPPER'
  if (t === 'lower') return 'LOWER'
  return 'GYM'
}

function sessionsThisWeek(sessions: StrengthSessionListItem[]): number {
  const now  = new Date()
  const dow  = now.getDay()
  const mon  = new Date(now)
  mon.setDate(now.getDate() - ((dow + 6) % 7))
  mon.setHours(0, 0, 0, 0)
  return sessions.filter(s => {
    const [y, m, d] = s.session_date.split('-').map(Number)
    return new Date(y, m - 1, d) >= mon
  }).length
}

// ── Dot selector (readiness dots, 1–N scale) ─────────────────────────────────

function DotSelector({ value, max = 10, onChange }: {
  value: number; max?: number; onChange: (v: number) => void
}) {
  const theme = useTheme()
  return (
    <View style={dotS.row}>
      {Array.from({ length: max }, (_, i) => i + 1).map(i => (
        <TouchableOpacity
          key={i}
          onPress={() => onChange(i)}
          hitSlop={{ top: 8, bottom: 8, left: 3, right: 3 }}
          style={[
            dotS.dot,
            i <= value
              ? { backgroundColor: theme.accent, borderColor: theme.accent }
              : { backgroundColor: 'transparent', borderColor: theme.textFaint },
          ]}
        />
      ))}
    </View>
  )
}
const dotS = StyleSheet.create({
  row: { flexDirection: 'row', gap: SPACE.sm, paddingVertical: SPACE.xs },
  dot: { width: SPACE.lg - 4, height: SPACE.lg - 4, borderRadius: RADIUS.full, borderWidth: 1.5 },
})

// ── Load-feel selector (−2 to +2) ────────────────────────────────────────────

const LOAD_OPTS = [
  { value: -2, num: '−2', label: 'too\neasy' },
  { value: -1, num: '−1', label: 'easy'      },
  { value:  0, num: ' 0', label: 'ok'        },
  { value:  1, num: '+1', label: 'hard'      },
  { value:  2, num: '+2', label: 'too\nhard' },
]

function LoadFeelSelector({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const theme = useTheme()
  return (
    <View style={lfS.row}>
      {LOAD_OPTS.map(o => (
        <TouchableOpacity
          key={o.value}
          onPress={() => onChange(o.value)}
          activeOpacity={0.7}
          style={[
            lfS.item,
            { borderColor: o.value === value ? theme.accent : theme.borderSubtle },
            o.value === value && { backgroundColor: theme.accent + '1A' },
          ]}
        >
          <Text style={[TEXT.monoMedium, { color: o.value === value ? theme.accent : theme.textMuted, textAlign: 'center' }]}>
            {o.num}
          </Text>
          <Text style={[TEXT.monoSmall, { color: o.value === value ? theme.accent : theme.textFaint, textAlign: 'center', marginTop: 2, textTransform: 'uppercase' }]}>
            {o.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}
const lfS = StyleSheet.create({
  row:  { flexDirection: 'row', gap: SPACE.xs, marginVertical: SPACE.xs },
  item: { flex: 1, alignItems: 'center', paddingVertical: SPACE.sm + 2, borderRadius: RADIUS.md, borderWidth: 1 },
})

// ── Compact numeric input ─────────────────────────────────────────────────────

function NumInput({ value, onChange, placeholder, width = 44, integer = false }: {
  value: string; onChange: (v: string) => void
  placeholder?: string; width?: number; integer?: boolean
}) {
  const theme = useTheme()
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      keyboardType={integer ? 'number-pad' : 'decimal-pad'}
      placeholder={placeholder ?? '—'}
      placeholderTextColor={theme.textFaint}
      style={[
        TEXT.monoLarge,
        {
          width,
          height:          30,
          borderRadius:    RADIUS.sm,
          borderWidth:     1,
          borderColor:     theme.borderSubtle,
          backgroundColor: theme.bgCardDeep,
          color:           theme.textPrimary,
          textAlign:       'center',
        },
      ]}
    />
  )
}

// ── Session type chip ─────────────────────────────────────────────────────────

function SessionChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = useTheme()
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        chipS.chip,
        active
          ? { backgroundColor: theme.accent, borderColor: theme.accent }
          : { backgroundColor: 'transparent', borderColor: theme.textFaint },
      ]}
    >
      <Text style={[
        TEXT.monoMedium,
        {
          textTransform: 'uppercase',
          color: active ? theme.textOnAccent : theme.textMuted,
        },
      ]}>
        {label}
      </Text>
    </TouchableOpacity>
  )
}
const chipS = StyleSheet.create({
  chip: { paddingVertical: SPACE.sm - 1, paddingHorizontal: SPACE.md, borderRadius: RADIUS.pill, borderWidth: 1 },
})

// ── Screen ────────────────────────────────────────────────────────────────────

export default function LogScreen() {
  const theme        = useTheme()
  const queryClient  = useQueryClient()
  const scrollRef      = useRef<ScrollView>(null)
  const builderY       = useRef(0)
  const searchInputRef = useRef<TextInputType>(null)

  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null)

  // ── Recent sessions ────────────────────────────────────────────────────────
  const { data: sessions = [], isLoading: sessLoading } = useQuery({
    queryKey: ['strengthSessions'],
    queryFn:  () => fetchStrengthSessions(30),
    staleTime: 2 * 60 * 1000,
  })

  // ── Active session builder ─────────────────────────────────────────────────
  const [sessionType,    setSessionType]   = useState<SessionDisplayType>('upper_push')
  const [exercises,      setExercises]     = useState<ExerciseInput[]>([])
  const [search,         setSearch]        = useState('')
  const [searchResults,  setSearchResults] = useState<ExerciseResult[]>([])
  const [searching,      setSearching]     = useState(false)
  const [sessionSaved,   setSessionSaved]  = useState(false)
  const [savedSessionId, setSavedSessionId] = useState<number | null>(null)
  const [savingSession,  setSavingSession] = useState(false)
  const [sessionError,   setSessionError]  = useState<string | null>(null)

  // ── Post-workout reflection ────────────────────────────────────────────────
  const [rpe,        setRpe]        = useState(7)
  const [quality,    setQuality]    = useState(7)
  const [loadFeel,   setLoadFeel]   = useState(0)
  const [reflNotes,  setReflNotes]  = useState('')
  const [reflSaved,  setReflSaved]  = useState(false)
  const [savingRefl, setSavingRefl] = useState(false)
  const [reflError,  setReflError]  = useState<string | null>(null)

  // ── Debounced exercise search ──────────────────────────────────────────────
  useEffect(() => {
    if (search.trim().length < 2) { setSearchResults([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await searchExercises(search.trim())
        setSearchResults(res.slice(0, 6))
      } catch { setSearchResults([]) }
      finally  { setSearching(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  // ── Exercise helpers ───────────────────────────────────────────────────────
  function addExercise(ex: ExerciseResult) {
    setExercises(prev => [...prev, { id: nextId(), name: ex.name, sets: [{ reps: '', weight_kg: '' }] }])
    setSearch('')
    setSearchResults([])
  }
  function removeExercise(id: string) {
    setExercises(prev => prev.filter(e => e.id !== id))
  }
  function addSet(id: string) {
    setExercises(prev => prev.map(e =>
      e.id === id ? { ...e, sets: [...e.sets, { reps: '', weight_kg: '' }] } : e
    ))
  }
  function removeSet(id: string, idx: number) {
    setExercises(prev => prev.map(e =>
      e.id === id ? { ...e, sets: e.sets.filter((_, i) => i !== idx) } : e
    ))
  }
  function updateSet(id: string, idx: number, field: 'reps' | 'weight_kg', val: string) {
    setExercises(prev => prev.map(e =>
      e.id === id ? { ...e, sets: e.sets.map((s, i) => i === idx ? { ...s, [field]: val } : s) } : e
    ))
  }

  // ── Finish session ─────────────────────────────────────────────────────────
  async function finishSession() {
    if (exercises.length === 0) return
    setSavingSession(true)
    setSessionError(null)
    const apiType = SESSION_TYPES.find(t => t.key === sessionType)?.apiValue ?? null
    try {
      const result = await createStrengthSession({
        session_date: todayISO(),
        session_type: apiType,
        raw_notes:    null,
        exercises: exercises.map((ex, order) => ({
          exercise_order: order + 1,
          name:           ex.name,
          notes:          null,
          sets: ex.sets.map((s, i) => ({
            set_number:          i + 1,
            reps:                s.reps      ? parseInt(s.reps, 10)    : undefined,
            weight_kg:           s.weight_kg ? parseFloat(s.weight_kg) : undefined,
            is_bodyweight:       false,
            per_hand:            false,
            per_side:            false,
            plus_bar:            false,
            weight_includes_bar: false,
          })),
        })),
      })
      setExercises([])
      setSearch('')
      setSearchResults([])
      setSavedSessionId(result.session_id)
      setSessionSaved(true)
      queryClient.invalidateQueries({ queryKey: ['strengthSessions'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    } catch (e: any) {
      setSessionError(e?.response?.data?.detail ?? e?.message ?? 'Failed to save session')
    } finally {
      setSavingSession(false)
    }
  }

  // ── Save reflection ────────────────────────────────────────────────────────
  async function saveReflection() {
    setSavingRefl(true)
    setReflError(null)
    try {
      await saveWorkoutReflection({
        entry_date:      todayISO(),
        session_rpe:     rpe,
        session_quality: quality,
        load_feel:       loadFeel,
        notes:           reflNotes.trim() || null,
        workout_id:      null,
        session_id:      savedSessionId,
      })
      setReflSaved(true)
    } catch (e: any) {
      setReflError(e?.response?.data?.detail ?? e?.message ?? 'Failed to save reflection')
    } finally {
      setSavingRefl(false)
    }
  }

  function newSession() {
    setExercises([])
    setSearch('')
    setSearchResults([])
    setSessionSaved(false)
    setSessionError(null)
    setSavedSessionId(null)
    setRpe(7); setQuality(7); setLoadFeel(0)
    setReflNotes(''); setReflSaved(false); setReflError(null)
    setTimeout(() => scrollRef.current?.scrollTo({ y: builderY.current, animated: true }), 80)
  }

  const recentSessions  = sessions.slice(0, 5)
  const weekCount       = sessionsThisWeek(sessions)

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bgPage }}>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
      >

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <View>
          <Text style={[TEXT.displaySmall, { color: theme.textPrimary }]}>Log</Text>
          <Text style={[TEXT.narrativeLarge, { color: theme.textMuted, marginTop: 2 }]}>strength &amp; sessions</Text>
        </View>
        <TouchableOpacity
          onPress={newSession}
          activeOpacity={0.8}
          style={[s.newBtn, { backgroundColor: theme.accent }]}
        >
          <Text style={[TEXT.monoMedium, { color: theme.textOnAccent, textTransform: 'uppercase' }]}>
            + New session
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Recent sessions ─────────────────────────────────────────────── */}
      {sessLoading ? (
        <InfoCard>
          <View style={s.loadingRow}>
            <ActivityIndicator color={theme.accent} />
          </View>
        </InfoCard>
      ) : recentSessions.length > 0 ? (
        <InfoCard noPadding>
          {recentSessions.map((sess, i) => (
            <WorkoutListRow
              key={sess.session_id}
              title={sessionTypeLabel(sess.session_type)}
              subtitle={`${sess.total_exercises} exercise${sess.total_exercises !== 1 ? 's' : ''} · ${sess.total_sets} sets`}
              date={formatSessionDate(sess.session_date)}
              tag={sessionTypeTag(sess.session_type)}
              isLast={i === recentSessions.length - 1}
              onPress={() => setSelectedSessionId(sess.session_id)}
            />
          ))}
        </InfoCard>
      ) : null}

      {/* ── This week counter ───────────────────────────────────────────── */}
      {sessions.length > 0 && (
        <Text style={[TEXT.monoSmall, s.weekCounter, { color: theme.textFaint }]}>
          {weekCount} session{weekCount !== 1 ? 's' : ''} this week
        </Text>
      )}

      {/* ── Active session builder ───────────────────────────────────────── */}
      <View onLayout={(e) => { builderY.current = e.nativeEvent.layout.y }}>
      {!sessionSaved ? (
        <InfoCard>
          <MetricLabel style={s.noMargin}>Today's session</MetricLabel>

          {/* Session type chips */}
          <View style={s.chipRow}>
            {SESSION_TYPES.map(({ key, label }) => (
              <SessionChip
                key={key}
                label={label}
                active={sessionType === key}
                onPress={() => setSessionType(key)}
              />
            ))}
          </View>

          <Hairline />

          {/* Exercise search */}
          <TextInput
            ref={searchInputRef}
            value={search}
            onChangeText={setSearch}
            placeholder="Search 800+ exercises…"
            placeholderTextColor={theme.textFaint}
            style={[
              TEXT.bodyMedium,
              s.searchInput,
              { color: theme.textPrimary, borderColor: theme.borderSubtle, backgroundColor: theme.bgCardDeep },
            ]}
          />

          {/* Search results */}
          {(searching || searchResults.length > 0) && (
            <View style={[s.resultsCard, { borderColor: theme.borderSubtle, backgroundColor: theme.bgCardDeep }]}>
              {searching && (
                <View style={s.searchLoading}>
                  <ActivityIndicator size="small" color={theme.accent} />
                </View>
              )}
              {!searching && searchResults.map((ex, i) => (
                <TouchableOpacity
                  key={ex.exercise_id}
                  onPress={() => addExercise(ex)}
                  activeOpacity={0.7}
                  style={[s.resultRow, i < searchResults.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.divider }]}
                >
                  <Text style={[TEXT.bodyMedium, { color: theme.textPrimary, fontWeight: '500' }]}>
                    {ex.name}
                  </Text>
                  {ex.primary_muscles.length > 0 && (
                    <Text style={[TEXT.monoSmall, { color: theme.textFaint }]}>
                      {ex.primary_muscles.slice(0, 3).join(' · ').toUpperCase()}
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Hairline />

          {/* Exercise rows */}
          {exercises.map((ex, exIdx) => (
            <View key={ex.id}>
              {/* Exercise name row */}
              <View style={s.exHeader}>
                <Text style={[TEXT.headingMedium, { color: theme.textPrimary, flex: 1, letterSpacing: -0.15 }]}>
                  {ex.name}
                </Text>
                <TouchableOpacity onPress={() => removeExercise(ex.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={[TEXT.bodyMedium, { color: theme.textFaint }]}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Set rows */}
              {ex.sets.map((set, si) => (
                <View
                  key={si}
                  style={[s.setRow, si > 0 && { borderTopWidth: 1, borderTopColor: theme.divider }]}
                >
                  <Text style={[TEXT.monoSmall, { color: theme.textFaint, width: 40, textTransform: 'uppercase' }]}>
                    Set {si + 1}
                  </Text>
                  <NumInput value={set.reps} onChange={v => updateSet(ex.id, si, 'reps', v)} placeholder="reps" width={44} integer />
                  <Text style={[TEXT.monoSmall, { color: theme.textFaint }]}>×</Text>
                  <NumInput value={set.weight_kg} onChange={v => updateSet(ex.id, si, 'weight_kg', v)} placeholder="kg" width={52} />
                  <Text style={[TEXT.monoSmall, { color: theme.textFaint }]}>kg</Text>
                  <View style={{ flex: 1 }} />
                  {ex.sets.length > 1 && (
                    <TouchableOpacity onPress={() => removeSet(ex.id, si)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={[TEXT.monoSmall, { color: theme.textFaint }]}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}

              <TouchableOpacity onPress={() => addSet(ex.id)} style={s.addSetRow}>
                <Text style={[TEXT.monoSmall, { color: theme.accent }]}>+ set</Text>
              </TouchableOpacity>

              {exIdx < exercises.length - 1 && <Hairline />}
            </View>
          ))}

          {/* Add exercise hint (when at least one exercise exists) */}
          {exercises.length > 0 && (
            <>
              <Hairline />
              <TouchableOpacity
                onPress={() => {
                  searchInputRef.current?.focus()
                  scrollRef.current?.scrollTo({ y: builderY.current, animated: true })
                }}
                activeOpacity={0.6}
                style={s.addExRow}
              >
                <Text style={[TEXT.narrativeLarge, { color: theme.accent }]}>+ </Text>
                <Text style={[TEXT.narrativeLarge, { color: theme.accent }]}>Add exercise</Text>
              </TouchableOpacity>
            </>
          )}

          <Hairline />

          {/* Finish session */}
          {sessionError && (
            <Text style={[TEXT.monoSmall, { color: theme.bgAlert, textAlign: 'center', marginBottom: SPACE.sm }]}>
              {sessionError}
            </Text>
          )}
          <TouchableOpacity
            onPress={finishSession}
            disabled={savingSession || exercises.length === 0}
            activeOpacity={0.85}
            style={[
              s.primaryBtn,
              {
                backgroundColor: theme.accent,
                opacity: (savingSession || exercises.length === 0) ? 0.45 : 1,
              },
            ]}
          >
            {savingSession
              ? <ActivityIndicator color={theme.textOnAccent} />
              : <Text style={{ fontFamily: FONT.serifItalic, fontSize: 18, color: theme.textOnAccent, letterSpacing: -0.1 }}>
                  Finish session
                </Text>
            }
          </TouchableOpacity>
        </InfoCard>
      ) : (

        /* ── Session saved: confirmation + reflection ──── */
        <>
          <InfoCard>
            <Text style={[TEXT.narrativeLarge, { color: theme.accent }]}>Session saved.</Text>
            <Text style={[TEXT.narrativeMedium, { color: theme.textMuted, marginTop: SPACE.xs }]}>
              Log your reflection below, or start a new session.
            </Text>
            <TouchableOpacity onPress={newSession} style={{ marginTop: SPACE.md }}>
              <Text style={[TEXT.monoSmall, { color: theme.accent }]}>+ NEW SESSION</Text>
            </TouchableOpacity>
          </InfoCard>

          {/* ── Post-workout reflection ── */}
          <View style={s.reflHeader}>
            <Text style={[TEXT.headingLarge, { color: theme.textPrimary }]}>Post-workout </Text>
            <Text style={{ fontFamily: FONT.serifItalic, fontSize: 22, letterSpacing: -0.2, color: theme.accent }}>reflection</Text>
          </View>

          {!reflSaved ? (
            <InfoCard>
              <View style={s.scoreHeader}>
                <MetricLabel style={s.noMargin}>Session RPE</MetricLabel>
                <Text style={[TEXT.monoMedium, { color: theme.accent }]}>{rpe} / 10</Text>
              </View>
              <DotSelector value={rpe} max={10} onChange={setRpe} />

              <Hairline />

              <View style={s.scoreHeader}>
                <MetricLabel style={s.noMargin}>Session Quality</MetricLabel>
                <Text style={[TEXT.monoMedium, { color: theme.accent }]}>{quality} / 10</Text>
              </View>
              <DotSelector value={quality} max={10} onChange={setQuality} />

              <Hairline />

              <MetricLabel>How did the load feel?</MetricLabel>
              <LoadFeelSelector value={loadFeel} onChange={setLoadFeel} />

              <Hairline />

              <MetricLabel>Notes</MetricLabel>
              <TextInput
                value={reflNotes}
                onChangeText={setReflNotes}
                placeholder="Anything notable?"
                placeholderTextColor={theme.textFaint}
                multiline
                numberOfLines={3}
                style={[
                  TEXT.narrativeMedium,
                  s.notesInput,
                  { color: theme.textPrimary, borderColor: theme.borderSubtle, backgroundColor: theme.bgCardDeep },
                ]}
              />

              {reflError && (
                <Text style={[TEXT.monoSmall, { color: theme.bgAlert, marginTop: SPACE.sm }]}>
                  {reflError}
                </Text>
              )}

              <TouchableOpacity
                onPress={saveReflection}
                disabled={savingRefl}
                activeOpacity={0.85}
                style={[s.primaryBtn, { backgroundColor: theme.accent, opacity: savingRefl ? 0.6 : 1, marginTop: SPACE.md }]}
              >
                {savingRefl
                  ? <ActivityIndicator color={theme.textOnAccent} />
                  : <Text style={{ fontFamily: FONT.serifItalic, fontSize: 18, color: theme.textOnAccent, letterSpacing: -0.1 }}>
                      Save reflection
                    </Text>
                }
              </TouchableOpacity>
            </InfoCard>
          ) : (
            <InfoCard>
              <Text style={[TEXT.narrativeLarge, { color: theme.accent }]}>Reflection saved.</Text>
            </InfoCard>
          )}
        </>
      )}
      </View>

      </ScrollView>

      {/* FAB and modal rendered outside the scroll so the FAB floats above the tab bar */}
      <CheckInFAB />
      <CheckInModal />
      <SessionDetailSheet
        sessionId={selectedSessionId}
        onClose={() => setSelectedSessionId(null)}
      />
    </SafeAreaView>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 18,
    paddingBottom:     180,   // clears tab bar (82px) + FAB + breathing room
  },
  header: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    justifyContent: 'space-between',
    marginTop:      SPACE.md,
    marginBottom:   SPACE.lg,
  },
  newBtn: {
    paddingVertical:   SPACE.sm,
    paddingHorizontal: SPACE.md,
    borderRadius:      RADIUS.pill,
    marginTop:         SPACE.xs,
  },
  loadingRow:  { paddingVertical: SPACE.lg, alignItems: 'center' },
  weekCounter: {
    textAlign:     'center',
    textTransform: 'uppercase',
    letterSpacing: 2.0,
    marginBottom:  SPACE.lg,
    marginTop:     -SPACE.xs,
  },
  noMargin:  { marginBottom: 0 },
  chipRow: {
    flexDirection:  'row',
    flexWrap:       'wrap',
    gap:            SPACE.sm,
    marginTop:      SPACE.md,
    marginBottom:   SPACE.md,
  },
  searchInput: {
    paddingHorizontal: SPACE.md,
    paddingVertical:   SPACE.sm,
    borderRadius:      RADIUS.md,
    borderWidth:       1,
    marginTop:         SPACE.xs,
    marginBottom:      SPACE.sm,
  },
  resultsCard: {
    borderRadius: RADIUS.md,
    borderWidth:  1,
    overflow:     'hidden',
    marginBottom: SPACE.sm,
  },
  searchLoading: { paddingVertical: SPACE.md, alignItems: 'center' },
  resultRow:     { paddingHorizontal: SPACE.md, paddingVertical: SPACE.md - 2 },
  exHeader: {
    flexDirection: 'row',
    alignItems:    'center',
    paddingTop:    SPACE.sm,
    paddingBottom: SPACE.xs,
  },
  setRow: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             SPACE.sm,
    paddingVertical: SPACE.sm,
  },
  addSetRow:  { paddingVertical: SPACE.xs, marginBottom: SPACE.xs },
  addExRow: {
    flexDirection: 'row',
    alignItems:    'center',
    paddingVertical: SPACE.sm,
  },
  reflHeader: {
    flexDirection: 'row',
    alignItems:    'baseline',
    marginTop:     SPACE.xl,
    marginBottom:  SPACE.md,
  },
  scoreHeader: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   SPACE.xs,
  },
  notesInput: {
    paddingHorizontal: SPACE.md,
    paddingVertical:   SPACE.sm,
    borderRadius:      RADIUS.md,
    borderWidth:       1,
    minHeight:         72,
    textAlignVertical: 'top',
  },
  primaryBtn: {
    borderRadius:      RADIUS.md,
    paddingVertical:   SPACE.md,
    paddingHorizontal: SPACE.lg,
    alignItems:        'center',
  },
})
