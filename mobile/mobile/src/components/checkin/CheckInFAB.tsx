import React from 'react'
import { TouchableOpacity, Text, StyleSheet } from 'react-native'
import { useCheckInStore } from '../../store/checkInStore'
import { useTheme } from '../../hooks/useTheme'
import { FONT, SPACE, RADIUS } from '../../theme'

export function CheckInFAB() {
  const theme = useTheme()
  const { submittedToday, openModal } = useCheckInStore()

  if (submittedToday) return null

  return (
    <TouchableOpacity
      onPress={openModal}
      activeOpacity={0.85}
      style={[
        styles.fab,
        {
          backgroundColor: theme.bgAlert,
          shadowColor:     theme.bgAlert,
        },
      ]}
    >
      <Text style={[styles.label, { color: theme.textOnAlert }]}>Check in ↑</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  fab: {
    position:          'absolute',
    bottom:            96,
    right:             20,
    paddingVertical:   SPACE.sm + 2,
    paddingHorizontal: SPACE.lg,
    borderRadius:      RADIUS.pill,
    alignItems:        'center',
    justifyContent:    'center',
    shadowOffset:      { width: 0, height: 8 },
    shadowOpacity:     0.35,
    shadowRadius:      16,
    elevation:         8,
    zIndex:            50,
  },
  label: {
    fontFamily:    FONT.serifItalic,
    fontSize:      16,
    letterSpacing: -0.05,
  },
})
