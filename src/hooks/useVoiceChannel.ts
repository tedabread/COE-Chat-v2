import { useState, useEffect, useRef, useCallback } from 'react'
import AgoraRTC from 'agora-rtc-sdk-ng'
import type { IAgoraRTCClient, ILocalAudioTrack } from 'agora-rtc-sdk-ng'
import { supabase } from '../supabaseClient'

export function useVoiceChannel(userId: string | undefined, serverId: number | undefined) {
  const [activeChannelId, setActiveChannelId] = useState<number | null>(null)
  const [connected, setConnected] = useState(false)

  const clientRef = useRef<IAgoraRTCClient | null>(null)
  const micTrackRef = useRef<ILocalAudioTrack | null>(null)
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const joiningRef = useRef(false)

  const appId = import.meta.env.VITE_AGORA_APP_ID

  const leaveChannel = useCallback(async () => {
    if (presenceChannelRef.current) {
      await presenceChannelRef.current.untrack()
      supabase.removeChannel(presenceChannelRef.current)
      presenceChannelRef.current = null
    }
    if (clientRef.current) {
      if (micTrackRef.current) {
        try { await clientRef.current.unpublish(micTrackRef.current) } catch {}
      }
      try { await clientRef.current.leave() } catch {}
      clientRef.current = null
    }
    joiningRef.current = false
    setConnected(false)
    setActiveChannelId(null)
  }, [])

  async function joinAgoraForChannel(channelId: number) {
    if (joiningRef.current) return
    if (!appId || !userId) return
    joiningRef.current = true

    try {
      await leaveChannel()

      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })
      clientRef.current = client

      client.on('user-published', async (user, mediaType) => {
        try {
          await client.subscribe(user, mediaType)
          if (mediaType === 'audio') {
            await user.audioTrack?.play()
          }
        } catch {}
      })

      const channelName = `voice-channel-${channelId}`
      await client.join(appId, channelName, null, userId)

      const track = await AgoraRTC.createMicrophoneAudioTrack()
      micTrackRef.current = track
      await client.publish(track)

      // Track presence on server-level channel so all server members see it
      const presenceChannel = supabase.channel(`voice-presence-${serverId}`, {
        config: { presence: { key: userId } },
      })
      presenceChannelRef.current = presenceChannel
      await presenceChannel.subscribe()
      await presenceChannel.track({ channel_id: channelId, user_id: userId })

      setConnected(true)
      setActiveChannelId(channelId)
    } catch (err) {
      console.error('Failed to join voice channel:', err)
    } finally {
      joiningRef.current = false
    }
  }

  useEffect(() => {
    return () => { leaveChannel() }
  }, [])

  async function toggleChannel(channelId: number) {
    if (activeChannelId === channelId) {
      await leaveChannel()
    } else {
      await joinAgoraForChannel(channelId)
    }
  }

  return { activeChannelId, connected, toggleChannel, leaveChannel }
}
