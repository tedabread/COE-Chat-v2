import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import type { Server, ServerMember, Channel } from '../types'

export function useServers(userId: string | undefined) {
  const [servers, setServers] = useState<Server[]>([])
  const [loading, setLoading] = useState(true)

  const fetchServers = useCallback(async () => {
    if (!userId) { setLoading(false); return }
    try {
      const memberIds: number[] = []
      const { data: memberData, error: memberErr } = await supabase
        .from('server_members')
        .select('server_id')
        .eq('user_id', userId)
      if (memberErr) console.error('fetchServers member query error:', memberErr)
      if (memberData) memberIds.push(...memberData.map(m => m.server_id))

      let query = supabase.from('servers').select('*')
      if (memberIds.length > 0) {
        query = query.or(`owner_id.eq.${userId},id.in.(${memberIds.join(',')})`)
      } else {
        query = query.eq('owner_id', userId)
      }
      const { data: serversData, error: serversErr } = await query.order('created_at', { ascending: true })
      if (serversErr) console.error('fetchServers servers query error:', serversErr)
      if (serversData) setServers(serversData)
      else setServers([])
    } catch (err) {
      console.error('fetchServers unexpected error:', err)
    }
    setLoading(false)
  }, [userId])

  useEffect(() => { fetchServers() }, [fetchServers])

  async function createServer(name: string): Promise<Server | null> {
    if (!userId) return null
    console.log('createServer: inserting', { name, owner_id: userId })
    const { data: insertData, error: insertErr } = await supabase
      .from('servers')
      .insert({ name, owner_id: userId })
      .select()
      .single()
    if (insertErr) {
      console.error('createServer insert error:', insertErr)
      return null
    }
    console.log('createServer: insert succeeded', insertData)

    setServers(prev => [...prev, insertData])
    return insertData
  }

  return { servers, loading, createServer, refetch: fetchServers }
}

export async function fetchServerMembers(serverId: number): Promise<ServerMember[]> {
  const { data, error } = await supabase
    .from('server_members')
    .select('*, profile:profiles(*), role:server_roles(*)')
    .eq('server_id', serverId)
  if (error) console.error('fetchServerMembers error:', error)
  return (data as unknown as ServerMember[]) || []
}

export async function fetchServerChannels(serverId: number): Promise<Channel[]> {
  const { data, error } = await supabase
    .from('channels')
    .select('*')
    .eq('server_id', serverId)
    .order('position', { ascending: true })
  if (error) console.error('fetchServerChannels error:', error)
  return data || []
}

export async function isServerMember(serverId: number, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('server_members')
    .select('id')
    .eq('server_id', serverId)
    .eq('user_id', userId)
    .maybeSingle()
  return !!data
}

export async function joinServer(serverId: number, userId: string): Promise<boolean> {
  const { error } = await supabase
    .from('server_members')
    .insert({ server_id: serverId, user_id: userId })
  if (error) { console.error('joinServer error:', error); return false }
  return true
}
