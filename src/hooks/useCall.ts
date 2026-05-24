import { useState, useEffect, useRef, useCallback } from 'react'
import AgoraRTC from 'agora-rtc-sdk-ng'
import type { IAgoraRTCClient, ILocalAudioTrack } from 'agora-rtc-sdk-ng'
import { supabase } from '../supabaseClient'
import type { Call } from '../types'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

export type CallStatus = 'idle' | 'calling' | 'ringing' | 'connected' | 'ended'

export function useCall(userId: string | undefined, chatId: number | undefined, partnerId: string | undefined) {
  const [status, setStatus] = useState<CallStatus>('idle')
  const [incomingCallerId, setIncomingCallerId] = useState<string | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [hasMic, setHasMic] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clientRef = useRef<IAgoraRTCClient | null>(null)
  const localTrackRef = useRef<ILocalAudioTrack | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const joiningRef = useRef(false)
  const channelInfoRef = useRef<{ channelName: string; uid: string } | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const mutedRef = useRef(false)
  const callIdRef = useRef<number | undefined>(undefined)
  const [trackedCallId, setTrackedCallId] = useState<number | undefined>(undefined)

  const appId = import.meta.env.VITE_AGORA_APP_ID

  const cleanup = useCallback(async () => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current)
      idleTimerRef.current = null
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (localTrackRef.current) {
      localTrackRef.current.close()
      localTrackRef.current = null
    }
    if (clientRef.current) {
      try { await clientRef.current.leave() } catch {}
      clientRef.current = null
    }
    joiningRef.current = false
    setElapsed(0)
  }, [])

  async function joinAgora(channelName: string, uid: string) {
    if (joiningRef.current) return
    if (!appId) {
      setError('Agora App ID is not configured. Set VITE_AGORA_APP_ID in your environment.')
      return
    }
    joiningRef.current = true
    setError(null)
    channelInfoRef.current = { channelName, uid }
    try {
      if (clientRef.current) {
        try { await clientRef.current.leave() } catch {}
        clientRef.current = null
      }
      if (localTrackRef.current) {
        localTrackRef.current.close()
        localTrackRef.current = null
      }
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }

      const client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' })
      clientRef.current = client
      client.startProxyServer(3)
      await client.setClientRole('host')

      client.on('user-published', async (user, mediaType) => {
        try {
          await client.subscribe(user, mediaType)
          if (mediaType === 'audio') {
            await user.audioTrack?.play()
          }
        } catch (subErr) {
          console.error('Failed to subscribe/play remote audio:', subErr)
        }
      })

      client.on('user-joined', (remoteUser) => {
        console.log('Remote user joined:', remoteUser.uid)
      })

      client.on('user-left', (remoteUser, reason) => {
        console.log('Remote user left:', remoteUser.uid, 'reason:', reason)
      })

      client.on('connection-state-change', (cur, prev) => {
        console.log('Connection state:', prev, '->', cur)
        if (cur === 'DISCONNECTED' && ['CONNECTED', 'RECONNECTING'].includes(prev)) {
          const info = channelInfoRef.current
          if (!info) return
          if (reconnectTimerRef.current) return
          console.log('Call disconnected — reconnecting in 2s')
          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null
            if (!info) return
            joiningRef.current = false
            joinAgora(info.channelName, info.uid)
          }, 2000)
        }
      })

      client.on('user-joined', (remoteUser) => {
        console.log('Remote user joined:', remoteUser.uid)
      })

      client.on('user-left', (remoteUser, reason) => {
        console.log('Remote user left:', remoteUser.uid, 'reason:', reason)
      })

      client.on('connection-state-change', (cur, prev) => {
        console.log('Connection state:', prev, '->', cur)
        if (cur === 'DISCONNECTED' && prev === 'CONNECTED') {
          console.log('Call disconnected — attempting reconnection')
          if (clientRef.current) {
            try { clientRef.current.leave() } catch {}
            clientRef.current = null
          }
          if (channelName) {
            joiningRef.current = false
            setTimeout(() => joinAgora(channelName, uid), 1000)
          }
        }
      })

      await client.join(appId, channelName, null, uid)

      let micAcquired = false
      try {
        const track = await AgoraRTC.createMicrophoneAudioTrack()
        if (mutedRef.current) track.setEnabled(false)
        localTrackRef.current = track
        await client.publish(track)
        micAcquired = true
      } catch (micErr) {
        console.warn('Could not acquire microphone, joining listen-only:', micErr)
      }
      setHasMic(micAcquired)

      setElapsed(0)
      timerRef.current = setInterval(() => {
        setElapsed(prev => prev + 1)
      }, 1000)
    } catch (err) {
      console.error('Failed to join Agora channel:', err)
      setError(`Call failed: ${(err as Error).message || 'Unknown error'}`)
      await cleanup()
    } finally {
      joiningRef.current = false
    }
  }

  function handleEnded() {
    cleanup()
    callIdRef.current = undefined
    setTrackedCallId(undefined)
    setIncomingCallerId(null)
    setStatus('ended')
    idleTimerRef.current = setTimeout(() => setStatus('idle'), 2000)
  }

  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel('incoming-calls')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'calls',
          filter: `receiver_id=eq.${userId}`,
        },
        (payload: RealtimePostgresChangesPayload<{ [key: string]: unknown }>) => {
          const newCall = payload.new as Call
          if (newCall.status === 'ringing') {
            callIdRef.current = newCall.id
            setTrackedCallId(newCall.id)
            setIncomingCallerId(newCall.caller_id)
            setStatus('ringing')
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId])

  useEffect(() => {
    if (!trackedCallId) return

    const channel = supabase
      .channel(`call-updates-${trackedCallId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'calls',
          filter: `id=eq.${trackedCallId}`,
        },
        async (payload: RealtimePostgresChangesPayload<{ [key: string]: unknown }>) => {
          const updated = payload.new as Call
          if (updated.status === 'active') {
            setStatus('connected')
            await joinAgora(updated.channel_name, userId!)
          } else if (updated.status === 'ended' || updated.status === 'missed') {
            handleEnded()
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [trackedCallId, userId])

  const startCall = useCallback(async () => {
    if (!userId || !chatId || !partnerId) return
    if (joiningRef.current) return

    const channelName = `call-${chatId}`

    const { data, error } = await supabase
      .from('calls')
      .insert({
        chat_id: chatId,
        caller_id: userId,
        receiver_id: partnerId,
        status: 'ringing',
        channel_name: channelName,
      })
      .select()
      .single()

    if (error || !data) {
      console.error('Failed to start call:', error)
      return
    }

    callIdRef.current = data.id
    setTrackedCallId(data.id)
    setIncomingCallerId(userId)
    setStatus('calling')
  }, [userId, chatId, partnerId])

  const acceptCall = useCallback(async () => {
    const cid = callIdRef.current
    const cname = `call-${chatId}`
    if (!cid || !userId || !chatId) return

    await supabase
      .from('calls')
      .update({ status: 'active' })
      .eq('id', cid)

    setStatus('connected')
    await joinAgora(cname, userId)
  }, [userId, chatId])

  const declineCall = useCallback(async () => {
    const cid = callIdRef.current
    if (!cid) return

    await supabase
      .from('calls')
      .update({ status: 'ended' })
      .eq('id', cid)

    await cleanup()
    callIdRef.current = undefined
    setTrackedCallId(undefined)
    setIncomingCallerId(null)
    setStatus('idle')
  }, [])

  const endCall = useCallback(async () => {
    const cid = callIdRef.current
    if (!cid) return

    await supabase
      .from('calls')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', cid)

    handleEnded()
  }, [])

  const toggleMute = useCallback(() => {
    const newMuted = !mutedRef.current
    mutedRef.current = newMuted
    setIsMuted(newMuted)
    if (localTrackRef.current) {
      localTrackRef.current.setEnabled(!newMuted)
    }
  }, [])

  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [])

  return {
    status,
    incomingCallerId,
    isMuted,
    elapsed,
    hasMic,
    error,
    startCall,
    acceptCall,
    declineCall,
    endCall,
    toggleMute,
  }
}
