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
  const micTrackRef = useRef<ILocalAudioTrack | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const joiningRef = useRef(false)
  const mutedRef = useRef(false)
  const callIdRef = useRef<number | undefined>(undefined)
  const callStartRef = useRef<number | undefined>(undefined)
  const [trackedCallId, setTrackedCallId] = useState<number | undefined>(undefined)

  const appId = import.meta.env.VITE_AGORA_APP_ID

  const cleanup = useCallback(async () => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current)
      idleTimerRef.current = null
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (clientRef.current) {
      if (micTrackRef.current) {
        try { await clientRef.current.unpublish(micTrackRef.current) } catch {}
      }
      try { await clientRef.current.leave() } catch {}
      clientRef.current = null
    }
    joiningRef.current = false
    setElapsed(0)
    callStartRef.current = undefined
  }, [])

  async function ensureMicTrack() {
    if (micTrackRef.current) return micTrackRef.current
    try {
      const track = await AgoraRTC.createMicrophoneAudioTrack()
      micTrackRef.current = track
      setHasMic(true)
      return track
    } catch (err) {
      console.warn('Could not acquire microphone:', err)
      setHasMic(false)
      return null
    }
  }

  async function startTimer() {
    setElapsed(0)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      if (callStartRef.current) {
        setElapsed(Math.floor((Date.now() - callStartRef.current) / 1000))
      }
    }, 1000)
  }

  async function joinAgora(channelName: string, uid: string) {
    if (joiningRef.current) return
    if (!appId) {
      setError('Agora App ID is not configured.')
      return
    }
    joiningRef.current = true
    setError(null)
    try {
      if (clientRef.current) {
        try { await clientRef.current.leave() } catch {}
        clientRef.current = null
      }

      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })
      clientRef.current = client

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
          console.log('Call disconnected — rejoining in 2s')
          setTimeout(() => {
            joiningRef.current = false
            joinAgora(channelName, uid)
          }, 2000)
        }
      })

      await client.join(appId, channelName, null, uid)

      const track = await ensureMicTrack()
      if (track) {
        if (mutedRef.current) track.setEnabled(false)
        await client.publish(track)
      }

      await startTimer()
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
            callStartRef.current = new Date(newCall.created_at).getTime()
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
            if (!callStartRef.current) {
              callStartRef.current = new Date(updated.created_at).getTime()
            }
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
    callStartRef.current = new Date(data.created_at).getTime()
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
    if (micTrackRef.current) {
      micTrackRef.current.setEnabled(!newMuted)
    }
  }, [])

  useEffect(() => {
    return () => {
      cleanup()
      if (micTrackRef.current) {
        micTrackRef.current.close()
        micTrackRef.current = null
      }
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
