import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { StatusBadge } from '../primitives/StatusBadge'
import { useTheme } from '../../hooks/useTheme'
import { TEXT, SPACE } from '../../theme'

interface WorkoutListRowProps {
  title: string
  subtitle: string
  date: string
  tag: string
  isLast?: boolean
}

export function WorkoutListRow({ title, subtitle, date, tag, isLast = false }: WorkoutListRowProps) {
  const theme = useTheme()
  return (
    <View style={[styles.row, !isLast && { borderBottomWidth: 1, borderBottomColor: theme.divider }]}>
      <View style={styles.left}>
        <Text style={[TEXT.bodyLarge, { color: theme.textPrimary, fontWeight: '500', marginBottom: 3 }]}>{title}</Text>
        <Text style={[TEXT.narrativeMedium, { color: theme.textMuted }]}>{subtitle}</Text>
      </View>
      <View style={styles.right}>
        <Text style={[TEXT.monoSmall, { color: theme.textMuted, marginBottom: SPACE.xs }]}>{date}</Text>
        <StatusBadge label={tag} variant="outlined" />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SPACE.md, paddingHorizontal: SPACE.lg },
  left:  { flex: 1, marginRight: SPACE.md },
  right: { alignItems: 'flex-end', gap: SPACE.xs },
})
