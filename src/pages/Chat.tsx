import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useCall } from '../hooks/useCall'
import { ChatView } from '../components/ChatView'
import { Icon } from '../components/Icon'
import type { Profile } from '../types'

export function ChatPage() {
  const { id } = useParams<{ id: string }>()
  const chatId = id ? Number(id) : undefined
  const { user } = useAuth()
  const navigate = useNavigate()
  const [partner, setPartner] = useState<Profile | null>(null)

  const call = useCall(user?.id, chatId, partner?.id)

  useEffect(() => {
    if (!chatId || !user) return
    ;(async () => {
      const { data } = await supabase
        .from('chat_members')
        .select('user_id')
        .eq('chat_id', chatId)
      if (!data) return
      const otherId = data.find((m) => m.user_id !== user.id)?.user_id
      if (!otherId) return
      const { data: other } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', otherId)
        .single()
      if (other) setPartner(other)
    })()
  }, [chatId, user])

  if (!chatId) return <div className="loading-screen">Invalid chat</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        padding: '0.5rem 1rem', borderBottom: '1px solid var(--surface0)',
        background: 'var(--mantle)', flexShrink: 0,
      }}>
        <button
          onClick={() => navigate('/')}
          style={{
            background: 'var(--surface0)', border: 'none',
            color: 'var(--overlay0)', cursor: 'pointer',
            fontSize: '0.9rem', width: '1.8rem', height: '1.8rem',
            borderRadius: '6px', display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Icon name="back" />
        </button>
        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
          {partner?.display_name || partner?.username || 'Chat'}
        </span>
        <span style={{ color: 'var(--overlay0)', fontSize: '0.8rem' }}>
          #{partner?.uid}
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {chatId && (
          <ChatView
            chatId={chatId}
            partner={partner}
            onClose={() => navigate('/')}
            callStatus={call.status}
            incomingCallerId={call.incomingCallerId}
            elapsed={call.elapsed}
            startCall={call.startCall}
            acceptCall={call.acceptCall}
            declineCall={call.declineCall}
            endCall={call.endCall}
          />
        )}
      </div>
    </div>
  )
}
