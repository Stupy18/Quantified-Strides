import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Hairline } from '../primitives/Hairline'
import { useTheme } from '../../hooks/useTheme'
import { TEXT, SPACE, RADIUS } from '../../theme'

interface ExerciseRowProps {
  name: string
  sets: string
  reps: string
  weightKg: string
  isLast?: boolean
}

function InputBox({ value, width = 40 }: { value: string; width?: number }) {
  const theme = useTheme()
  return (
    <View style={[styles.inputBox, { width, backgroundColor: theme.bgCardDeep, borderColor: theme.borderSubtle }]}>
      <Text style={[TEXT.monoLarge, { color: theme.textPrimary }]}>{value}</Text>
    </View>
  )
}

export function ExerciseRow({ name, sets, reps, weightKg, isLast = false }: ExerciseRowProps) {
  const theme = useTheme()
  return (
    <>
      <View style={styles.row}>
        <Text style={[TEXT.bodyLarge, { color: theme.textPrimary, fontWeight: '500', flex: 1 }]}>{name}</Text>
        <View style={styles.controls}>
          <InputBox value={sets} width={36} />
          <Text style={[TEXT.monoLarge, { color: theme.textFaint }]}>×</Text>
          <InputBox value={reps} width={36} />
          <InputBox value={`${weightKg} kg`} width={56} />
          <Text style={[TEXT.monoSmall, { color: theme.textMuted }]}>+ set</Text>
        </View>
      </View>
      {!isLast && <Hairline />}
    </>
  )
}

const styles = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, paddingVertical: SPACE.md - 2 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  inputBox: { height: 28, borderRadius: RADIUS.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACE.xs },
})
