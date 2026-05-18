const FLAG_CDN = 'https://teorainneacha.vercel.app/bratai'

export interface Country {
  name: string
  continent: string
}

let countriesCache: Country[] | null = null

export async function fetchCountries(): Promise<Country[]> {
  if (countriesCache) return countriesCache
  try {
    const res = await fetch(`${FLAG_CDN}/countries.json`)
    if (!res.ok) throw new Error('Not found')
    const data: Record<string, string[]> = await res.json()
    const result: Country[] = []
    for (const [continent, names] of Object.entries(data)) {
      for (const name of names) {
        result.push({ name, continent })
      }
    }
    countriesCache = result
    return result
  } catch {
    countriesCache = []
    return countriesCache
  }
}

export function getFlagUrl(countryName: string): string {
  return `${FLAG_CDN}/${encodeURIComponent(countryName.toLowerCase().replace(/\s+/g, '-'))}.svg`
}

export function getFlagEmojiFallback(_countryName: string): string {
  return ''
}
