import { View, Text, TouchableOpacity } from 'react-native'
import { useTheme } from '../../hooks/useTheme'
import { SPACE, RADIUS } from '../../theme'

export const SPORTS = [
  { key: 'trail_run',  label: 'Trail Run' },
  { key: 'xc_mtb',    label: 'XC MTB' },
  { key: 'climbing',  label: 'Climbing' },
  { key: 'ski',       label: 'Skiing' },
  { key: 'snowboard', label: 'Snowboarding' },
  { key: 'road_run',  label: 'Road Run' },
  { key: 'bike',      label: 'Road Cycling' },
]

const PRIORITIES = [1, 2, 3, 4, 5]

interface Props {
  value: Record<string, number>
  onChange: (v: Record<string, number>) => void
}

export function SportPickerMobile({ value, onChange }: Props) {
  const theme = useTheme()

  function toggle(key: string) {
    const updated = { ...value }
    if (key in updated) {
      delete updated[key]
    } else {
      updated[key] = 3
    }
    onChange(updated)
  }

  function setPriority(key: string, p: number) {
    onChange({ ...value, [key]: p })
  }

  return (
    <View style={{ gap: SPACE.sm }}>
      {SPORTS.map(sport => {
        const active   = sport.key in value
        const priority = value[sport.key] ?? 3

        return (
          <View key={sport.key}>
            <TouchableOpacity
              onPress={() => toggle(sport.key)}
              style={{
                borderWidth:     1,
                borderRadius:    RADIUS.md,
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderColor:     active ? theme.accent : theme.borderSubtle,
                backgroundColor: active ? theme.bgCardDeep : 'transparent',
              }}
            >
              <Text style={{
                fontFamily:    'JetBrainsMono',
                fontSize:      12,
                letterSpacing: 0.5,
                color:         active ? theme.accent : theme.textMuted,
              }}>
                {active ? '✓  ' : '+  '}{sport.label}
              </Text>
            </TouchableOpacity>

            {active && (
              <View style={{
                flexDirection: 'row',
                alignItems:    'center',
                flexWrap:      'wrap',
                gap:           6,
                marginTop:     6,
                paddingLeft:   4,
              }}>
                <Text style={{
                  fontFamily:    'JetBrainsMono',
                  fontSize:      9,
                  letterSpacing: 1,
                  color:         theme.textFaint,
                }}>
                  PRIORITY
                </Text>
                {PRIORITIES.map(p => (
                  <TouchableOpacity
                    key={p}
                    onPress={() => setPriority(sport.key, p)}
                    style={{
                      borderWidth:      1,
                      borderRadius:     RADIUS.md,
                      paddingHorizontal: 10,
                      paddingVertical:  4,
                      borderColor:      priority === p ? theme.accent : theme.borderSubtle,
                      backgroundColor:  priority === p ? theme.bgCardDeep : 'transparent',
                    }}
                  >
                    <Text style={{
                      fontFamily: 'JetBrainsMono',
                      fontSize:   11,
                      color:      priority === p ? theme.accent : theme.textMuted,
                    }}>
                      {p}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )
      })}
    </View>
  )
}
