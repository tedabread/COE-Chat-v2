import { useRef, useEffect, useState } from 'react'
import { emojiCategories } from '../utils/emojis'
import { getOpenmojiUrl } from '../utils/openmoji'
import { fetchCountries, getFlagUrl, type Country } from '../utils/flags'

interface Props {
  onEmoji: (emoji: string) => void
  onClose: () => void
}

export function EmojiPicker({ onEmoji, onClose }: Props) {
  const [tab, setTab] = useState(emojiCategories[0]?.id || '')
  const [countries, setCountries] = useState<Country[]>([])
  const [countryTab, setCountryTab] = useState('all')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchCountries().then(setCountries)
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  const continents = [...new Set(countries.map(c => c.continent).filter(Boolean))]
  const filtered = countryTab === 'all' ? countries : countries.filter(c => c.continent === countryTab)

  return (
    <div className="emoji-picker" ref={ref}>
      <div className="emoji-tabs">
        {emojiCategories.map(cat => (
          <button
            key={cat.id}
            className={`emoji-tab ${tab === cat.id ? 'active' : ''}`}
            onClick={() => setTab(cat.id)}
            title={cat.id}
          >
            {cat.id === 'flags' ? cat.icon : (
              <img src={getOpenmojiUrl(cat.icon)} alt="" className="emoji-tab-img" />
            )}
          </button>
        ))}
      </div>

      {tab === 'flags' ? (
        <div className="emoji-flags">
          <div className="flag-continents">
            <button className={`flag-cont-btn ${countryTab === 'all' ? 'active' : ''}`} onClick={() => setCountryTab('all')}>All</button>
            {continents.map(cont => (
              <button key={cont} className={`flag-cont-btn ${countryTab === cont ? 'active' : ''}`} onClick={() => setCountryTab(cont)}>
                {cont}
              </button>
            ))}
          </div>
          <div className="flag-grid">
            {filtered.map(c => (
              <button key={c.name} className="flag-btn" onClick={() => onEmoji(`:flag-${c.name.toLowerCase().replace(/\s+/g, '-')}:`)} title={c.name}>
                <img src={getFlagUrl(c.name)} alt={c.name} className="flag-img" loading="lazy" onError={ev => { (ev.target as HTMLImageElement).style.display = 'none' }} />
              </button>
            ))}
            {filtered.length === 0 && <span className="flag-loading">No flags loaded</span>}
          </div>
        </div>
      ) : (
        <div className="emoji-grid">
          {emojiCategories.find(c => c.id === tab)?.emojis.map(e => (
            <button key={e} className="emoji-item" onClick={() => onEmoji(e)}>
              <img src={getOpenmojiUrl(e)} alt={e} className="emoji-item-img" loading="lazy" onError={ev => { (ev.target as HTMLImageElement).style.display = 'none' }} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
