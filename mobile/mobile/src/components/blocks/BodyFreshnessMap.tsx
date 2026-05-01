import React, { useRef, useState } from 'react'
import { View, Text, Animated, TouchableOpacity, StyleSheet } from 'react-native'
import Svg, { Ellipse, G, Rect, Text as SvgText } from 'react-native-svg'
import { LinearGradient } from 'expo-linear-gradient'
import { useTheme } from '../../hooks/useTheme'
import { TEXT, SPACE, FONT } from '../../theme'

// ── Region definitions ────────────────────────────────────────────────────────

const REGIONS = {
  shoulders: {
    label:   'Shoulders & Back',
    muscles: ['front_delt', 'side_delt', 'rear_delt', 'traps', 'rhomboids', 'lats', 'upper_back', 'chest'],
  },
  arms: {
    label:   'Arms',
    muscles: ['biceps', 'triceps', 'forearms'],
  },
  core: {
    label:   'Core',
    muscles: ['abs', 'obliques', 'lower_back'],
  },
  legs: {
    label:   'Upper Legs',
    muscles: ['quads', 'hamstrings', 'glutes', 'hip_flexors', 'hip_abductors', 'hip_adductors'],
  },
  calves: {
    label:   'Lower Legs',
    muscles: ['calves', 'tibialis', 'peroneals'],
  },
} as const

type RegionKey = keyof typeof REGIONS

// FOCAL_Y: fraction of viewBox height (220) that centres the viewport during zoom.
// legs=122/220  → hip/thigh junction centred; torso visible above, knees near bottom.
// calves=154/220 → knees and lower in frame.
const FOCAL_Y: Record<RegionKey, number> = {
  shoulders: 80  / 220,
  core:      95  / 220,
  arms:      125 / 220,
  legs:      122 / 220,
  calves:    154 / 220,
}

const SVG_H = 200
const ZOOM  = 1.8

// ── SVG label data ────────────────────────────────────────────────────────────

// Full-body view: one label per region, coloured by fatigue.
const FULL_LABELS: Array<{
  text: string; region: RegionKey
  x: number; y: number; anchor: 'start' | 'middle' | 'end'
}> = [
  { text: 'SHOULDERS', region: 'shoulders', x: 46,  y: 84,  anchor: 'end'    },
  { text: 'ARMS',      region: 'arms',      x: 46,  y: 118, anchor: 'end'    },
  { text: 'CORE',      region: 'core',      x: 154, y: 100, anchor: 'start'  },
  { text: 'LEGS',      region: 'legs',      x: 100, y: 177, anchor: 'middle' },
  { text: 'CALVES',    region: 'calves',    x: 100, y: 214, anchor: 'middle' },
]

// Zoomed view: labels float BESIDE each shape, not on top of it.
// tx/ty = text anchor position; anchor = text alignment; keys = muscle keys for freshness.
type ShapeLabel = {
  tx: number; ty: number
  anchor: 'start' | 'end'
  name: string
  keys: string[]
}

const SHAPE_LABELS: Record<RegionKey, ShapeLabel[]> = {
  shoulders: [
    // text left of left shoulder shape (right edge x=80), text right of right (left edge x=120)
    { tx: 49,  ty: 80,  anchor: 'end',   name: 'Front Deltoid', keys: ['front_delt', 'side_delt', 'chest'] },
    { tx: 151, ty: 80,  anchor: 'start', name: 'Rear Deltoid',  keys: ['rear_delt', 'traps', 'rhomboids', 'lats', 'upper_back'] },
  ],
  arms: [
    // Biceps: label left of left biceps, Triceps: label right of right triceps
    // Forearms: label left of left forearm
    { tx: 44,  ty: 111, anchor: 'end',   name: 'Biceps',   keys: ['biceps'] },
    { tx: 156, ty: 108, anchor: 'start', name: 'Triceps',  keys: ['triceps'] },
    { tx: 44,  ty: 146, anchor: 'end',   name: 'Forearms', keys: ['forearms'] },
  ],
  core: [
    { tx: 78,  ty: 92,  anchor: 'end',   name: 'Abdominals', keys: ['abs', 'obliques'] },
    { tx: 128, ty: 127, anchor: 'start', name: 'Lower Back',  keys: ['lower_back'] },
  ],
  legs: [
    // Glutes: left of left glute ellipse (edge ~x=74)
    // Quads: left of left thigh rect (edge x=76)
    // Hamstrings: right of right thigh rect (edge x=124)
    { tx: 71,  ty: 119, anchor: 'end',   name: 'Glutes',      keys: ['glutes'] },
    { tx: 73,  ty: 147, anchor: 'end',   name: 'Quadriceps',  keys: ['quads', 'hip_flexors', 'hip_abductors'] },
    { tx: 127, ty: 147, anchor: 'start', name: 'Hamstrings',  keys: ['hamstrings', 'hip_adductors'] },
  ],
  calves: [
    { tx: 73,  ty: 190, anchor: 'end',   name: 'Calves',    keys: ['calves'] },
    { tx: 127, ty: 183, anchor: 'start', name: 'Tibialis',  keys: ['tibialis'] },
    { tx: 127, ty: 200, anchor: 'start', name: 'Peroneals', keys: ['peroneals'] },
  ],
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function regionFreshness(key: RegionKey, api: Record<string, number>): number {
  const keys    = REGIONS[key].muscles as readonly string[]
  const tracked = keys.filter(m => m in api)
  if (!tracked.length) return 100
  return Math.round(tracked.reduce((s, m) => s + api[m], 0) / tracked.length * 100)
}

function avgFreshness(keys: readonly string[], api: Record<string, number>): number {
  const tracked = keys.filter(k => k in api)
  if (!tracked.length) return 100
  return Math.round(tracked.reduce((s, k) => s + api[k], 0) / tracked.length * 100)
}

function toHex(pct: number): string {
  const v = Math.round(0x18 + (0x72 - 0x18) * (1 - Math.max(0, Math.min(100, pct)) / 100))
  return v.toString(16).padStart(2, '0')
}

// ── Component ─────────────────────────────────────────────────────────────────

interface BodyFreshnessMapProps {
  muscles?: Record<string, number>
}

export function BodyFreshnessMap({ muscles }: BodyFreshnessMapProps) {
  const theme = useTheme()

  const [selected, setSelected] = useState<RegionKey | null>(null)

  const scaleAnim   = useRef(new Animated.Value(1)).current
  const tyAnim      = useRef(new Animated.Value(0)).current
  const hintOpacity = useRef(new Animated.Value(1)).current
  const backOpacity = useRef(new Animated.Value(0)).current

  const api = muscles ?? {}

  const fr = {
    shoulders: regionFreshness('shoulders', api),
    arms:      regionFreshness('arms',      api),
    core:      regionFreshness('core',      api),
    legs:      regionFreshness('legs',      api),
    calves:    regionFreshness('calves',    api),
  }

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
    Animated.parallel([
      Animated.spring(scaleAnim,   { toValue: 1, ...SPRING }),
      Animated.spring(tyAnim,      { toValue: 0, ...SPRING }),
      Animated.timing(hintOpacity, { toValue: 1, duration: 200, delay: 80, useNativeDriver: true }),
      Animated.timing(backOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
    ]).start(() => setSelected(null))
  }

  function press(r: RegionKey) {
    return () => selected === r ? zoomOut() : animateTo(r)
  }

  const accent = theme.accent

  const lc  = (r: RegionKey) => fr[r] < 70 ? accent : theme.textMuted
  const bdr = (r: RegionKey) => ({
    stroke:      selected === r ? accent : theme.textFaint,
    strokeWidth: selected === r ? 1.5 : 0.5,
  })

  // Shape fill: region-average when not zoomed; per-muscle-group freshness when zoomed.
  function fill(region: RegionKey, muscleKeys: readonly string[]): string {
    if (selected !== region) return accent + toHex(fr[region])
    return accent + toHex(avgFreshness(muscleKeys, api))
  }

  const isSel = (r: RegionKey) => selected === r

  return (
    <>
      {/* ── Zoom container ─────────────────────────────────────────────────── */}
      <View style={[styles.outerContainer, { height: SVG_H }]}>

        <View style={styles.svgClip}>
          <Animated.View style={{ width: '100%', transform: [{ scale: scaleAnim }, { translateY: tyAnim }] }}>
            <Svg width="100%" height={SVG_H} viewBox="0 0 200 220">

              {/* Head & neck */}
              <Ellipse cx={100} cy={34} rx={21} ry={24} fill={accent + '28'} stroke={theme.textFaint} strokeWidth={0.5} />
              <Rect x={94} y={57} width={12} height={11} rx={3}             fill={accent + '28'} stroke={theme.textFaint} strokeWidth={0.5} />

              {/* ── Core ── */}
              <G onPress={press('core')}>
                {isSel('core') ? (
                  <>
                    {/* Abs: two columns with tendinous intersections */}
                    <Rect x={81} y={66} width={17} height={54} rx={7} fill={fill('core', ['abs', 'obliques'])} {...bdr('core')} />
                    <Rect x={102} y={66} width={17} height={54} rx={7} fill={fill('core', ['abs', 'obliques'])} {...bdr('core')} />
                    {/* Tendinous intersections (horizontal divisions) */}
                    <Rect x={81} y={80}  width={17} height={2} rx={1} fill={accent + '40'} />
                    <Rect x={102} y={80} width={17} height={2} rx={1} fill={accent + '40'} />
                    <Rect x={81} y={96}  width={17} height={2} rx={1} fill={accent + '40'} />
                    <Rect x={102} y={96} width={17} height={2} rx={1} fill={accent + '40'} />
                    {/* Lower back: paired erector spinae mounds */}
                    <Ellipse cx={89}  cy={127} rx={10} ry={6} fill={fill('core', ['lower_back'])} {...bdr('core')} />
                    <Ellipse cx={111} cy={127} rx={10} ry={6} fill={fill('core', ['lower_back'])} {...bdr('core')} />
                  </>
                ) : (
                  <>
                    <Rect x={80} y={65}  width={40} height={58} rx={8} fill={fill('core', ['abs', 'obliques'])} {...bdr('core')} />
                    <Rect x={74} y={120} width={52} height={14} rx={6} fill={fill('core', ['lower_back'])}      {...bdr('core')} />
                  </>
                )}
              </G>

              {/* ── Shoulders ── */}
              <G onPress={press('shoulders')}>
                {isSel('shoulders') ? (
                  <>
                    {/* Anterior chain: rounded deltoid cap + smaller side-delt accent */}
                    <Ellipse cx={66} cy={80} rx={14} ry={13} fill={fill('shoulders', ['front_delt', 'side_delt', 'chest'])} {...bdr('shoulders')} />
                    <Ellipse cx={61} cy={71} rx={7}  ry={6}  fill={fill('shoulders', ['side_delt'])} {...bdr('shoulders')} />
                    {/* Posterior chain: rounded cap + upper trap accent */}
                    <Ellipse cx={134} cy={80} rx={14} ry={13} fill={fill('shoulders', ['rear_delt', 'rhomboids', 'lats', 'upper_back'])} {...bdr('shoulders')} />
                    <Ellipse cx={139} cy={71} rx={7}  ry={6}  fill={fill('shoulders', ['traps', 'upper_back'])} {...bdr('shoulders')} />
                    {/* Trapezius: visible at neck base, center */}
                    <Rect x={89} y={58} width={22} height={14} rx={5} fill={fill('shoulders', ['traps', 'upper_back'])} {...bdr('shoulders')} />
                  </>
                ) : (
                  <>
                    <Rect x={52}  y={66} width={28} height={28} rx={6} fill={fill('shoulders', ['front_delt', 'side_delt', 'chest'])}                   {...bdr('shoulders')} />
                    <Rect x={120} y={66} width={28} height={28} rx={6} fill={fill('shoulders', ['rear_delt', 'traps', 'rhomboids', 'lats', 'upper_back'])} {...bdr('shoulders')} />
                  </>
                )}
              </G>

              {/* ── Upper arms ── */}
              <G onPress={press('arms')}>
                {isSel('arms') ? (
                  <>
                    {/* Left arm: triceps (back, narrower rect) rendered first, biceps (front, oval) on top */}
                    <Rect x={57}  y={97} width={9}  height={32} rx={4} fill={fill('arms', ['triceps'])} {...bdr('arms')} />
                    <Ellipse cx={52} cy={113} rx={7} ry={17}           fill={fill('arms', ['biceps'])}  {...bdr('arms')} />
                    {/* Right arm: triceps (back) then biceps (front oval) */}
                    <Rect x={134} y={97} width={9}  height={32} rx={4} fill={fill('arms', ['triceps'])} {...bdr('arms')} />
                    <Ellipse cx={148} cy={113} rx={7} ry={17}          fill={fill('arms', ['biceps'])}  {...bdr('arms')} />
                  </>
                ) : (
                  <>
                    <Rect x={50}  y={95} width={16} height={36} rx={5} fill={fill('arms', ['biceps', 'triceps'])} {...bdr('arms')} />
                    <Rect x={134} y={95} width={16} height={36} rx={5} fill={fill('arms', ['biceps', 'triceps'])} {...bdr('arms')} />
                  </>
                )}
              </G>

              {/* ── Forearms ── */}
              <G onPress={press('arms')}>
                <Rect x={52}  y={132} width={13} height={28} rx={5} fill={fill('arms', ['forearms'])} {...bdr('arms')} />
                <Rect x={135} y={132} width={13} height={28} rx={5} fill={fill('arms', ['forearms'])} {...bdr('arms')} />
              </G>

              {/* ── Upper legs ── */}
              <G onPress={press('legs')}>
                {isSel('legs') ? (
                  <>
                    {/* Glute caps: bilateral rounded ellipses above thighs */}
                    <Ellipse cx={87}  cy={121} rx={13} ry={9} fill={fill('legs', ['glutes'])} {...bdr('legs')} />
                    <Ellipse cx={113} cy={121} rx={13} ry={9} fill={fill('legs', ['glutes'])} {...bdr('legs')} />
                    {/* Left leg: vastus lateralis (outer) + rectus femoris (inner) */}
                    <Rect x={76} y={124} width={10} height={50} rx={5} fill={fill('legs', ['hip_abductors', 'quads'])} {...bdr('legs')} />
                    <Rect x={85} y={124} width={12} height={50} rx={5} fill={fill('legs', ['quads', 'hip_flexors'])}   {...bdr('legs')} />
                    {/* Right leg: bicep femoris (outer) + semitendinosus (inner) */}
                    <Rect x={103} y={124} width={12} height={50} rx={5} fill={fill('legs', ['hamstrings'])}            {...bdr('legs')} />
                    <Rect x={114} y={124} width={10} height={50} rx={5} fill={fill('legs', ['hamstrings', 'hip_adductors'])} {...bdr('legs')} />
                  </>
                ) : (
                  <>
                    <Rect x={76}  y={124} width={22} height={50} rx={6} fill={fill('legs', ['quads', 'hip_flexors', 'hip_abductors'])} {...bdr('legs')} />
                    <Rect x={102} y={124} width={22} height={50} rx={6} fill={fill('legs', ['hamstrings', 'hip_adductors'])}           {...bdr('legs')} />
                  </>
                )}
              </G>

              {/* ── Lower legs ── */}
              <G onPress={press('calves')}>
                {isSel('calves') ? (
                  <>
                    {/* Left leg: gastrocnemius two heads (overlapping ellipses) + soleus base */}
                    <Rect x={78} y={199} width={16} height={12} rx={4} fill={fill('calves', ['calves'])}   {...bdr('calves')} />
                    <Ellipse cx={82} cy={187} rx={8} ry={14}           fill={fill('calves', ['calves'])}   {...bdr('calves')} />
                    <Ellipse cx={89} cy={185} rx={6} ry={12}           fill={fill('calves', ['calves'])}   {...bdr('calves')} />
                    {/* Right leg: tibialis anterior (front shin, taller) + peroneals (outer, shorter) */}
                    <Rect x={104} y={178} width={9}  height={34} rx={4} fill={fill('calves', ['tibialis'])}  {...bdr('calves')} />
                    <Rect x={113} y={186} width={7}  height={24} rx={3} fill={fill('calves', ['peroneals'])} {...bdr('calves')} />
                  </>
                ) : (
                  <>
                    <Rect x={78}  y={176} width={18} height={36} rx={5} fill={fill('calves', ['calves'])}              {...bdr('calves')} />
                    <Rect x={104} y={176} width={18} height={36} rx={5} fill={fill('calves', ['tibialis', 'peroneals'])} {...bdr('calves')} />
                  </>
                )}
              </G>

              {/* ── Labels ── */}
              {selected === null
                ? FULL_LABELS.map(l => (
                    <SvgText
                      key={l.text}
                      x={l.x} y={l.y}
                      textAnchor={l.anchor}
                      fontFamily={FONT.mono}
                      fontSize={7}
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
                          x={l.tx} y={l.ty - 1}
                          textAnchor={l.anchor}
                          fontFamily={FONT.mono}
                          fontSize={4.5}
                          fill={theme.textMuted}
                        >
                          {l.name}
                        </SvgText>
                        <SvgText
                          x={l.tx} y={l.ty + 6}
                          textAnchor={l.anchor}
                          fontFamily={FONT.mono}
                          fontSize={5.5}
                          fill={pct < 70 ? accent : theme.textFaint}
                        >
                          {pct}%
                        </SvgText>
                      </React.Fragment>
                    )
                  })
              }

            </Svg>
          </Animated.View>
        </View>

        {/* ← Full body button */}
        <Animated.View
          style={[styles.backButton, { opacity: backOpacity }]}
          pointerEvents={selected ? 'auto' : 'none'}
        >
          <TouchableOpacity onPress={zoomOut} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
            <Text style={[TEXT.monoSmall, { color: theme.textFaint }]}>← FULL BODY</Text>
          </TouchableOpacity>
        </Animated.View>

      </View>

      {/* Hint */}
      <Animated.View style={{ opacity: hintOpacity }}>
        <Text style={[TEXT.monoSmall, { color: theme.textFaint, textAlign: 'center', marginTop: SPACE.xs }]}>
          tap a region to zoom in
        </Text>
      </Animated.View>

      {/* ── Legend ─────────────────────────────────────────────────────────── */}
      <View style={styles.legendRow}>
        <Text style={[TEXT.monoSmall, { color: theme.textMuted, textTransform: 'uppercase' }]}>FRESH</Text>
        <LinearGradient
          colors={[theme.textFaint, accent]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={styles.gradientBar}
        />
        <Text style={[TEXT.monoSmall, { color: theme.textMuted, textTransform: 'uppercase' }]}>FATIGUED</Text>
      </View>
    </>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  outerContainer: {
    position: 'relative',
    width:    '100%',
  },
  svgClip: {
    width:    '100%',
    overflow: 'hidden',
    flex:     1,
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
