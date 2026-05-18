import { useFriends } from '../hooks/useFriends'
import { Icon } from './Icon'

interface Props {
  userId: string | undefined
  onFriendListChange?: () => void
}

export function FriendRequests({ userId, onFriendListChange }: Props) {
  const { requests, acceptRequest, rejectRequest } = useFriends(userId)

  async function handleAccept(id: number) {
    await acceptRequest(id)
    onFriendListChange?.()
  }

  async function handleReject(id: number) {
    await rejectRequest(id)
    onFriendListChange?.()
  }

  if (requests.length === 0) return null

  return (
    <div className="friend-requests">
      <h3><Icon name="friend" /> Friend Requests</h3>
      {requests.map((req) => (
        <div key={req.id} className="request-item">
          <span><Icon name="user" /> {req.sender?.display_name || req.sender?.username}</span>
          <div className="request-actions">
            <button onClick={() => handleAccept(req.id)}><Icon name="check" /></button>
            <button onClick={() => handleReject(req.id)}><Icon name="close" /></button>
          </div>
        </div>
      ))}
    </div>
  )
}
