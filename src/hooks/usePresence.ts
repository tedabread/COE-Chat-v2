import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'

type PresenceStatus = 'online' | 'idle' | 'offline'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

function getAccessTokenSync(): string | null {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith('sb-') && key.endsWith('-auth-token')) {
      try {
        const parsed = JSON.parse(localStorage.getItem(key)!)
        return parsed?.access_token ?? null
      } catch {
        return null
      }
    }
  }
  return null
}

function fireGoOfflineKeepalive() {
  const token = getAccessTokenSync()
  if (!token) return
  fetch(`${supabaseUrl}/rest/v1/rpc/go_offline`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({}),
    keepalive: true,
  })
}

export function usePresence(userId: string | undefined) {
  const [userStatuses, setUserStatuses] = useState<Record<string, PresenceStatus>>({})
  const queryFnRef = useRef<(() => Promise<void>) | undefined>(undefined)

  useEffect(() => {
    if (!userId) return

    const queryStatuses = async () => {
      const { data } = await supabase.from('profiles').select('id, last_seen')
      if (!data) { console.warn('[presence] query returned no data'); return }
      const cutoff = Date.now()
      const statuses: Record<string, PresenceStatus> = {}
      for (const p of data) {
        if (p.last_seen) {
          const diff = cutoff - new Date(p.last_seen).getTime()
          statuses[p.id] = diff < 60_000 ? 'online' : diff < 120_000 ? 'idle' : 'offline'
        }
      }
      setUserStatuses(statuses)
    }

    const updateLastSeen = () => {
      supabase.rpc('update_last_seen').then(({ error }) => {
        if (error) console.warn('[presence] rpc error:', error)
      })
    }

    queryFnRef.current = queryStatuses

    ;(async () => {
      try {
        if (document.hasFocus()) {
          const { error } = await supabase.rpc('update_last_seen')
          if (error) console.warn('[presence] initial rpc error:', error)
        }
      } catch (e) {
        console.warn('[presence] initial sync error:', e)
      }
      await queryStatuses()
    })()

    // Heartbeat — update last_seen every 30s while the tab is visible.
    // Skipped when hidden so the idle state persists.
    const heartbeat = setInterval(() => {
      if (!document.hidden) updateLastSeen()
    }, 30_000)

    const poll = setInterval(queryStatuses, 5_000)

    // ── visibilitychange ──────────────────────────────────────
    // Tab hidden  → set_idle (last_seen = 90s ago → idle threshold)
    // Tab visible → restore online
    const handleVisibility = () => {
      if (document.hidden) {
        supabase.rpc('set_idle').then(({ error }) => {
          if (error) console.warn('[presence] set_idle error:', error)
        })
      } else {
        updateLastSeen()
      }
    }

    const handleFocus = () => {
      updateLastSeen()
      queryStatuses()
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('beforeunload', fireGoOfflineKeepalive)

    return () => {
      clearInterval(heartbeat)
      clearInterval(poll)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('beforeunload', fireGoOfflineKeepalive)
      queryFnRef.current = undefined
    }
  }, [userId])

  return { userStatuses, refreshStatuses: () => queryFnRef.current?.() }
}
