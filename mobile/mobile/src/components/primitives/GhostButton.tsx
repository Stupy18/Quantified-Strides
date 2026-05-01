import React from 'react'
import { TouchableOpacity, Text, StyleSheet, ViewStyle } from 'react-native'
import { useTheme } from '../../hooks/useTheme'
import { SPACE, RADIUS } from '../../theme'

type GhostVariant = 'default' | 'danger'
type GhostSize    = 'sm' | 'md' | 'lg'

interface GhostButtonProps {
  label:      string
  onPress:    () => void
  variant?:   GhostVariant
  size?:      GhostSize
  fullWidth?: boolean
  style?:     ViewStyle
}

export function GhostButton({
  label,
  onPress,
  variant   = 'default',
  size      = 'md',
  fullWidth = false,
  style,
}: GhostButtonProps) {
  const theme = useTheme()

  // Border and text colors are theme-aware — no hardcoded hex
  const borderColor = variant === 'danger' ? theme.bgAlert   : theme.borderSubtle
  const textColor   = variant === 'danger' ? theme.textMuted : theme.textFaint

  const paddingVertical = { sm: SPACE.sm, md: SPACE.md, lg: SPACE.lg }[size]
  const fontSize        = { sm: 10,       md: 11,       lg: 12      }[size]

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.6}
      style={[
        styles.btn,
        {
          borderColor,
          paddingVertical,
          // Danger variant gets a very faint tint of the alert color so it
          // reads on both warm and cool themes without ever being garish
          backgroundColor: variant === 'danger'
            ? theme.bgAlert + '12'   // 12 = ~7% opacity in hex
            : 'transparent',
        },
        fullWidth && styles.fullWidth,
        style,
      ]}
    >
      <Text style={[styles.label, { color: textColor, fontSize }]}>
        {label.toUpperCase()}
      </Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  btn: {
    borderWidth:      1,
    borderRadius:     RADIUS.md,
    alignItems:       'center',
    justifyContent:   'center',
    paddingHorizontal: SPACE.lg,
  },
  fullWidth: { width: '100%' },
  label: {
    fontFamily:    'JetBrainsMono',
    letterSpacing: 2,
  },
})
