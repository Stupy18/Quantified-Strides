export type AppTheme = {
  bgPage: string
  bgCard: string
  bgCardDeep: string
  bgAlert: string

  textPrimary: string
  textMuted: string
  textFaint: string
  textOnAccent: string
  textOnAlert: string

  accent: string

  borderSubtle: string
  divider: string
  tabBorder: string
}

export const ThemeWarm: AppTheme = {
  bgPage:       '#1A0F0F',
  bgCard:       '#2A1A1A',
  bgCardDeep:   '#221515',
  bgAlert:      '#521532',

  textPrimary:  '#F5EFE6',
  textMuted:    '#A89080',
  textFaint:    '#5C4040',
  textOnAccent: '#1A0F0F',
  textOnAlert:  '#F5EFE6',

  accent:       '#DFBA7A',

  borderSubtle: '#3a2525',
  divider:      'rgba(220,170,100,0.12)',
  tabBorder:    'rgba(220,170,100,0.15)',
}

export const ThemeCool: AppTheme = {
  bgPage:       '#0E0F1A',
  bgCard:       '#1A1C2E',
  bgCardDeep:   '#151728',
  bgAlert:      '#7C131F',

  textPrimary:  '#F5EFE6',
  textMuted:    '#7A7E99',
  textFaint:    '#383B55',
  textOnAccent: '#0E0F1A',
  textOnAlert:  '#F5EFE6',

  accent:       '#D4D1E5',

  borderSubtle: '#272946',
  divider:      'rgba(212,209,229,0.1)',
  tabBorder:    'rgba(212,209,229,0.12)',
}

export const ActiveTheme: AppTheme = ThemeWarm
