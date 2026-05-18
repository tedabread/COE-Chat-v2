import { useState } from 'react'
import { useFriends } from '../hooks/useFriends'
import { Icon } from './Icon'

interface Props {
  userId: string | undefined
}

export function FriendSearch({ userId }: Props) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const { sendRequest } = useFriends(userId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const match = query.match(/^(.+)#(\d+)$/)
    if (!match) {
      setStatus('Format: username#tag (e.g. user#1234)')
      return
    }
    const [, username, uid] = match
    setStatus('Sending...')
    const { error } = await sendRequest(username, uid)
    if (error) {
      setStatus(error.message)
    } else {
      setStatus('Friend request sent!')
      setQuery('')
    }
  }

  return (
    <div className="friend-search">
      <form onSubmit={handleSubmit}>
        <Icon name="search" />
        <input
          type="text"
          placeholder="username#tag"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit"><Icon name="plus" /></button>
      </form>
      {status && <span className="status">{status}</span>}
    </div>
  )
}
