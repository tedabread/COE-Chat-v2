import { useState, useEffect } from 'react'

const STORAGE_KEY = 'coe-chat-theme'
const ACCENT_KEY = 'coe-chat-accent'
const DEFAULT_THEME = 'dark'
const DEFAULT_ACCENT = '#007acc'

export type Theme = 'light' | 'dark'

const CATPPUCCIN_THEMES = ['latte', 'frappe', 'macchiato', 'mocha']

export const accentPresets = [
  { name: 'Blue', color: '#007acc' },
  { name: 'Red', color: '#e05858' },
  { name: 'Green', color: '#74b868' },
  { name: 'Pink', color: '#d09abb' },
  { name: 'Purple', color: '#b086d9' },
  { name: 'Orange', color: '#d8945a' },
  { name: 'Teal', color: '#58b0a4' },
  { name: 'Yellow', color: '#d4aa50' },
]

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as string | null
    if (stored && CATPPUCCIN_THEMES.includes(stored)) return DEFAULT_THEME
    return (stored as Theme) || DEFAULT_THEME
  })

  const [accent, setAccentState] = useState<string>(() => {
    return localStorage.getItem(ACCENT_KEY) || DEFAULT_ACCENT
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  useEffect(() => {
    document.documentElement.style.setProperty('--blue', accent)
    localStorage.setItem(ACCENT_KEY, accent)
  }, [accent])

  const setTheme = (t: Theme) => {
    setThemeState(t)
  }

  const setAccent = (c: string) => {
    setAccentState(c)
  }

  return { theme, setTheme, accent, setAccent }
}

export const themes: { id: Theme; name: string; description: string }[] = [
  { id: 'light', name: 'Light', description: '' },
  { id: 'dark', name: 'Dark', description: '' },
]
