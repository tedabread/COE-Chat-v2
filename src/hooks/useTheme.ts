import { useState, useEffect } from 'react'

const STORAGE_KEY = 'coe-chat-theme'
const DEFAULT_THEME = 'latte'

export type Theme = 'latte' | 'frappe' | 'macchiato' | 'mocha'

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    return (localStorage.getItem(STORAGE_KEY) as Theme) || DEFAULT_THEME
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const setTheme = (t: Theme) => {
    setThemeState(t)
  }

  return { theme, setTheme }
}

export const themes: { id: Theme; name: string; description: string }[] = [
  { id: 'latte', name: 'Latte', description: 'Light (default)' },
  { id: 'frappe', name: 'Frappé', description: 'Muted' },
  { id: 'macchiato', name: 'Macchiato', description: 'Medium contrast' },
  { id: 'mocha', name: 'Mocha', description: 'Dark' },
]
