export interface FontOption {
  name: string
  label: string
  category: 'sans-serif' | 'serif' | 'monospace'
  googleFont: string | null
  fallback: string
  public: boolean
}

export const fontList: FontOption[] = [
  { name: 'GoogleSansCodeNF', label: 'Default', category: 'monospace', googleFont: null, fallback: 'monospace', public: true },
  { name: 'Geologica', label: 'Sans-Serif', category: 'sans-serif', googleFont: 'Geologica:400,600,700', fallback: 'sans-serif', public: true },
  { name: 'Inter', label: 'Inter', category: 'sans-serif', googleFont: 'Inter:400,600,700', fallback: 'sans-serif', public: false },
  { name: 'DM Sans', label: 'DM Sans', category: 'sans-serif', googleFont: 'DM+Sans:400,600,700', fallback: 'sans-serif', public: false },
  { name: 'Manrope', label: 'Manrope', category: 'sans-serif', googleFont: 'Manrope:400,600,700', fallback: 'sans-serif', public: false },
  { name: 'Space Grotesk', label: 'Space Grotesk', category: 'sans-serif', googleFont: 'Space+Grotesk:400,600,700', fallback: 'sans-serif', public: false },
  { name: 'Source Serif 4', label: 'Source Serif 4', category: 'serif', googleFont: 'Source+Serif+4:400,600,700', fallback: 'serif', public: false },
  { name: 'Century', label: 'Century', category: 'serif', googleFont: null, fallback: 'serif', public: false },
  { name: 'Playfair Display', label: 'Playfair Display', category: 'serif', googleFont: 'Playfair+Display:400,600,700', fallback: 'serif', public: false },
  { name: 'Lora', label: 'Lora', category: 'serif', googleFont: 'Lora:400,600,700', fallback: 'serif', public: false },
  { name: 'Merriweather', label: 'Serif', category: 'serif', googleFont: 'Merriweather:400,700', fallback: 'serif', public: true },
  { name: 'JetBrains Mono', label: 'JetBrains Mono', category: 'monospace', googleFont: 'JetBrains+Mono:400,600,700', fallback: 'monospace', public: false },
  { name: 'Fira Code', label: 'Fira Code', category: 'monospace', googleFont: 'Fira+Code:400,600,700', fallback: 'monospace', public: false },
  { name: 'IBM Plex Mono', label: 'IBM Plex Mono', category: 'monospace', googleFont: 'IBM+Plex+Mono:400,600,700', fallback: 'monospace', public: false },
]

export const publicFonts = fontList.filter(f => f.public)

const loadedFonts = new Set<string>(['GoogleSansCodeNF', 'Century'])
let preconnectAdded = false

export function loadFont(fontName: string) {
  if (loadedFonts.has(fontName)) return
  const font = fontList.find(f => f.name === fontName)
  if (!font || !font.googleFont) return
  if (!preconnectAdded) {
    preconnectAdded = true
    const p1 = document.createElement('link')
    p1.rel = 'preconnect'
    p1.href = 'https://fonts.googleapis.com'
    document.head.appendChild(p1)
    const p2 = document.createElement('link')
    p2.rel = 'preconnect'
    p2.href = 'https://fonts.gstatic.com'
    p2.crossOrigin = 'anonymous'
    document.head.appendChild(p2)
  }
  const link = document.createElement('link')
  link.href = `https://fonts.googleapis.com/css?family=${font.googleFont}&display=swap`
  link.rel = 'stylesheet'
  document.head.appendChild(link)
  loadedFonts.add(fontName)
}

export function getFontFamily(fontName: string): string {
  if (fontName === 'GoogleSansCodeNF') return `'GoogleSansCodeNF', monospace`
  if (fontName === 'Century') return `'Century', 'Century Schoolbook', 'Georgia', serif`
  const font = fontList.find(f => f.name === fontName)
  if (!font) return `monospace`
  return `'${font.name}', ${font.fallback}`
}
