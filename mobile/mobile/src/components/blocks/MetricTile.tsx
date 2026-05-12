import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { InfoCard } from './InfoCard'
import { MetricLabel } from '../primitives/MetricLabel'
import { StatusBadge } from '../primitives/StatusBadge'
import { SparklineChart } from '../primitives/SparklineChart'
import { useTheme } from '../../hooks/useTheme'
import { TEXT, SPACE } from '../../theme'

interface MetricTileProps {
  label: string
  value: string | number
  unit?: string
  badgeLabel?: string
  caption?: string
  sparklineData?: number[]
}

export function MetricTile({ label, value, unit, badgeLabel, caption, sparklineData }: MetricTileProps) {
  const theme = useTheme()
  return (
    <InfoCard style={{ flex: 1, marginBottom: 0 }}>
      <View style={styles.header}>
        <MetricLabel style={{ marginBottom: 0 }}>{label}</MetricLabel>
        {badgeLabel && <StatusBadge label={badgeLabel} variant="filled" />}
      </View>
      <View style={styles.valueRow}>
        <Text style={[TEXT.displaySmall, { color: theme.textPrimary, marginVertical: SPACE.sm }]}>{value}</Text>
        {unit && (
          <Text style={[TEXT.narrativeMedium, { color: theme.textMuted, marginLeft: SPACE.xs, alignSelf: 'flex-end', marginBottom: SPACE.sm + 2 }]}>
            {unit}
          </Text>
        )}
      </View>
      {sparklineData && <SparklineChart dataPoints={sparklineData} height={32} />}
      {caption && <Text style={[TEXT.narrativeSmall, { color: theme.textMuted, marginTop: SPACE.sm }]}>{caption}</Text>}
    </InfoCard>
  )
}

const styles = StyleSheet.create({
  header:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  valueRow: { flexDirection: 'row', alignItems: 'flex-end' },
})
