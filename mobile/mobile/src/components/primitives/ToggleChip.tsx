import React from 'react'
import { TouchableOpacity, Text, StyleSheet, ViewStyle } from 'react-native'
import { useTheme } from '../../hooks/useTheme'
import { TEXT, SPACE, RADIUS } from '../../theme'

interface ToggleChipProps {
  label:      string
  isSelected: boolean
  onPress:    () => void
  style?:     ViewStyle
}

export function ToggleChip({ label, isSelected, onPress, style }: ToggleChipProps) {
  const theme = useTheme()
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[
        styles.chip,
        isSelected
          ? { backgroundColor: theme.accent,      borderColor: theme.accent }
          : { backgroundColor: 'transparent',      borderColor: theme.textFaint },
        style,
      ]}
    >
      <Text style={[
        TEXT.monoSmall,
        { textTransform: 'uppercase', color: isSelected ? theme.textOnAccent : theme.textMuted },
      ]}>
        {label.toUpperCase()}
      </Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: SPACE.md,
    paddingVertical:   SPACE.sm,
    borderRadius:      RADIUS.md,
    borderWidth:       1,
  },
})
