import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useMessages } from '../hooks/useMessages'
import type { Profile } from '../types'

export function ChatPage() {
  const { id } = useParams<{ id: string }>()
  const chatId = id ? Number(id) : undefined
  const { user, signOut } = useAuth()
  const { messages, loading, sendMessage } = useMessages(chatId)
  const navigate = useNavigate()
  const [otherUser, setOtherUser] = useState<Profile | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!chatId || !user) return
    fetchParticipants()
    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
      .then(({ data }) => { if (data) setProfile(data) })
  }, [chatId, user])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function fetchParticipants() {
    try {
      const { data } = await supabase
        .from('chat_members')
        .select('user_id')
        .eq('chat_id', chatId)

      if (!data) return
      const otherId = data.find((m) => m.user_id !== user!.id)?.user_id
      if (!otherId) return

      const { data: other } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', otherId)
        .single()

      if (other) setOtherUser(other)
    } catch (err) {
      console.error('fetchParticipants error:', err)
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim()) return
    await sendMessage(input.trim())
    setInput('')
  }

  if (!chatId) return <div>Invalid chat</div>

  return (
    <div className="chat-layout">
      <header className="chat-header">
        <button className="back-btn" onClick={() => navigate('/')}>←</button>
        <div className="chat-header-info">
          <h2>{otherUser?.username}</h2>
          <span className="uid-badge">#{otherUser?.uid}</span>
        </div>
        <div className="chat-header-user">
          <span>{profile?.username}</span>
          <button onClick={signOut}>Logout</button>
        </div>
      </header>

      <div className="messages-container">
        {loading ? (
          <div className="loading">Loading messages...</div>
        ) : messages.length === 0 ? (
          <div className="empty-messages">No messages yet. Say something!</div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.sender_id === user?.id
            return (
              <div
                key={msg.id}
                className={`message ${isMine ? 'message-mine' : 'message-theirs'}`}
              >
                <div className="message-body">
                  <p>{msg.content}</p>
                  <span className="message-time">
                    {new Date(msg.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form className="message-input" onSubmit={handleSend}>
        <input
          type="text"
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit">Send</button>
      </form>
    </div>
  )
}
