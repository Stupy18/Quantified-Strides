import React, { useEffect, useRef } from 'react'
import { Animated, Text, View, StyleSheet } from 'react-native'
import { useTheme } from '../../hooks/useTheme'
import { TEXT, SPACE } from '../../theme'

interface LiveHRPillProps {
  bpm: number
}

const PULSE_GREEN = '#3ECF6C'

export function LiveHRPill({ bpm }: LiveHRPillProps) {
  const theme = useTheme()
  const pulse = useRef(new Animated.Value(0.5)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1,   duration: 1200, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 1200, useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [pulse])

  return (
    <View style={styles.pill}>
      <Animated.View style={[styles.dot, { opacity: pulse, transform: [{ scale: pulse.interpolate({ inputRange: [0.5, 1], outputRange: [1, 1.15] }) }] }]} />
      <View style={styles.column}>
        <Text style={[TEXT.monoSmall, styles.bpm]}>HR ·</Text>
        <Text style={[TEXT.monoLarge, styles.bpm]}>{bpm}</Text>
      </View>
      <Text style={[TEXT.monoSmall, { color: theme.textMuted }]}>LIVE</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  pill: {
    backgroundColor: '#000',
    borderRadius: 14,
    paddingHorizontal: SPACE.sm + 2,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  column: { alignItems: 'flex-start' },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: PULSE_GREEN,
    shadowColor: PULSE_GREEN,
    shadowOpacity: 0.8,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  bpm: { color: PULSE_GREEN },
})
