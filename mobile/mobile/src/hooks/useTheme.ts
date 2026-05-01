import { ActiveTheme, AppTheme } from '../theme'
import {useThemeContext} from "../context/ThemeContext";

export function useTheme() {
  return useThemeContext().theme
}
