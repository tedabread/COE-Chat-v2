import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import type { Server } from '../types'
import { Icon } from './Icon'

const INVITE_RE = /(?:https?:\/\/[^\s]*)?\/invite\/(\d+)/g

interface Props {
  content: string
}

interface PreviewData {
  serverId: number
  server: Server | null
  loading: boolean
}

function InviteCard({ serverId }: { serverId: number }) {
  const [data, setData] = useState<PreviewData>({ serverId, server: null, loading: true })

  useEffect(() => {
    supabase.from('servers').select('*').eq('id', serverId).single().then(({ data }) => {
      setData({ serverId, server: data, loading: false })
    })
  }, [serverId])

  if (data.loading) {
    return (
      <div className="invite-preview">
        <div className="invite-preview-info">
          <div className="invite-preview-name" style={{ color: 'var(--overlay0)' }}>Loading server...</div>
        </div>
      </div>
    )
  }

  if (!data.server) {
    return (
      <div className="invite-preview">
        <div className="invite-preview-info">
          <div className="invite-preview-name" style={{ color: 'var(--red)' }}>Server not found</div>
        </div>
      </div>
    )
  }

  const s = data.server
  return (
    <div className="invite-preview">
      <div className="invite-preview-icon" style={{ backgroundColor: s.banner_color || 'var(--surface1)' }}>
        {s.icon_url ? <img src={s.icon_url} alt="" /> : <Icon name="message" />}
      </div>
      <div className="invite-preview-info">
        <div className="invite-preview-name">{s.name}</div>
        <div className="invite-preview-meta">Server invite</div>
      </div>
      <Link to={`/invite/${s.id}`} className="invite-preview-btn">
        Join
      </Link>
    </div>
  )
}

export function InvitePreview({ content }: Props) {
  const matches = Array.from(content.matchAll(INVITE_RE))
  if (matches.length === 0) return null

  const seen = new Set<number>()
  const serverIds = matches.map(m => Number(m[1])).filter(id => {
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })

  return (
    <>
      {serverIds.map(id => (
        <InviteCard key={id} serverId={id} />
      ))}
    </>
  )
}
