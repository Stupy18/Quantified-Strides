import { useEffect } from 'react'
import { useSharedValue, withTiming, Easing } from 'react-native-reanimated'

// Returns an animated strokeDashoffset value that goes from pathLength → 0,
// making the path appear to draw itself left to right.
// Use with Animated.createAnimatedComponent(Path) from react-native-svg:
//   strokeDasharray={[pathLength, pathLength]}
//   strokeDashoffset={animatedOffset}
export function usePathDraw(
  pathLength: number,
  options: { duration?: number; delay?: number } = {}
) {
  const { duration = 1400, delay = 0 } = options
  const offset = useSharedValue(pathLength)

  useEffect(() => {
    if (pathLength <= 0) return
    const timer = setTimeout(() => {
      offset.value = withTiming(0, {
        duration,
        easing: Easing.out(Easing.quad),
      })
    }, delay)
    return () => clearTimeout(timer)
  }, [pathLength])

  return offset
}
