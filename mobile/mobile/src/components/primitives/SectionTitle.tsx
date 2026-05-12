import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useTheme } from '../../hooks/useTheme'
import { TEXT, SPACE } from '../../theme'

interface SectionTitleProps {
  title: string
  rightLabel?: string
  onRightPress?: () => void
}

export function SectionTitle({ title, rightLabel, onRightPress }: SectionTitleProps) {
  const theme = useTheme()
  return (
    <View style={styles.row}>
      <Text style={[styles.title, { color: theme.textPrimary }]}>{title}</Text>
      {rightLabel && (
        <Text
          style={[styles.right, { color: theme.textMuted }]}
          onPress={onRightPress}
        >
          {rightLabel}
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  row:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14, marginTop: 28 },
  title: { ...TEXT.headingMedium },
  right: { ...TEXT.monoSmall, textTransform: 'uppercase' },
})
