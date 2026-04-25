import React from 'react'
import { Text, TextStyle, StyleSheet } from 'react-native'
import { useTheme } from '../../hooks/useTheme'
import { TEXT } from '../../theme'

interface MetricLabelProps {
  children: string
  style?: TextStyle
}

export function MetricLabel({ children, style }: MetricLabelProps) {
  const theme = useTheme()
  return (
    <Text style={[styles.label, { color: theme.textMuted }, style]}>
      {children.toUpperCase()}
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
