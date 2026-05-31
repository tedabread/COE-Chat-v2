import { useState, useRef, useEffect } from 'react'

interface Option {
  value: string
  label: string
}

interface Props {
  value: string
  onChange: (value: string) => void
  options: Option[]
  placeholder?: string
  className?: string
}

export function Select({ value, onChange, options, placeholder, className }: Props) {
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

  const selected = options.find(o => o.value === value)

  return (
    <div className={`font-select ${className || ''}`} ref={ref}>
      <button className="font-select-trigger" onClick={() => setOpen(!open)}>
        <span>{selected?.label || placeholder || value}</span>
        <span className="font-select-arrow">▾</span>
      </button>
      {open && (
        <div className="font-select-dropdown">
          {options.map(o => (
            <button
              key={o.value}
              className={`font-select-option ${o.value === value ? 'active' : ''}`}
              onClick={() => { onChange(o.value); setOpen(false) }}
            >
              <span>{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
