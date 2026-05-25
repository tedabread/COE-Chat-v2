import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import type { Message } from '../types'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

const C = {
  ch: 'color:#89b4fa;font-weight:bold',
  ok: 'color:#a6e3a1',
  err: 'color:#f38ba8;font-weight:bold',
  wrn: 'color:#f9e2af',
  info: 'color:#cdd6f4',
  dim: 'color:#6c7086',
  sub: 'color:#cba6f7',
  act: 'color:#fab387',
}

export function useChannelMessages(channelId: number | undefined) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!channelId) return
    console.log(`%c[channel]%c mount id=%d`, C.ch, C.info, channelId)
    setLoading(true)
    fetchMessages()

    const channel = supabase
      .channel(`channel-msgs:${channelId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `channel_id=eq.${channelId}`,
        },
        async (payload: RealtimePostgresChangesPayload<{ [key: string]: unknown }>) => {
          const newMsg = payload.new as Message
          console.log(`%c[realtime]%c INSERT id=%d`, C.sub, C.info, newMsg.id)
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', newMsg.sender_id)
            .single()
          setMessages((prev) => {
            const opt = prev.find(m => m.id < 0 && m.sender_id === newMsg.sender_id && m.channel_id === newMsg.channel_id)
            if (opt) {
              console.log(`%c[realtime]%c replace optimistic %d -> %d`, C.sub, C.ok, opt.id, newMsg.id)
              return prev.map(m => m.id === opt.id ? { ...newMsg, profile: profile ?? undefined } : m)
            }
            console.log(`%c[realtime]%c new msg %d`, C.sub, C.wrn, newMsg.id)
            return [...prev, { ...newMsg, profile: profile ?? undefined }]
          })
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `channel_id=eq.${channelId}`,
        },
        (payload: RealtimePostgresChangesPayload<{ [key: string]: unknown }>) => {
          const updated = payload.new as Message
          console.log(`%c[realtime]%c UPDATE id=%d`, C.sub, C.act, updated.id)
          setMessages(prev => prev.map(m => m.id === updated.id ? { ...m, content: updated.content, edited: updated.edited, updated_at: updated.updated_at } : m))
        }
      )
      .subscribe()

    return () => {
      console.log(`%c[channel]%c unmount id=%d`, C.ch, C.err, channelId)
      supabase.removeChannel(channel)
    }
  }, [channelId])

  async function fetchMessages() {
    if (!channelId) return
    console.log(`%c[fetch]%c channel=%d`, C.ok, C.info, channelId)
    const { data, error } = await supabase
      .from('messages')
      .select('*, profile:profiles(*)')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true })
    if (error) {
      console.log(`%c[fetch]%c ERROR:`, C.err, C.dim, error)
      throw error
    }
    if (data) setMessages(data)
    console.log(`%c[fetch]%c %d messages`, C.ok, C.info, data?.length ?? 0)
    setLoading(false)
  }

  async function uploadFile(file: File): Promise<{ url: string; name: string; type: string; size: number } | null> {
    if (!channelId) return null
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const ext = file.name.split('.').pop() || 'bin'
    const path = `channels/${channelId}/${user.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
    const { error } = await supabase.storage.from('chat-files').upload(path, file, {
      contentType: file.type,
      cacheControl: '3600',
    })
    if (error) throw error
    const { data: { publicUrl } } = supabase.storage.from('chat-files').getPublicUrl(path)
    return { url: publicUrl, name: file.name, type: file.type, size: file.size }
  }

  async function sendMessage(content: string, file?: File, replyTo?: number | null) {
    if (!channelId) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    let fileInfo: { url: string; name: string; type: string; size: number } | null = null
    if (file) fileInfo = await uploadFile(file)

    const { data: selfProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    const tempId = -(Date.now() + Math.random())
    const optimistic: Message = {
      id: tempId,
      chat_id: 0,
      channel_id: channelId,
      sender_id: user.id,
      content: content || '',
      file_url: fileInfo?.url || null,
      file_name: fileInfo?.name || null,
      file_type: fileInfo?.type || null,
      file_size: fileInfo?.size || null,
      reply_to: replyTo ?? null,
      edited: false,
      updated_at: null,
      created_at: new Date().toISOString(),
      profile: selfProfile ?? undefined,
    }
    console.log(`%c[send]%c optimistic id=%d`, C.act, C.dim, tempId)
    setMessages(prev => [...prev, optimistic])

    const { error } = await supabase.from('messages').insert({
      channel_id: channelId,
      sender_id: user.id,
      content: content || '',
      file_url: fileInfo?.url || null,
      file_name: fileInfo?.name || null,
      file_type: fileInfo?.type || null,
      file_size: fileInfo?.size || null,
      reply_to: replyTo ?? null,
    })
    if (error) console.log(`%c[send]%c INSERT ERROR:`, C.act, C.err, error)
    else console.log(`%c[send]%c INSERT ok`, C.act, C.ok)
  }

  async function editMessage(messageId: number, newContent: string) {
    console.log(`%c[edit]%c id=%d`, C.act, C.info, messageId)
    const { error } = await supabase
      .from('messages')
      .update({ content: newContent, edited: true, updated_at: new Date().toISOString() })
      .eq('id', messageId)
    if (error) console.log(`%c[edit]%c ERROR:`, C.act, C.err, error)
  }

  async function deleteMessage(messageId: number) {
    console.log(`%c[delete]%c id=%d`, C.err, C.info, messageId)
    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('id', messageId)
    if (error) console.log(`%c[delete]%c ERROR:`, C.act, C.err, error)
    else setMessages(prev => prev.filter(m => m.id !== messageId))
  }

  return { messages, loading, sendMessage, editMessage, deleteMessage }
}
