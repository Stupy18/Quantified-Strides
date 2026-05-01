import React from 'react'
import { View, StyleSheet } from 'react-native'
import { useTheme } from '../../hooks/useTheme'
import { SPACE } from '../../theme'

interface ReadinessDotsProps {
  score: number
  total?: number
}

export function ReadinessDots({ score, total = 5 }: ReadinessDotsProps) {
  const theme = useTheme()
  return (
    <View style={styles.row}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i < score
              ? { backgroundColor: theme.accent, borderColor: theme.accent }
              : { backgroundColor: 'transparent', borderColor: theme.textFaint },
          ]}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: SPACE.sm },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5 },
})
