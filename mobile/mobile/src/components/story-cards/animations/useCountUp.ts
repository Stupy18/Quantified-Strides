import { useState, useEffect } from 'react'

export function useCountUp(
  target: number,
  options: { duration?: number; delay?: number; decimals?: number } = {}
) {
  const { duration = 1200, delay = 0, decimals = 0 } = options
  const [display, setDisplay] = useState(
    decimals > 0 ? (0).toFixed(decimals) : '0'
  )

  useEffect(() => {
    let raf: number
    let startTime: number | null = null

    const tick = (ts: number) => {
      if (startTime === null) startTime = ts
      const elapsed = ts - startTime
      const t = Math.min(elapsed / duration, 1)
      // ease out cubic
      const eased = 1 - Math.pow(1 - t, 3)
      const val = target * eased
      setDisplay(decimals > 0 ? val.toFixed(decimals) : Math.round(val).toString())
      if (t < 1) raf = requestAnimationFrame(tick)
    }

    const timer = setTimeout(() => {
      raf = requestAnimationFrame(tick)
    }, delay)

    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(raf)
    }
  }, [target, duration, delay, decimals])

  return display
}
