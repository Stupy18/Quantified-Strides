import React, { createContext, useContext, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { AppTheme, ThemeWarm, ThemeCool } from '../theme/colors'

type ThemeName = 'warm' | 'cool'

interface ThemeContextValue {
  theme:       AppTheme
  themeName:   ThemeName
  toggleTheme: () => void
}

const THEME_KEY = 'qs_theme'

const ThemeContext = createContext<ThemeContextValue>({
  theme:       ThemeWarm,
  themeName:   'warm',
  toggleTheme: () => {},
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeName, setThemeName] = useState<ThemeName>('warm')

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then(val => {
      if (val === 'cool') setThemeName('cool')
    })
  }, [])

  async function toggleTheme() {
    const next: ThemeName = themeName === 'warm' ? 'cool' : 'warm'
    setThemeName(next)
    await AsyncStorage.setItem(THEME_KEY, next)
  }

  const theme = themeName === 'warm' ? ThemeWarm : ThemeCool

  return (
    <ThemeContext.Provider value={{ theme, themeName, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useThemeContext() {
  return useContext(ThemeContext)
}
