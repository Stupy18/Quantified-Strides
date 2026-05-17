import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { saveReadiness, fetchReadiness, ReadinessPayload } from '../api/endpoints/checkin'

const STORE_KEY = 'qs_checkin_date'

function todayString(): string {
  return new Date().toLocaleDateString('en-CA')
}

export interface CheckInPayload {
  overall:       number
  legs:          number
  upperBody:     number
  joints:        number
  timeAvailable: 'short' | 'medium' | 'long'
  goingOut:      boolean
  injuryNotes:   string
}

interface CheckInState {
  submittedToday: boolean
  hydrated:       boolean
  modalVisible:   boolean
  loading:        boolean
  error:          string | null
  hydrate:        () => Promise<void>
  openModal:      () => void
  closeModal:     () => void
  submitCheckIn:  (payload: CheckInPayload) => Promise<void>
}

export const useCheckInStore = create<CheckInState>((set) => ({
  submittedToday: false,
  hydrated:       false,
  modalVisible:   false,
  loading:        false,
  error:          null,

  hydrate: async () => {
    try {
      // Fast path: check local cache to avoid a visible flash
      const stored = await AsyncStorage.getItem(STORE_KEY)
      if (stored === todayString()) {
        set({ submittedToday: true, hydrated: true })
        return
      }
      // Source of truth: ask the backend if today's entry exists
      const existing = await fetchReadiness(todayString())
      if (existing) {
        await AsyncStorage.setItem(STORE_KEY, todayString())
        set({ submittedToday: true, hydrated: true })
      } else {
        set({ submittedToday: false, hydrated: true })
      }
    } catch {
      // Network error — unblock the UI, let modal show
      set({ hydrated: true })
    }
  },

  openModal:  () => set({ modalVisible: true,  error: null }),
  closeModal: () => set({ modalVisible: false, error: null }),

  submitCheckIn: async (payload: CheckInPayload) => {
    set({ loading: true, error: null })
    try {
      const apiPayload: ReadinessPayload = {
        entry_date:        todayString(),
        overall_feel:      payload.overall,
        legs_feel:         payload.legs,
        upper_body_feel:   payload.upperBody,
        joint_feel:        payload.joints,
        time_available:    payload.timeAvailable,
        going_out_tonight: payload.goingOut,
        ...(payload.injuryNotes.trim() ? { injury_note: payload.injuryNotes.trim() } : {}),
      }
      await saveReadiness(apiPayload)
      await AsyncStorage.setItem(STORE_KEY, todayString())
      set({ submittedToday: true, modalVisible: false, loading: false })
    } catch (e: any) {
      set({ loading: false, error: e?.response?.data?.detail ?? e?.message ?? 'Submission failed' })
    }
  },
}))
