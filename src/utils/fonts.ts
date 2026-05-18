export interface FontOption {
  name: string
  category: 'sans-serif' | 'serif' | 'monospace'
  googleFont: string | null
  fallback: string
}

export const fontList: FontOption[] = [
  { name: 'GoogleSansCodeNF', category: 'monospace', googleFont: null, fallback: 'monospace' },
  { name: 'Geologica', category: 'sans-serif', googleFont: 'Geologica:400,600,700', fallback: 'sans-serif' },
  { name: 'Inter', category: 'sans-serif', googleFont: 'Inter:400,600,700', fallback: 'sans-serif' },
  { name: 'DM Sans', category: 'sans-serif', googleFont: 'DM+Sans:400,600,700', fallback: 'sans-serif' },
  { name: 'Manrope', category: 'sans-serif', googleFont: 'Manrope:400,600,700', fallback: 'sans-serif' },
  { name: 'Space Grotesk', category: 'sans-serif', googleFont: 'Space+Grotesk:400,600,700', fallback: 'sans-serif' },
  { name: 'Source Serif 4', category: 'serif', googleFont: 'Source+Serif+4:400,600,700', fallback: 'serif' },
  { name: 'Century', category: 'serif', googleFont: null, fallback: 'serif' },
  { name: 'Playfair Display', category: 'serif', googleFont: 'Playfair+Display:400,600,700', fallback: 'serif' },
  { name: 'Lora', category: 'serif', googleFont: 'Lora:400,600,700', fallback: 'serif' },
  { name: 'Merriweather', category: 'serif', googleFont: 'Merriweather:400,700', fallback: 'serif' },
  { name: 'JetBrains Mono', category: 'monospace', googleFont: 'JetBrains+Mono:400,600,700', fallback: 'monospace' },
  { name: 'Fira Code', category: 'monospace', googleFont: 'Fira+Code:400,600,700', fallback: 'monospace' },
  { name: 'IBM Plex Mono', category: 'monospace', googleFont: 'IBM+Plex+Mono:400,600,700', fallback: 'monospace' },
]

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
