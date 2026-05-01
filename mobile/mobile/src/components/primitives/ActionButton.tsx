import React from 'react'
import { TouchableOpacity, Text, View, StyleSheet, ViewStyle } from 'react-native'
import { useTheme } from '../../hooks/useTheme'
import { TEXT, SPACE, RADIUS } from '../../theme'

type ButtonVariant = 'accent' | 'alert' | 'ghost'
type ButtonSize    = 'sm' | 'md' | 'lg'

interface ActionButtonProps {
  label: string
  onPress: () => void
  variant?:   ButtonVariant
  size?:      ButtonSize
  fullWidth?: boolean
  rightLabel?: string
  style?: ViewStyle
}

export function ActionButton({
  label, onPress, variant = 'accent', size = 'md',
  fullWidth = false, rightLabel, style,
}: ActionButtonProps) {
  const theme = useTheme()

  const bg        = { accent: theme.accent, alert: theme.bgAlert, ghost: 'transparent' }[variant]
  const textColor = { accent: theme.textOnAccent, alert: theme.textOnAlert, ghost: theme.textMuted }[variant]
  const padding   = { sm: SPACE.sm, md: SPACE.md + 2, lg: SPACE.lg }[size]
  const fontSize  = size === 'lg' ? TEXT.narrativeLarge : size === 'md' ? TEXT.narrativeMedium : TEXT.narrativeSmall

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[
        styles.btn,
        { backgroundColor: bg, padding, borderWidth: variant === 'ghost' ? 1 : 0, borderColor: theme.textFaint },
        fullWidth && styles.fullWidth,
        style,
      ]}
    >
      <Text style={[fontSize, { color: textColor }]}>{label}</Text>
      {rightLabel && (
        <Text style={[TEXT.monoSmall, { color: textColor, opacity: 0.7 }]}>{rightLabel}</Text>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  btn:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: RADIUS.lg },
  fullWidth: { width: '100%' },
})
