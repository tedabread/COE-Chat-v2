import { useEffect, useRef, useCallback, useState } from 'react'
import { supabase } from '../supabaseClient'

const TYPING_TIMEOUT = 3000
const TYPING_HEARTBEAT = 2000

export function useTyping(chatId: number | undefined, userId: string | undefined, prefix: string = 'chat') {
  const [typingUserIds, setTypingUserIds] = useState<string[]>([])
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!chatId || !userId) return

    const channel = supabase.channel(`${prefix}-typing-${chatId}`, {
      config: { broadcast: { ack: false, self: false } },
    })

    channelRef.current = channel

    channel
      .on('broadcast', { event: 'typing' }, (payload: { payload: { userId: string } }) => {
        const { userId: typerId } = payload.payload
        if (typerId === userId) return

        const existing = timeoutsRef.current.get(typerId)
        if (existing) clearTimeout(existing)

        setTypingUserIds(prev => prev.includes(typerId) ? prev : [...prev, typerId])

        const timeout = setTimeout(() => {
          setTypingUserIds(prev => prev.filter(id => id !== typerId))
          timeoutsRef.current.delete(typerId)
        }, TYPING_TIMEOUT)
        timeoutsRef.current.set(typerId, timeout)
      })
      .subscribe()

    return () => {
      for (const t of timeoutsRef.current.values()) clearTimeout(t)
      timeoutsRef.current.clear()
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      heartbeatRef.current = null
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [chatId, userId])

  const setTyping = useCallback((typing: boolean) => {
    if (!channelRef.current) return

    if (typing) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId },
      })
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      heartbeatRef.current = setInterval(() => {
        channelRef.current?.send({
          type: 'broadcast',
          event: 'typing',
          payload: { userId },
        })
      }, TYPING_HEARTBEAT)
    } else {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current)
        heartbeatRef.current = null
      }
    }
  }, [userId])

  return { typingUserIds, setTyping }
}
