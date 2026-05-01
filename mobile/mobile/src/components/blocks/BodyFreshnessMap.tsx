import React, { useRef, useState, useMemo } from 'react'
import { View, Text, Animated, TouchableOpacity, StyleSheet, Pressable } from 'react-native'
import Svg, { G, Rect as SvgRect, Text as SvgText } from 'react-native-svg'
import Body, { ExtendedBodyPart, Slug } from 'react-native-body-highlighter'
import { LinearGradient } from 'expo-linear-gradient'
import { useTheme } from '../../hooks/useTheme'
import { TEXT, SPACE, FONT } from '../../theme'

// ── Region definitions ────────────────────────────────────────────────────────

type RegionKey = 'shoulders' | 'arms' | 'core' | 'legs' | 'calves'

const REGIONS: Record<RegionKey, { label: string; muscles: string[] }> = {
  shoulders: { label: 'Shoulders & Back', muscles: ['front_delt', 'side_delt', 'rear_delt', 'traps', 'rhomboids', 'lats', 'upper_back', 'chest'] },
  arms:      { label: 'Arms',             muscles: ['biceps', 'triceps', 'forearms'] },
  core:      { label: 'Core',             muscles: ['abs', 'obliques', 'lower_back'] },
  legs:      { label: 'Upper Legs',       muscles: ['quads', 'hamstrings', 'glutes', 'hip_flexors', 'hip_abductors', 'hip_adductors'] },
  calves:    { label: 'Lower Legs',       muscles: ['calves', 'tibialis', 'peroneals'] },
}

// ── Slug → muscle keys / region ───────────────────────────────────────────────

const SLUG_MUSCLES: Partial<Record<Slug, string[]>> = {
  'abs':        ['abs'],
  'adductors':  ['hip_adductors'],
  'biceps':     ['biceps'],
  'calves':     ['calves', 'peroneals'],
  'chest':      ['chest'],
  'deltoids':   ['front_delt', 'side_delt', 'rear_delt'],
  'forearm':    ['forearms'],
  'gluteal':    ['glutes'],
  'hamstring':  ['hamstrings'],
  'lower-back': ['lower_back'],
  'obliques':   ['obliques'],
  'quadriceps': ['quads', 'hip_flexors', 'hip_abductors'],
  'tibialis':   ['tibialis'],
  'trapezius':  ['traps'],
  'triceps':    ['triceps'],
  'upper-back': ['rhomboids', 'lats', 'upper_back'],
}

const SLUG_REGION: Partial<Record<Slug, RegionKey>> = {
  'abs':        'core',
  'adductors':  'legs',
  'biceps':     'arms',
  'calves':     'calves',
  'chest':      'shoulders',
  'deltoids':   'shoulders',
  'forearm':    'arms',
  'gluteal':    'legs',
  'hamstring':  'legs',
  'lower-back': 'core',
  'obliques':   'core',
  'quadriceps': 'legs',
  'tibialis':   'calves',
  'trapezius':  'shoulders',
  'triceps':    'arms',
  'upper-back': 'shoulders',
}

// ── Layout constants ──────────────────────────────────────────────────────────

const BODY_SCALE = 0.5
const BODY_W     = 100   // 200 * 0.5
const BODY_H     = 200   // 400 * 0.5
const GAP        = 60    // centre label column between the two bodies
const PAD        = 0     // no outer margin — labels live in the gap

// Overlay SVG coordinate space (1:1 px mapping, same as bodyRow dimensions).
// Front body occupies x = 0..100
// Gap (label column) x = 100..160 — CX = 130 is the midpoint
// Back  body occupies x = 160..260
const OW = PAD + BODY_W + GAP + BODY_W + PAD   // 260
const OH = BODY_H                               // 200
const CX = PAD + BODY_W + Math.floor(GAP / 2)  // 130 — gap midpoint

const SVG_H = BODY_H   // 200  (used in animation formula)
const ZOOM  = 1.4

// FOCAL_Y: fraction of body height to centre on.
// At ZOOM=1.4 the visible window is ±71px around focal, so legs=0.48 shows
// hip/upper thigh (body_y≈96) with visible range [24,167] — excludes feet.
const FOCAL_Y: Record<RegionKey, number> = {
  shoulders: 0.20,
  arms:      0.35,
  core:      0.46,
  legs:      0.48,
  calves:    0.62,
}

// ── Touch-zone boundaries in overlay space (y range within 0..OH) ─────────────

const REGION_ORDER: RegionKey[] = ['shoulders', 'arms', 'core', 'legs', 'calves']

// Each region covers a y-band across the full body width (both front + back).
// x span: 0..260
const ZONE_X      = PAD                    // 0
const ZONE_W      = BODY_W + GAP + BODY_W  // 260

type TouchZone = { top: number; height: number }
const ZONES: Record<RegionKey, TouchZone> = {
  shoulders: { top: 0,   height: 50 },
  arms:      { top: 50,  height: 30 },
  core:      { top: 80,  height: 30 },
  legs:      { top: 110, height: 46 },
  calves:    { top: 156, height: 44 },
}

// ── Label data in overlay coordinate space ────────────────────────────────────

// All labels sit in the centre gap — textAnchor='middle' at CX.
const C = (ty: number) => ({ tx: CX, ty, anchor: 'middle' as const })

// Full-body view: one region name per band, centred in the gap.
type FullLabel = { region: RegionKey; text: string; tx: number; ty: number; anchor: 'middle' }
const FULL_LABELS: FullLabel[] = [
  { region: 'shoulders', text: 'SHOULDERS', ...C(43)  },
  { region: 'arms',      text: 'ARMS',      ...C(64)  },
  { region: 'core',      text: 'CORE',      ...C(83)  },
  { region: 'legs',      text: 'LEGS',      ...C(126) },
  { region: 'calves',    text: 'CALVES',    ...C(166) },
]

// Zoomed view: name + % per muscle group, stacked in the gap column.
type ShapeLabel = { name: string; keys: string[]; tx: number; ty: number; anchor: 'middle' }
const SHAPE_LABELS: Record<RegionKey, ShapeLabel[]> = {
  shoulders: [
    { name: 'Deltoids',   keys: ['front_delt', 'side_delt', 'rear_delt'], ...C(34)  },
    { name: 'Chest',      keys: ['chest'],                                  ...C(56)  },
    { name: 'Trapezius',  keys: ['traps'],                                  ...C(78)  },
    { name: 'Upper Back', keys: ['rhomboids', 'lats', 'upper_back'],        ...C(100) },
  ],
  arms: [
    { name: 'Biceps',   keys: ['biceps'],   ...C(56) },
    { name: 'Triceps',  keys: ['triceps'],  ...C(78) },
    { name: 'Forearms', keys: ['forearms'], ...C(100) },
  ],
  core: [
    { name: 'Abdominals', keys: ['abs', 'obliques'], ...C(72) },
    { name: 'Lower Back', keys: ['lower_back'],        ...C(94) },
  ],
  legs: [
    { name: 'Glutes',     keys: ['glutes'],                                 ...C(100) },
    { name: 'Quadriceps', keys: ['quads', 'hip_flexors', 'hip_abductors'],  ...C(122) },
    { name: 'Hamstrings', keys: ['hamstrings', 'hip_adductors'],            ...C(144) },
  ],
  calves: [
    { name: 'Tibialis', keys: ['tibialis', 'peroneals'], ...C(154) },
    { name: 'Calves',   keys: ['calves'],                ...C(176) },
  ],
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function regionFreshness(key: RegionKey, api: Record<string, number>): number {
  const muscles = REGIONS[key].muscles as readonly string[]
  const tracked = muscles.filter(m => m in api)
  if (!tracked.length) return 100
  return Math.round(tracked.reduce((s, m) => s + api[m], 0) / tracked.length * 100)
}

function avgFreshness(keys: readonly string[], api: Record<string, number>): number {
  const tracked = keys.filter(k => k in api)
  if (!tracked.length) return 100
  return Math.round(tracked.reduce((s, k) => s + api[k], 0) / tracked.length * 100)
}

// Maps freshness 0–100 to hex opacity: 100% → '18' (dim/fresh), 0% → '72' (bright/fatigued).
function toHex(pct: number): string {
  const v = Math.round(0x18 + (0x72 - 0x18) * (1 - Math.max(0, Math.min(100, pct)) / 100))
  return v.toString(16).padStart(2, '0')
}

// ── Component ─────────────────────────────────────────────────────────────────

interface BodyFreshnessMapProps {
  muscles?: Record<string, number>
  gender?: 'male' | 'female'
}

export function BodyFreshnessMap({ muscles, gender = 'male' }: BodyFreshnessMapProps) {
  const theme = useTheme()
  const [selected, setSelected] = useState<RegionKey | null>(null)

  const scaleAnim   = useRef(new Animated.Value(1)).current
  const tyAnim      = useRef(new Animated.Value(0)).current
  const hintOpacity = useRef(new Animated.Value(1)).current
  const backOpacity = useRef(new Animated.Value(0)).current

  const api    = muscles ?? {}
  const accent = theme.accent

  const SPRING = { tension: 110, friction: 14, useNativeDriver: true } as const

  function animateTo(r: RegionKey) {
    const ty = -(FOCAL_Y[r] - 0.5) * SVG_H * ZOOM
    Animated.parallel([
      Animated.spring(scaleAnim,   { toValue: ZOOM, ...SPRING }),
      Animated.spring(tyAnim,      { toValue: ty,   ...SPRING }),
      Animated.timing(hintOpacity, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(backOpacity, { toValue: 1, duration: 200, delay: 60, useNativeDriver: true }),
    ]).start()
    setSelected(r)
  }

  function zoomOut() {
    setSelected(null)
    Animated.parallel([
      Animated.spring(scaleAnim,   { toValue: 1, ...SPRING }),
      Animated.spring(tyAnim,      { toValue: 0, ...SPRING }),
      Animated.timing(hintOpacity, { toValue: 1, duration: 200, delay: 80, useNativeDriver: true }),
      Animated.timing(backOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
    ]).start()
  }

  function handleRegionPress(r: RegionKey) {
    selected === r ? zoomOut() : animateTo(r)
  }

  // Body data: selected region stays fully coloured + outlined; others dim.
  const bodyData = useMemo((): ExtendedBodyPart[] =>
    (Object.entries(SLUG_MUSCLES) as [Slug, string[]][]).map(([slug, keys]) => {
      const pct        = avgFreshness(keys, api)
      const region     = SLUG_REGION[slug]
      const isSelected = selected !== null && region === selected
      const color      = (selected === null || isSelected)
        ? accent + toHex(pct)
        : accent + '14'
      return {
        slug,
        color,
        styles: isSelected
          ? { stroke: accent, strokeWidth: 2 }
          : undefined,
      }
    }),
  [selected, api, accent])

  // Region freshness → label colour in full-body view.
  const fr = useMemo(() => ({
    shoulders: regionFreshness('shoulders', api),
    arms:      regionFreshness('arms',      api),
    core:      regionFreshness('core',      api),
    legs:      regionFreshness('legs',      api),
    calves:    regionFreshness('calves',    api),
  }), [api])
  const lc = (r: RegionKey) => fr[r] < 70 ? accent : theme.textMuted

  const bodyProps = {
    data:               bodyData,
    gender,
    scale:              BODY_SCALE,
    border:             theme.textFaint,
    defaultFill:        accent + '14',
    defaultStroke:      theme.textFaint,
    defaultStrokeWidth: 0.5,
  }

  return (
    <Pressable onPress={() => { if (selected !== null) zoomOut() }}>
      {/* ── Zoom container ──────────────────────────────────────────────── */}
      <View style={[styles.outerContainer, { height: BODY_H }]}>
        <View style={styles.svgClip}>
          <Animated.View
            style={{ transform: [{ scale: scaleAnim }, { translateY: tyAnim }] }}
          >
            {/*
              bodyRow: paddingHorizontal=PAD creates the label columns on each side.
              Overlay SVG is position:absolute over the same area.
            */}
            <View style={styles.bodyRow}>
              <Body {...bodyProps} side="front" />
              <Body {...bodyProps} side="back"  />

              {/* ── Overlay SVG — labels + tap zones ─────────────────── */}
              <Svg
                style={styles.overlay}
                width={OW}
                height={OH}
                viewBox={`0 0 ${OW} ${OH}`}
              >
                {/* Tap zones: transparent rects per region, catch all presses */}
                {REGION_ORDER.map(r => {
                  const z = ZONES[r]
                  return (
                    <G key={r} onPress={() => handleRegionPress(r)}>
                      <SvgRect
                        x={ZONE_X} y={z.top}
                        width={ZONE_W} height={z.height}
                        fill="transparent"
                      />
                    </G>
                  )
                })}

                {/* Labels: region names (full body) or muscle names + % (zoomed) */}
                {selected === null
                  ? FULL_LABELS.map(l => (
                      <SvgText
                        key={l.text}
                        x={l.tx} y={l.ty}
                        textAnchor={l.anchor}
                        fontFamily={FONT.mono}
                        fontSize={10}
                        fill={lc(l.region)}
                      >
                        {l.text}
                      </SvgText>
                    ))
                  : SHAPE_LABELS[selected].map((l, i) => {
                      const pct = avgFreshness(l.keys, api)
                      return (
                        <React.Fragment key={i}>
                          <SvgText
                            x={l.tx} y={l.ty - 2}
                            textAnchor={l.anchor}
                            fontFamily={FONT.mono}
                            fontSize={8}
                            fill={theme.textMuted}
                          >
                            {l.name}
                          </SvgText>
                          <SvgText
                            x={l.tx} y={l.ty + 9}
                            textAnchor={l.anchor}
                            fontFamily={FONT.mono}
                            fontSize={9}
                            fill={pct < 70 ? accent : theme.textFaint}
                          >
                            {pct}%
                          </SvgText>
                        </React.Fragment>
                      )
                    })
                }
              </Svg>
            </View>
          </Animated.View>
        </View>

        {/* ← Full body button — outside Animated.View so it always works */}
        <Animated.View
          style={[styles.backButton, { opacity: backOpacity }]}
          pointerEvents={selected ? 'auto' : 'none'}
        >
          <TouchableOpacity onPress={zoomOut} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
            <Text style={[TEXT.monoSmall, { color: theme.textFaint }]}>← FULL BODY</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* ── Hint ─────────────────────────────────────────────────────────── */}
      <Animated.View style={{ opacity: hintOpacity }}>
        <Text style={[TEXT.monoSmall, { color: theme.textFaint, textAlign: 'center', marginTop: SPACE.xs }]}>
          tap a region to zoom in
        </Text>
      </Animated.View>

      {/* ── Legend ───────────────────────────────────────────────────────── */}
      <View style={styles.legendRow}>
        <Text style={[TEXT.monoSmall, { color: theme.textMuted, textTransform: 'uppercase' }]}>FRESH</Text>
        <LinearGradient
          colors={[theme.textFaint, accent]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={styles.gradientBar}
        />
        <Text style={[TEXT.monoSmall, { color: theme.textMuted, textTransform: 'uppercase' }]}>FATIGUED</Text>
      </View>
    </Pressable>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  outerContainer: {
    position: 'relative',
    width:    '100%',
  },
  svgClip: {
    width:      '100%',
    overflow:   'hidden',
    flex:       1,
    alignItems: 'center',
  },
  bodyRow: {
    flexDirection: 'row',
    gap:           GAP,
    position:      'relative',
    width:         OW,
    alignSelf:     'center',
  },
  overlay: {
    position: 'absolute',
    left:     0,
    top:      0,
  },
  backButton: {
    position: 'absolute',
    top:      SPACE.sm,
    left:     0,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems:    'center',
    marginTop:     SPACE.lg,
    gap:           SPACE.sm,
  },
  gradientBar: {
    flex:         1,
    height:       4,
    borderRadius: 2,
  },
})
