import React from 'react'
import { Text, View, StyleSheet, ViewStyle } from 'react-native'
import { useTheme } from '../../hooks/useTheme'
import { TEXT, SPACE, RADIUS } from '../../theme'

type BadgeVariant = 'filled' | 'outlined' | 'alert'

interface StatusBadgeProps {
  label: string
  variant?: BadgeVariant
  style?: ViewStyle
}

export function StatusBadge({ label, variant = 'filled', style }: StatusBadgeProps) {
  const theme = useTheme()

  const containerStyle = {
    filled:   { backgroundColor: theme.accent + '33', borderWidth: 0 },
    outlined: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.accent },
    alert:    { backgroundColor: theme.bgAlert, borderWidth: 0 },
  }[variant]

  const textColor = {
    filled:   theme.accent,
    outlined: theme.accent,
    alert:    theme.textOnAlert,
  }[variant]

  return (
    <View style={[styles.badge, containerStyle, style]}>
      <Text style={[styles.text, { color: textColor }]}>{label.toUpperCase()}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: SPACE.sm, paddingVertical: 3, borderRadius: RADIUS.sm },
  text:  { ...TEXT.monoSmall, textTransform: 'uppercase' },
})
