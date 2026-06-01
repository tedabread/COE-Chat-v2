import type { PostgrestError } from '@supabase/supabase-js'
import type { FriendRequest } from '../types'
import { Icon } from './Icon'

interface Props {
  requests: FriendRequest[]
  onAccept: (id: number) => Promise<{ error: null }>
  onReject: (id: number) => Promise<{ error: PostgrestError | null }>
}

export function FriendRequests({ requests, onAccept, onReject }: Props) {
  if (requests.length === 0) return null

  return (
    <div className="friend-requests">
      <h3><Icon name="friend" /> Friend Requests</h3>
      {requests.map((req) => (
        <div key={req.id} className="request-item">
          <span><Icon name="user" /> {req.sender?.display_name || req.sender?.username}</span>
          <div className="request-actions">
            <button onClick={() => onAccept(req.id)}><Icon name="check" /></button>
            <button onClick={() => onReject(req.id)}><Icon name="close" /></button>
          </div>
        </div>
      ))}
    </div>
  )
}
