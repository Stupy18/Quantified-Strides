import React from 'react'
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native'
import { useTheme } from '../../hooks/useTheme'
import { TEXT, SPACE, RADIUS } from '../../theme'

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

interface WeekDayPickerProps {
  activeDays: number[]
  onChange: (days: number[]) => void
}

export function WeekDayPicker({ activeDays, onChange }: WeekDayPickerProps) {
  const theme = useTheme()

  const toggle = (i: number) => {
    onChange(activeDays.includes(i) ? activeDays.filter(d => d !== i) : [...activeDays, i])
  }

  return (
    <View style={styles.row}>
      {DAY_LABELS.map((d, i) => {
        const active = activeDays.includes(i)
        return (
          <TouchableOpacity
            key={i}
            onPress={() => toggle(i)}
            style={[
              styles.tile,
              active
                ? { backgroundColor: theme.accent, borderColor: theme.accent }
                : { backgroundColor: 'transparent', borderColor: theme.textFaint },
            ]}
          >
            <Text style={[TEXT.monoMedium, { color: active ? theme.textOnAccent : theme.textFaint, fontWeight: '600' }]}>
              {d}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row:  { flexDirection: 'row', justifyContent: 'space-between', gap: SPACE.sm },
  tile: { width: 36, height: 36, borderRadius: RADIUS.md, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
})
