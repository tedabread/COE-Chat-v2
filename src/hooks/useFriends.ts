import { useEffect, useState, useRef } from 'react'
import { supabase } from '../supabaseClient'
import type { Profile, FriendRequest } from '../types'

export function useFriends(userId: string | undefined) {
  const [friends, setFriends] = useState<Profile[]>([])
  const [requests, setRequests] = useState<FriendRequest[]>([])
  const [loading, setLoading] = useState(true)
  const fetchIdRef = useRef(0)

  useEffect(() => {
    if (!userId) return
    fetchFriends()
    fetchRequests()
  }, [userId])

  async function fetchFriends() {
    const id = ++fetchIdRef.current
    const { data } = await supabase
      .from('friend_requests')
      .select('sender_id, receiver_id')
      .eq('status', 'accepted')
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)

    if (!data) { setLoading(false); return }

    const friendIds = data.map((r) =>
      r.sender_id === userId ? r.receiver_id : r.sender_id
    )

    if (friendIds.length === 0) { setFriends([]); setLoading(false); return }

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, uid, avatar_url, display_name, name_font, name_color, banner_color, status, message_font, role, admin_outline_color, created_at')
      .in('id', friendIds)

    if (id !== fetchIdRef.current) return
    const sorted = (profiles ?? []).sort((a, b) =>
      (a.display_name || a.username || '').localeCompare(b.display_name || b.username || '')
    )
    setFriends(sorted)
    setLoading(false)
  }

  async function fetchRequests() {
    const { data } = await supabase
      .from('friend_requests')
      .select('*, sender:sender_id(id, username, uid), receiver:receiver_id(id, username, uid)')
      .eq('receiver_id', userId)
      .eq('status', 'pending')

    if (data) setRequests(data as unknown as FriendRequest[])
  }

  async function sendRequest(username: string, uid: string) {
    const { data: target } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .eq('uid', uid)
      .single()

    if (!target) return { error: { message: 'User not found' } }

    return supabase
      .from('friend_requests')
      .upsert(
        { sender_id: userId, receiver_id: target.id, status: 'pending' },
        { onConflict: 'sender_id,receiver_id' },
      )
  }

  async function acceptRequest(requestId: number) {
    const { data: req } = await supabase
      .from('friend_requests')
      .update({ status: 'accepted' })
      .eq('id', requestId)
      .select()
      .single()

    if (req) {
      await ensureDmExists(userId!, req.sender_id === userId ? req.receiver_id : req.sender_id)
      fetchRequests()
      fetchFriends()
    }
    return { error: null }
  }

  async function rejectRequest(requestId: number) {
    const { error } = await supabase
      .from('friend_requests')
      .update({ status: 'rejected' })
      .eq('id', requestId)

    if (!error) fetchRequests()
    return { error }
  }

  async function removeFriend(friendId: string) {
    await supabase
      .from('friend_requests')
      .delete()
      .eq('status', 'accepted')
      .or(`and(sender_id.eq.${userId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${userId})`)
    // Delete the shared DM chat + messages for both users
    await supabase.rpc('delete_dm', { other_user: friendId })
    fetchFriends()
  }

  return { friends, requests, loading, sendRequest, acceptRequest, rejectRequest, removeFriend, refetch: fetchFriends, refetchRequests: fetchRequests }
}

export async function ensureDmExists(userId: string, otherId: string): Promise<number | null> {
  console.log('ensureDmExists called', { userId, otherId })

  const { data, error } = await supabase
    .rpc('find_or_create_dm', { user_a: userId, user_b: otherId })

  console.log('find_or_create_dm result:', { data, error })

  if (error) {
    console.error('find_or_create_dm failed:', error)
    return null
  }

  const chatId = data as number
  console.log('DM ready, chatId:', chatId)
  return chatId
}
