import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { apiSaveReadiness, apiFetchReadiness, ReadinessPayload } from '../api/checkin'

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
  // Pass token in so we can hit the backend as source of truth
  hydrate:        (token: string) => Promise<void>
  openModal:      () => void
  closeModal:     () => void
  submitCheckIn:  (token: string, payload: CheckInPayload) => Promise<void>
}

export const useCheckInStore = create<CheckInState>((set) => ({
  submittedToday: false,
  hydrated:       false,
  modalVisible:   false,
  loading:        false,
  error:          null,

  hydrate: async (token: string) => {
    try {
      // 1. Fast path: check AsyncStorage first to avoid any visible flash
      const stored = await AsyncStorage.getItem(STORE_KEY)
      if (stored === todayString()) {
        set({ submittedToday: true, hydrated: true })
        return
      }
      // 2. Source of truth: ask the backend if today's entry exists
      const existing = await apiFetchReadiness(token, todayString())
      if (existing) {
        // Cache it so next cold start is instant
        await AsyncStorage.setItem(STORE_KEY, todayString())
        set({ submittedToday: true, hydrated: true })
      } else {
        set({ submittedToday: false, hydrated: true })
      }
    } catch {
      // Network error or 404 — unblock the UI, let modal show
      set({ hydrated: true })
    }
  },

  openModal:  () => set({ modalVisible: true,  error: null }),
  closeModal: () => set({ modalVisible: false, error: null }),

  submitCheckIn: async (token: string, payload: CheckInPayload) => {
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
      await apiSaveReadiness(token, apiPayload)
      await AsyncStorage.setItem(STORE_KEY, todayString())
      set({ submittedToday: true, modalVisible: false, loading: false })
    } catch (e: any) {
      set({ loading: false, error: e.message ?? 'Submission failed' })
    }
  },
}))