import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Svg, { Ellipse, Rect, Text as SvgText } from 'react-native-svg'
import { LinearGradient } from 'expo-linear-gradient'
import { useTheme } from '../../hooks/useTheme'
import { TEXT, SPACE, FONT } from '../../theme'

// ── Data shape ────────────────────────────────────────────────────────────────
// freshness: 0 = fully fatigued, 100 = fully fresh
// Replace with real API data when wiring up.

type MuscleFreshness = {
  shoulders: number
  biceps:    number
  forearms:  number
  core:      number
  quads:     number
  calves:    number
}

const MOCK_FRESHNESS: MuscleFreshness = {
  shoulders: 55,  // upper gym yesterday — deltoids still loaded
  biceps:    58,  // pulling movements, borderline
  forearms:  78,  // accessory work, recovering well
  core:      70,  // solid base, not the primary focus
  quads:     72,  // good — weekend ride was Z2 only
  calves:    31,  // most fatigued — trail running + calf raises
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Maps freshness % → 2-char hex opacity for the accent colour.
// 100 (fresh)    → 0x18 (~9% opacity  — barely tinted)
// 0   (fatigued) → 0x72 (~45% opacity — strongly glowing)
function toHex(freshnessPct: number): string {
  const clamped = Math.max(0, Math.min(100, freshnessPct))
  const val = Math.round(0x18 + (0x72 - 0x18) * (1 - clamped / 100))
  return val.toString(16).padStart(2, '0')
}

// Labels on fatigued muscles (<50% fresh) render in accent to flag them.
function labelFill(freshnessPct: number, accent: string, muted: string): string {
  return freshnessPct < 50 ? accent : muted
}

// ── Component ─────────────────────────────────────────────────────────────────

export function BodyFreshnessMap() {
  const theme = useTheme()
  const f = MOCK_FRESHNESS
  const s = theme.accent
  const b = { stroke: theme.textFaint, strokeWidth: 0.5 } as const
  const lc = (pct: number) => labelFill(pct, theme.accent, theme.textMuted)

  return (
    <>
      <Svg width="100%" height={190} viewBox="0 0 200 220">

        {/* ── Head & neck (decorative — no muscle group) ── */}
        <Ellipse cx={100} cy={34} rx={21} ry={24} fill={s + '28'} {...b} />
        <Rect x={94} y={57} width={12} height={11} rx={3}          fill={s + '28'} {...b} />

        {/* ── Core (torso + hip) ── */}
        <Rect x={80} y={65} width={40} height={58} rx={8}          fill={s + toHex(f.core)} {...b} />
        <Rect x={74} y={120} width={52} height={14} rx={6}         fill={s + toHex(f.core)} {...b} />

        {/* ── Shoulders ── */}
        <Rect x={52}  y={66} width={28} height={28} rx={6}         fill={s + toHex(f.shoulders)} {...b} />
        <Rect x={120} y={66} width={28} height={28} rx={6}         fill={s + toHex(f.shoulders)} {...b} />

        {/* ── Upper arms (biceps / triceps) ── */}
        <Rect x={50}  y={95} width={16} height={36} rx={5}         fill={s + toHex(f.biceps)} {...b} />
        <Rect x={134} y={95} width={16} height={36} rx={5}         fill={s + toHex(f.biceps)} {...b} />

        {/* ── Forearms ── */}
        <Rect x={52}  y={132} width={13} height={28} rx={5}        fill={s + toHex(f.forearms)} {...b} />
        <Rect x={135} y={132} width={13} height={28} rx={5}        fill={s + toHex(f.forearms)} {...b} />

        {/* ── Quads ── */}
        <Rect x={76}  y={124} width={22} height={50} rx={6}        fill={s + toHex(f.quads)} {...b} />
        <Rect x={102} y={124} width={22} height={50} rx={6}        fill={s + toHex(f.quads)} {...b} />

        {/* ── Calves ── */}
        <Rect x={78}  y={176} width={18} height={36} rx={5}        fill={s + toHex(f.calves)} {...b} />
        <Rect x={104} y={176} width={18} height={36} rx={5}        fill={s + toHex(f.calves)} {...b} />

        {/* ── Labels ───────────────────────────────────────────────────── */}

        {/* Left spine: muscle name, colour = accent if fatigued */}
        <SvgText x={46} y={84}  textAnchor="end"    fontFamily={FONT.mono} fontSize={7} fill={lc(f.shoulders)}>shoulders</SvgText>
        <SvgText x={46} y={118} textAnchor="end"    fontFamily={FONT.mono} fontSize={7} fill={lc(f.biceps)}>biceps</SvgText>
        <SvgText x={46} y={150} textAnchor="end"    fontFamily={FONT.mono} fontSize={7} fill={lc(f.forearms)}>forearms</SvgText>

        {/* Right spine: freshness %, mirrors the left labels */}
        <SvgText x={154} y={84}  textAnchor="start"  fontFamily={FONT.mono} fontSize={7} fill={lc(f.shoulders)}>{f.shoulders}%</SvgText>
        <SvgText x={154} y={118} textAnchor="start"  fontFamily={FONT.mono} fontSize={7} fill={lc(f.biceps)}>{f.biceps}%</SvgText>
        <SvgText x={154} y={150} textAnchor="start"  fontFamily={FONT.mono} fontSize={7} fill={lc(f.forearms)}>{f.forearms}%</SvgText>

        {/* Centre: quads */}
        <SvgText x={100} y={155} textAnchor="middle" fontFamily={FONT.mono} fontSize={7} fill={lc(f.quads)}>quads {f.quads}%</SvgText>

        {/* Bottom: calves — single centred label matching quads style */}
        <SvgText x={100} y={214} textAnchor="middle" fontFamily={FONT.mono} fontSize={7} fill={lc(f.calves)}>calves {f.calves}%</SvgText>

      </Svg>

      {/* ── FATIGUED → FRESH gradient legend ── */}
      <View style={styles.legendRow}>
        <Text style={[TEXT.monoSmall, { color: theme.textMuted, textTransform: 'uppercase' }]}>
          FRESH
        </Text>
        <LinearGradient
          colors={[theme.textFaint, theme.accent]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gradientBar}
        />
        <Text style={[TEXT.monoSmall, { color: theme.textMuted, textTransform: 'uppercase' }]}>
          FATIGUED
        </Text>
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACE.md,
    gap: SPACE.sm,
  },
  gradientBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
})
