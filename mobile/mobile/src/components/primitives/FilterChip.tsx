import React from 'react'
import { TouchableOpacity, Text, StyleSheet, ViewStyle } from 'react-native'
import { useTheme } from '../../hooks/useTheme'
import { TEXT, SPACE, RADIUS } from '../../theme'

interface FilterChipProps {
  label: string
  isActive?: boolean
  onPress: () => void
  style?: ViewStyle
}

export function FilterChip({ label, isActive = false, onPress, style }: FilterChipProps) {
  const theme = useTheme()
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        styles.chip,
        isActive
          ? { backgroundColor: theme.accent, borderColor: theme.accent }
          : { backgroundColor: 'transparent', borderColor: theme.textFaint },
        style,
      ]}
    >
      <Text style={[styles.label, { color: isActive ? theme.textOnAccent : theme.textMuted }]}>
        {label.toUpperCase()}
      </Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  chip:  { paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm - 2, borderRadius: RADIUS.pill, borderWidth: 1 },
  label: { ...TEXT.monoSmall, textTransform: 'uppercase' },
})
