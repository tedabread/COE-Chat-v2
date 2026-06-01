import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../supabaseClient'

interface ChatInfoRow {
  chat_id: number
  other_user_id: string
  unread_count: number
}

interface ChannelUnreadRow {
  channel_id: number
  unread_count: number
}

export function useUnread(userId: string | undefined) {
  const [dmUnreads, setDmUnreads] = useState<Record<string, number>>({})
  const [channelUnreads, setChannelUnreads] = useState<Record<number, number>>({})
  const [chatIdForFriend, setChatIdForFriend] = useState<Record<string, number>>({})
  const fetchIdRef = useRef(0)

  const refetch = useCallback(async () => {
    const id = ++fetchIdRef.current
    if (!userId) return

    const { data: dmData, error: dmErr } = await supabase.rpc('get_user_chat_info', { p_user_id: userId })
    if (dmErr) console.error('[unread] get_user_chat_info failed:', dmErr)
    if (dmData && id === fetchIdRef.current) {
      const dmMap: Record<string, number> = {}
      const chatMap: Record<string, number> = {}
      for (const row of dmData as ChatInfoRow[]) {
        dmMap[row.other_user_id] = Number(row.unread_count)
        chatMap[row.other_user_id] = row.chat_id
      }
      setDmUnreads(dmMap)
      setChatIdForFriend(chatMap)
    }

    const { data: chData, error: chErr } = await supabase.rpc('get_all_channel_unreads', { p_user_id: userId })
    if (chErr) console.error('[unread] get_all_channel_unreads failed:', chErr)
    if (chData && id === fetchIdRef.current) {
      const chMap: Record<number, number> = {}
      for (const row of chData as ChannelUnreadRow[]) {
        chMap[row.channel_id] = Number(row.unread_count)
      }
      setChannelUnreads(chMap)
    }
  }, [userId])

  useEffect(() => {
    if (!userId) return
    refetch()

    const channel = supabase
      .channel('unread-refresh')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => { refetch() }
      )
      .subscribe()

    const poll = setInterval(() => { refetch() }, 10_000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(poll)
    }
  }, [userId, refetch])

  async function markChatRead(chatId: number) {
    if (!userId) return
    const { data: mrData, error } = await supabase.rpc('mark_chat_read', { p_chat_id: chatId, p_user_id: userId })
    console.log('[unread] mark_chat_read result:', { chatId, userId, mrData, error })
    if (error) console.error('[unread] mark_chat_read failed:', error)
    // Also check what the DB actually has
    const { data: check } = await supabase
      .from('chat_members')
      .select('chat_id, last_read_at')
      .eq('chat_id', chatId)
      .eq('user_id', userId)
      .maybeSingle()
    console.log('[unread] chat_members check:', { chatId, check })
    refetch()
  }

  async function markChannelRead(channelId: number) {
    if (!userId) return
    const { error } = await supabase.rpc('mark_channel_read', { p_channel_id: channelId, p_user_id: userId })
    if (error) console.error('[unread] mark_channel_read failed:', error)
    refetch()
  }

  return { dmUnreads, channelUnreads, chatIdForFriend, refetch, markChatRead, markChannelRead }
}
