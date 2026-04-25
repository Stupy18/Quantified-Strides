import { create } from 'zustand'

interface CheckInState {
  submittedToday: boolean
  modalVisible:   boolean
  openModal:      () => void
  closeModal:     () => void
  submitCheckIn:  () => void
}

export const useCheckInStore = create<CheckInState>((set) => ({
  submittedToday: false,
  modalVisible:   false,
  openModal:      () => set({ modalVisible: true }),
  closeModal:     () => set({ modalVisible: false }),
  submitCheckIn:  () => set({ submittedToday: true, modalVisible: false }),
}))
