export const FONT = {
  serif:       'Newsreader',
  serifItalic: 'Newsreader_Italic',
  mono:        'JetBrainsMono',
  sans:        'Geist',
} as const

export const TEXT = {
  displayLarge:  { fontFamily: FONT.serif,       fontSize: 44, letterSpacing: -0.8 },
  displayMedium: { fontFamily: FONT.serif,       fontSize: 36, letterSpacing: -0.6 },
  displaySmall:  { fontFamily: FONT.serif,       fontSize: 28, letterSpacing: -0.4 },

  headingLarge:  { fontFamily: FONT.serif,       fontSize: 22, letterSpacing: -0.2 },
  headingMedium: { fontFamily: FONT.serif,       fontSize: 18, letterSpacing: -0.15 },

  bodyLarge:     { fontFamily: FONT.sans,        fontSize: 15, lineHeight: 22 },
  bodyMedium:    { fontFamily: FONT.sans,        fontSize: 13.5, lineHeight: 20 },
  bodySmall:     { fontFamily: FONT.sans,        fontSize: 12, lineHeight: 18 },

  narrativeLarge:  { fontFamily: FONT.serifItalic, fontSize: 15, lineHeight: 22 },
  narrativeMedium: { fontFamily: FONT.serifItalic, fontSize: 13.5, lineHeight: 20 },
  narrativeSmall:  { fontFamily: FONT.serifItalic, fontSize: 12, lineHeight: 18 },

  monoLarge:  { fontFamily: FONT.mono, fontSize: 12, letterSpacing: 0.8 },
  monoMedium: { fontFamily: FONT.mono, fontSize: 10, letterSpacing: 1.6 },
  monoSmall:  { fontFamily: FONT.mono, fontSize: 9,  letterSpacing: 2.0 },
} as const
