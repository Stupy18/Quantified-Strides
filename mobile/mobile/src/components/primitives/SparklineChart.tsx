import React from 'react'
import { View } from 'react-native'
import Svg, { Polyline, Circle } from 'react-native-svg'
import { useTheme } from '../../hooks/useTheme'

interface SparklineChartProps {
  dataPoints: number[]
  height?: number
}

export function SparklineChart({ dataPoints, height = 36 }: SparklineChartProps) {
  const theme = useTheme()
  const width = 200
  const max = Math.max(...dataPoints)
  const min = Math.min(...dataPoints)
  const range = max - min || 1

  const pointStrings = dataPoints.map((y, i) => {
    const x = (i / (dataPoints.length - 1)) * width
    const yp = height - ((y - min) / range) * (height - 4) - 2
    return `${x},${yp}`
  })
  const points = pointStrings.join(' ')
  const last = pointStrings[pointStrings.length - 1].split(',')

  return (
    <View style={{ height }}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Polyline
          points={points}
          fill="none"
          stroke={theme.accent}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Circle cx={last[0]} cy={last[1]} r={2.5} fill={theme.accent} />
      </Svg>
    </View>
  )
}
