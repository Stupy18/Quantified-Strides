import { useEffect } from 'react'
import {
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated'

const SPRING_CONFIG = { damping: 18, stiffness: 120 }

// Returns arrays of opacity + translateY shared values for staggered reveal.
// Each element fades in and slides up sequentially.
export function useStagger(
  count: number,
  options: { delayMs?: number; initialDelay?: number } = {}
) {
  const { delayMs = 120, initialDelay = 200 } = options

  const opacities = Array.from({ length: count }, () => useSharedValue(0))
  const translateYs = Array.from({ length: count }, () => useSharedValue(16))

  useEffect(() => {
    opacities.forEach((opacity, i) => {
      const delay = initialDelay + i * delayMs
      opacity.value = withDelay(delay, withTiming(1, { duration: 300 }))
      translateYs[i].value = withDelay(delay, withSpring(0, SPRING_CONFIG))
    })
  }, [count])

  return { opacities, translateYs }
}
