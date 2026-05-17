import React from 'react'
import { View } from 'react-native'
import Svg, { Rect } from 'react-native-svg'
import { useTheme } from '../../hooks/useTheme'

interface MiniBarChartProps {
  dataPoints: number[]
  height?: number
}

export function MiniBarChart({ dataPoints, height = 28 }: MiniBarChartProps) {
  const theme = useTheme()
  const width = 70
  const max = Math.max(...dataPoints, 1)
  const slot = width / dataPoints.length
  const gap = 2
  const barW = slot - gap

  return (
    <View style={{ height }}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {dataPoints.map((value, i) => {
          const h = (value / max) * (height - 4)
          return (
            <Rect
              key={i}
              x={i * slot + gap / 2}
              y={height - h}
              width={barW}
              height={h}
              rx={1.5}
              fill={i === dataPoints.length - 1 ? theme.accent : theme.textFaint}
            />
          )
        })}
      </Svg>
    </View>
  )
}