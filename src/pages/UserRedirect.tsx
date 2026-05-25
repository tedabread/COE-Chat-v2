import { useEffect, useState } from 'react'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { ensureDmExists } from '../hooks/useFriends'
import { isServerMember, joinServer } from '../hooks/useServers'
import type { Profile } from '../types'
import { signalAppReady } from '../appReady'

export function UserRedirect() {
  const params = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState<string | null>(null)

  const isInvite = location.pathname.startsWith('/invite/')
  const identifier = params.identifier || params.serverId

  useEffect(() => {
    if (!user || !identifier) return
    signalAppReady()

    if (isInvite) {
      const sid = Number(identifier)
      if (!sid) { setError('Invalid invite link'); return }

      supabase.from('servers').select('id').eq('id', sid).single().then(async ({ data }) => {
        if (!data) { setError('Server not found'); return }
        const member = await isServerMember(sid, user.id)
        if (!member) {
          const joined = await joinServer(sid, user.id)
          if (!joined) { setError('Could not join server'); return }
        }
        navigate(`/server/${sid}`, { replace: true })
      })
      return
    }

    const isNumeric = /^\d+$/.test(identifier)
    const query = isNumeric
      ? supabase.from('profiles').select('*').eq('uid', identifier).single()
      : supabase.from('profiles').select('*').eq('username', identifier).single()

    query.then(async ({ data, error: err }) => {
      if (err || !data) {
        setError(`User "${identifier}" not found`)
        return
      }

      const found = data as Profile

      if (found.id === user.id) {
        setError('That\'s you!')
        return
      }

      const chatId = await ensureDmExists(user.id, found.id)
      if (chatId) {
        navigate(`/chat/${chatId}`, { replace: true })
      } else {
        setError('Could not create conversation')
      }
    })
  }, [identifier, user, navigate, isInvite])

  if (error) {
    return (
      <div className="loading-screen" style={{ flexDirection: 'column', gap: '1rem' }}>
        <p>{error}</p>
        <Link to="/" style={{ color: 'var(--blue)' }}>Go home</Link>
      </div>
    )
  }

  return <div className="loading-screen">{isInvite ? 'Joining server...' : 'Looking up user...'}</div>
}
