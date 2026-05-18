import { useEffect, useState, useRef } from 'react'
import { supabase } from '../supabaseClient'

type PresenceStatus = 'online' | 'idle' | 'offline'

export function usePresence(userId: string | undefined) {
  const [userStatuses, setUserStatuses] = useState<Record<string, PresenceStatus>>({})
  const lastStatusRef = useRef<PresenceStatus>('idle')
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  useEffect(() => {
    if (!userId) return

    const initialStatus: PresenceStatus = document.hasFocus() ? 'online' : 'idle'
    lastStatusRef.current = initialStatus

    const channel = supabase.channel('online-users', {
      config: {
        presence: {
          key: userId,
        },
      },
    })

    channelRef.current = channel

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState() as Record<string, { status: PresenceStatus }[]>
        const statuses: Record<string, PresenceStatus> = {}
        for (const [id, presences] of Object.entries(state)) {
          if (presences.length > 0) {
            statuses[id] = presences[0].status
          }
        }
        setUserStatuses(statuses)
      })
      .subscribe(async (subStatus) => {
        if (subStatus === 'SUBSCRIBED') {
          await channel.track({ status: initialStatus, user_id: userId })
        }
      })

    const handleFocus = () => {
      if (lastStatusRef.current !== 'online') {
        lastStatusRef.current = 'online'
        channel.track({ status: 'online', user_id: userId })
      }
    }

    const handleBlur = () => {
      if (lastStatusRef.current !== 'idle') {
        lastStatusRef.current = 'idle'
        channel.track({ status: 'idle', user_id: userId })
      }
    }

    window.addEventListener('focus', handleFocus)
    window.addEventListener('blur', handleBlur)

    return () => {
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('blur', handleBlur)
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [userId])

  return { userStatuses }
}
