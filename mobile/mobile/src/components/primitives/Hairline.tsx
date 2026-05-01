import React from 'react'
import { View, StyleSheet } from 'react-native'
import { useTheme } from '../../hooks/useTheme'

export function Hairline() {
  const theme = useTheme()
  return <View style={[styles.line, { backgroundColor: theme.divider }]} />
}

const styles = StyleSheet.create({
  line: { height: 1, marginVertical: 12 },
})
