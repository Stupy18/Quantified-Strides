import React from 'react'
import { View, StyleSheet, ViewStyle } from 'react-native'
import { useTheme } from '../../hooks/useTheme'
import { SPACE, RADIUS } from '../../theme'

interface InfoCardProps {
  children: React.ReactNode
  style?: ViewStyle
  noPadding?: boolean
}

export function InfoCard({ children, style, noPadding = false }: InfoCardProps) {
  const theme = useTheme()
  return (
    <View style={[
      styles.card,
      { backgroundColor: theme.bgCard, borderColor: theme.borderSubtle },
      noPadding && { padding: 0 },
      style,
    ]}>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.lg,
    padding: SPACE.lg,
    borderWidth: 1,
    marginBottom: SPACE.md,
    overflow: 'hidden',
  },
})
