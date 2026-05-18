import { useEffect, useState, useRef } from 'react'
import { supabase } from '../supabaseClient'
import type { Message, Profile } from '../types'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

export function useMessages(chatId: number | undefined) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const userIdRef = useRef<string>('')

  const selfProfileRef = useRef<Profile | undefined>(undefined)

  useEffect(() => {
    if (!chatId) return

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        userIdRef.current = user.id
        supabase.from('profiles').select('*').eq('id', user.id).single().then(({ data }) => {
          if (data) selfProfileRef.current = data as Profile
        })
      }
    })

    setLoading(true)

    const timer = setTimeout(() => setLoading(false), 10000)

    fetchMessages().catch(err => {
      console.error('fetchMessages error:', err)
      setLoading(false)
    })

    const channel = supabase
      .channel(`msgs:${chatId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `chat_id=eq.${chatId}`,
        },
        async (payload: RealtimePostgresChangesPayload<{ [key: string]: unknown }>) => {
          const newMsg = payload.new as Message
          if (newMsg.sender_id === userIdRef.current) return

          const { data: profile } = await supabase
            .from('profiles')
            .select('id, username, uid, avatar_url, display_name, name_font, name_color, banner_color, status, message_font, role, admin_outline_color, created_at')
            .eq('id', newMsg.sender_id)
            .single()

          setMessages((prev) => [
            ...prev,
            { ...newMsg, profile: profile ?? undefined },
          ])
        }
      )
      .subscribe()

    return () => {
      clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [chatId])

  async function fetchMessages() {
    const { data, error } = await supabase
      .from('messages')
      .select('*, profile:profiles(id, username, uid, avatar_url, display_name, name_font, name_color, banner_color, status, message_font, role, admin_outline_color)')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true })

    if (error) throw error
    if (data) setMessages(data)
    setLoading(false)
  }

  async function uploadFile(file: File): Promise<{ url: string; name: string; type: string; size: number } | null> {
    if (!chatId) return null
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const ext = file.name.split('.').pop() || 'bin'
    const path = `${chatId}/${user.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`

    const { error } = await supabase.storage.from('chat-files').upload(path, file, {
      contentType: file.type,
      cacheControl: '3600',
    })
    if (error) throw error

    const { data: { publicUrl } } = supabase.storage.from('chat-files').getPublicUrl(path)

    return { url: publicUrl, name: file.name, type: file.type, size: file.size }
  }

  async function sendMessage(content: string, file?: File, replyTo?: number | null) {
    if (!chatId) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    let fileInfo: { url: string; name: string; type: string; size: number } | null = null
    if (file) {
      fileInfo = await uploadFile(file)
    }

    const tempId = -(Date.now() + Math.random())
    const optimistic: Message = {
      id: tempId,
      chat_id: chatId,
      sender_id: user.id,
      content: content || (fileInfo ? '' : ''),
      file_url: fileInfo?.url || null,
      file_name: fileInfo?.name || null,
      file_type: fileInfo?.type || null,
      file_size: fileInfo?.size || null,
      reply_to: replyTo ?? null,
      created_at: new Date().toISOString(),
      profile: selfProfileRef.current,
    }
    setMessages(prev => [...prev, optimistic])

    const { data } = await supabase.from('messages').insert({
      chat_id: chatId,
      sender_id: user.id,
      content: content || (fileInfo ? '' : ''),
      file_url: fileInfo?.url || null,
      file_name: fileInfo?.name || null,
      file_type: fileInfo?.type || null,
      file_size: fileInfo?.size || null,
      reply_to: replyTo ?? null,
    }).select('id, created_at').single()

    if (data) {
      setMessages(prev => prev.map(m =>
        m.id === tempId ? { ...m, id: data.id, created_at: data.created_at } : m
      ))
    }
  }

  return { messages, loading, sendMessage }
}
