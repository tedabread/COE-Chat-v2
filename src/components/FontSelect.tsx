import { useState, useRef, useEffect } from 'react'
import { fontList, getFontFamily, loadFont } from '../utils/fonts'

interface Props {
  value: string
  onChange: (value: string) => void
}

export function FontSelect({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const selected = fontList.find(f => f.name === value)

  return (
    <div className="font-select" ref={ref}>
      <button className="font-select-trigger" onClick={() => setOpen(!open)}>
        <span style={{ fontFamily: selected ? getFontFamily(selected.name) : undefined }}>
          {selected?.name || value}
        </span>
        <span className="font-select-arrow">▾</span>
      </button>
      {open && (
        <div className="font-select-dropdown">
          {fontList.map(f => (
            <button
              key={f.name}
              className={`font-select-option ${f.name === value ? 'active' : ''}`}
              onClick={() => { onChange(f.name); loadFont(f.name); setOpen(false) }}
            >
              <span style={{ fontFamily: getFontFamily(f.name) }}>
                {f.name}
              </span>
              <span className="font-select-category">{f.category}</span>
              <span className="font-select-tooltip">{f.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
