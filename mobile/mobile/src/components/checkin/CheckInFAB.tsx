import React from 'react'
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native'
import { useCheckInStore } from '../../store/checkInStore'
import { useTheme } from '../../hooks/useTheme'
import { RADIUS } from '../../theme'

export function CheckInFAB() {
  const theme = useTheme()
  const { submittedToday, openModal } = useCheckInStore()

  if (submittedToday) return null

  return (
    <TouchableOpacity
      onPress={openModal}
      activeOpacity={0.85}
      style={[styles.fab, { backgroundColor: theme.accent }]}
    >
      <View style={[styles.pulseRing, { borderColor: theme.accent }]} />
      <Text style={[styles.icon, { color: theme.textOnAccent }]}>✦</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  fab: {
    position:       'absolute',
    bottom:         96,
    right:          20,
    width:          48,
    height:         48,
    borderRadius:   RADIUS.full,
    alignItems:     'center',
    justifyContent: 'center',
    shadowColor:    '#000',
    shadowOffset:   { width: 0, height: 4 },
    shadowOpacity:  0.3,
    shadowRadius:   8,
    elevation:      8,
    zIndex:         50,
  },
  pulseRing: {
    position:     'absolute',
    width:        60,
    height:       60,
    borderRadius: RADIUS.full,
    borderWidth:  1.5,
    opacity:      0.3,
  },
  icon: {
    fontSize:   20,
    lineHeight: 22,
  },
})
