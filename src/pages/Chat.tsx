import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useCall } from '../hooks/useCall'
import { ChatView } from '../components/ChatView'
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
    <div className="home-layout">
      <main className="main-content">
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
      </main>
    </div>
  )
}
