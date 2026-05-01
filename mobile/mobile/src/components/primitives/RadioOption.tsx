import React from 'react'
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native'
import { useTheme } from '../../hooks/useTheme'
import { TEXT, SPACE } from '../../theme'

interface RadioOptionProps {
  label: string
  isSelected: boolean
  onPress: () => void
}

export function RadioOption({ label, isSelected, onPress }: RadioOptionProps) {
  const theme = useTheme()
  return (
    <TouchableOpacity onPress={onPress} style={styles.row} activeOpacity={0.7}>
      <View style={[styles.ring, { borderColor: isSelected ? theme.accent : theme.textFaint }]}>
        {isSelected && <View style={[styles.fill, { backgroundColor: theme.accent }]} />}
      </View>
      <Text style={[TEXT.bodyLarge, { color: isSelected ? theme.textPrimary : theme.textMuted, fontWeight: isSelected ? '500' : '400' }]}>
        {label}
      </Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  row:  { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingVertical: SPACE.md },
  ring: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  fill: { width: 10, height: 10, borderRadius: 5 },
})
