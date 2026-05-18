import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

const logs: string[] = []

function log(...args: unknown[]) {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ')
  logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`)
  if (logs.length > 200) logs.splice(0, 50)
}

const origError = console.error
const origLog = console.log
const origWarn = console.warn

console.error = (...args) => { origError(...args); log('ERROR:', ...args) }
console.log = (...args) => { origLog(...args); log('LOG:', ...args) }
console.warn = (...args) => { origWarn(...args); log('WARN:', ...args) }

log('Debug console loaded — Ctrl+Shift+P to toggle')

window.onerror = (_msg, _url, _line, _col, err) => {
  log('UNCAUGHT:', err?.message ?? String(_msg))
}

window.onunhandledrejection = (e) => {
  log('PROMISE REJECTION:', e.reason?.message ?? String(e.reason))
}

export function DebugConsole() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<string[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const autoScroll = useRef(true)

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyP') {
        e.preventDefault()
        e.stopPropagation()
        setOpen(v => !v)
      }
    }
    document.addEventListener('keydown', handler, true)
    return () => document.removeEventListener('keydown', handler, true)
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      setItems([...logs])
    }, 500)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!open || !autoScroll.current) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [items, open])

  function handleScroll() {
    const el = scrollRef.current
    if (!el) return
    autoScroll.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  if (!open) return null

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999,
        background: '#11111b', color: '#a6e3a1', fontFamily: 'GoogleSansCodeNF, monospace',
        fontSize: 11, maxHeight: '40vh', overflowY: 'auto',
        borderTop: '2px solid #f38ba8', padding: 8,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <strong style={{ color: '#f38ba8' }}><Icon name="ellipsis" /> Console  (Ctrl+Shift+P to close)</strong>
        <button
          onClick={() => setOpen(false)}
          style={{ background: 'none', border: 'none', color: '#f38ba8', cursor: 'pointer', fontSize: 14 }}
        >
          <Icon name="close" />
        </button>
      </div>
      {items.map((line, i) => (
        <div key={i} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {line}
        </div>
      ))}
    </div>
  )
}
