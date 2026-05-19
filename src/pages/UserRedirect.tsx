import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { ensureDmExists } from '../hooks/useFriends'
import type { Profile } from '../types'

export function UserRedirect() {
  const { identifier } = useParams<{ identifier: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!identifier || !user) return

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
  }, [identifier, user, navigate])

  if (error) {
    return (
      <div className="loading-screen" style={{ flexDirection: 'column', gap: '1rem' }}>
        <p>{error}</p>
        <Link to="/" style={{ color: 'var(--blue)' }}>Go home</Link>
      </div>
    )
  }

  return <div className="loading-screen">Looking up user...</div>
}
