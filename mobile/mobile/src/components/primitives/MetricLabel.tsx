import React from 'react'
import { Text, TextStyle, StyleSheet } from 'react-native'
import { useTheme } from '../../hooks/useTheme'
import { TEXT } from '../../theme'

interface MetricLabelProps {
  children: string
  suffix?: React.ReactNode
  style?: TextStyle
}

export function MetricLabel({ children, suffix, style }: MetricLabelProps) {
  const theme = useTheme()
  return (
    <Text style={[styles.label, { color: theme.textMuted }, style]}>
      {children.toUpperCase()}{suffix}
    </Text>
  )
}

const styles = StyleSheet.create({
  label: {
    ...TEXT.monoSmall,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
})