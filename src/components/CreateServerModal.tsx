import { useState } from 'react'
import { Icon } from './Icon'

interface Props {
  onClose: () => void
  onCreate: (name: string) => void
}

export function CreateServerModal({ onClose, onCreate }: Props) {
  const [name, setName] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    onCreate(name.trim())
    onClose()
  }

  return (
    <div className="settings-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="settings-modal" style={{ maxWidth: 400 }}>
        <div className="settings-header">
          <h2>Create Server</h2>
          <button className="settings-close-btn" onClick={onClose}><Icon name="close" /></button>
        </div>
        <form onSubmit={handleSubmit} className="create-server-form">
          <label>Server Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Enter server name"
            required
            autoFocus
          />
          <button type="submit" disabled={!name.trim()}>Create</button>
        </form>
      </div>
    </div>
  )
}
