import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useFriends, ensureDmExists } from '../hooks/useFriends'
import { useServers, fetchServerChannels } from '../hooks/useServers'
import { useCall } from '../hooks/useCall'
import { useVoiceChannel } from '../hooks/useVoiceChannel'
import { usePresence } from '../hooks/usePresence'
import { getAvatarColor } from '../utils/avatar'
import { getFontFamily, loadFont } from '../utils/fonts'
import type { Profile, Server, Channel } from '../types'
import { FriendSearch } from '../components/FriendSearch'
import { FriendRequests } from '../components/FriendRequests'
import { ChatView } from '../components/ChatView'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Icon } from '../components/Icon'
import { AdminBadge } from '../components/AdminBadge'
import { AdminPanel } from '../components/AdminPanel'
import { ServerBar } from '../components/ServerBar'
import { ChannelList } from '../components/ChannelList'
import { ChannelView } from '../components/ChannelView'
import { CreateServerModal } from '../components/CreateServerModal'
import { ServerSettings } from '../components/ServerSettings'
import { VoiceOverlay } from '../components/VoiceOverlay'
import { signalAppReady } from '../appReady'

export function Home() {
  const { user, signOut } = useAuth()
  const { friends, loading: friendsLoading, removeFriend, refetch: refetchFriends } = useFriends(user?.id)
  const { servers, createServer, refetch: refetchServers } = useServers(user?.id)
  const [profile, setProfile] = useState<Profile | null>(null)
  const navigate = useNavigate()
  const routeParams = useParams()

  // DM state
  const [activeFriendId, setActiveFriendId] = useState<string | null>(null)
  const [activeFriend, setActiveFriend] = useState<Profile | null>(null)
  const [activeChatId, setActiveChatId] = useState<number | null>(null)

  // Server state
  const [activeServerId, setActiveServerId] = useState<number | null>(null)
  const [activeServer, setActiveServer] = useState<Server | null>(null)
  const [activeChannelId, setActiveChannelId] = useState<number | null>(null)
  const [channels, setChannels] = useState<Channel[]>([])
  const [canManageMessages, setCanManageMessages] = useState(false)
  const [voiceParticipants, setVoiceParticipants] = useState<Record<number, number>>({})

  // UI state
  const [showAdmin, setShowAdmin] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<Profile | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [showCreateServer, setShowCreateServer] = useState(false)
  const [showServerSettings, setShowServerSettings] = useState(false)
  const [activeDm, setActiveDm] = useState(true)

  const call = useCall(user?.id, activeChatId ?? undefined, activeFriend?.id)
  const { userStatuses } = usePresence(user?.id)

  // Resolve URL params
  const chatIdParam = routeParams.id
  const serverIdParam = routeParams.serverId
  const channelIdParam = routeParams.channelId

  // ── Route resolution ──────────────────────────────────────

  useEffect(() => {
    if (!user) return

    if (serverIdParam) {
      const sid = Number(serverIdParam)
      if (sid) {
        setActiveServerId(sid)
        setActiveDm(false)
        setActiveChatId(null)
        setActiveFriendId(null)
        setActiveFriend(null)
      }
    }
  }, [serverIdParam, user])

  useEffect(() => {
    if (!user || !chatIdParam) return
    const cid = Number(chatIdParam)
    if (!cid || cid === activeChatId) return
    setActiveDm(true)
    setActiveServerId(null)
    setActiveServer(null)
    setActiveChannelId(null)
    ;(async () => {
      const { data } = await supabase
        .from('chat_members')
        .select('user_id')
        .eq('chat_id', cid)
      if (!data) return
      const otherId = data.find((m) => m.user_id !== user.id)?.user_id
      if (!otherId) return
      const { data: other } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', otherId)
        .single()
      if (other) {
        setActiveFriendId(other.id)
        setActiveFriend(other)
        setActiveChatId(cid)
      }
    })()
  }, [chatIdParam, user])

  // ── Load server data ──────────────────────────────────────

  useEffect(() => {
    if (!activeServerId) return
    supabase.from('servers').select('*').eq('id', activeServerId).single().then(({ data }) => {
      if (data) setActiveServer(data)
    })
    fetchServerChannels(activeServerId).then(setChannels)

    // Check permission
    if (user) {
      const checkPerm = async () => {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
        if (profile?.role === 'admin' || profile?.role === 'owner') {
          setCanManageMessages(true)
          return
        }
        const { data } = await supabase
          .rpc('check_server_permission', { uid: user.id, sid: activeServerId, perm: 'manage_messages' })
        if (data) setCanManageMessages(true)
      }
      checkPerm()
    }
  }, [activeServerId, user])

  // Resolve channelId param
  useEffect(() => {
    if (!channelIdParam) return
    const cid = Number(channelIdParam)
    if (cid) setActiveChannelId(cid)
  }, [channelIdParam])

  // Auto-select first channel when loading channels
  useEffect(() => {
    if (channels.length > 0 && !activeChannelId) {
      const firstText = channels.find(c => c.type === 'text')
      if (firstText) {
        setActiveChannelId(firstText.id)
      }
    }
  }, [channels, activeChannelId])

  const voice = useVoiceChannel(user?.id, activeServerId ?? undefined)

  // Track voice participants per channel from presence
  useEffect(() => {
    if (!activeServerId) return
    const channel = supabase
      .channel(`voice-presence-${activeServerId}`)
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState() as Record<string, { channel_id: number }[]>
        const counts: Record<number, number> = {}
        for (const [, presences] of Object.entries(state)) {
          for (const p of presences) {
            counts[p.channel_id] = (counts[p.channel_id] || 0) + 1
          }
        }
        setVoiceParticipants(counts)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [activeServerId])

  // ── Profile loading ───────────────────────────────────────

  const profileFetchedRef = useRef(false)

  useEffect(() => {
    if (!user) return
    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setProfile(data)
          if (data.role === 'admin' || data.role === 'owner') setIsAdmin(true)
        }
        profileFetchedRef.current = true
      })
  }, [user])

  useEffect(() => {
    if (!friendsLoading && profileFetchedRef.current) {
      signalAppReady()
    }
  }, [friendsLoading, profile])

  useEffect(() => {
    if (profile?.name_font) loadFont(profile.name_font)
    if (profile?.message_font) loadFont(profile.message_font)
  }, [profile])

  useEffect(() => {
    for (const f of friends) {
      if (f.name_font) loadFont(f.name_font)
      if (f.message_font) loadFont(f.message_font)
    }
  }, [friends])

  // ── DM actions ────────────────────────────────────────────

  async function openDm(friend: Profile) {
    setActiveFriendId(friend.id)
    setActiveFriend(friend)
    try {
      const chatId = await ensureDmExists(user!.id, friend.id)
      if (chatId) {
        setActiveChatId(chatId)
        setActiveDm(true)
        setActiveServerId(null)
        setActiveServer(null)
        setActiveChannelId(null)
        navigate(`/chat/${chatId}`, { replace: true })
      }
    } catch (err) {
      console.error('Error in openDm:', err)
    }
  }

  function closeChat() {
    setActiveChatId(null)
    setActiveFriendId(null)
    setActiveFriend(null)
    if (activeServerId) {
      navigate(`/server/${activeServerId}`, { replace: true })
    } else {
      navigate('/', { replace: true })
    }
  }

  // ── Server actions ────────────────────────────────────────

  function selectServer(server: Server | null) {
    if (!server) {
      setActiveDm(true)
      setActiveServerId(null)
      setActiveServer(null)
      setActiveChannelId(null)
      navigate('/', { replace: true })
      return
    }
    setActiveDm(false)
    setActiveServerId(server.id)
    setActiveChatId(null)
    setActiveFriendId(null)
    setActiveFriend(null)
    navigate(`/server/${server.id}`, { replace: true })
  }

  function selectChannel(channel: Channel) {
    setActiveChannelId(channel.id)
    if (activeServerId) {
      navigate(`/server/${activeServerId}/channel/${channel.id}`, { replace: true })
    }
  }

  function selectVoiceChannel(channel: Channel) {
    voice.toggleChannel(channel.id)
  }

  async function handleCreateServer(name: string) {
    const server = await createServer(name)
    if (server) {
      refetchServers()
      selectServer(server)
    }
  }

  function openDmView() {
    setActiveDm(true)
    setActiveServerId(null)
    setActiveServer(null)
    setActiveChannelId(null)
    navigate('/', { replace: true })
  }

  // ── Sign out ──────────────────────────────────────────────

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  function handleRemoveFriend(friend: Profile) {
    if (activeFriendId === friend.id) closeChat()
    removeFriend(friend.id)
    setConfirmRemove(null)
  }

  const tag = profile ? `${profile.username}#${profile.uid}` : ''
  const activeChannel = channels.find(c => c.id === activeChannelId)

  return (
    <div className="home-layout">
      <ServerBar
        servers={servers}
        activeServerId={activeServerId}
        activeDm={activeDm}
        onSelectServer={selectServer}
        onOpenDm={openDmView}
        onCreateServer={() => setShowCreateServer(true)}
      />

      {activeDm ? (
        <aside className="sidebar">
          <div className="sidebar-top">
            <FriendSearch userId={user?.id} />
            <FriendRequests userId={user?.id} onFriendListChange={refetchFriends} />

            <div className="friend-list">
              <div className="list-header">
                <span><Icon name="users" /> Friends ({friends.length})</span>
                {isAdmin && <span className="admin-badge">Admin</span>}
              </div>
              {friends.map((f, i) => {
                const status = userStatuses[f.id] || 'offline'
                return (
                  <div
                    key={f.id}
                    className={`list-item clickable fade-in ${activeFriendId === f.id ? 'active' : ''}`}
                    style={{ animationDelay: `${i * 0.03}s` }}
                    onClick={() => openDm(f)}
                  >
                    <div className="friend-list-avatar-wrap">
                      {f.avatar_url ? (
                        <img src={f.avatar_url} className="friend-list-avatar" alt="" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      ) : (
                        <div className="friend-list-avatar default" style={{ backgroundColor: getAvatarColor(f.id) }}>
                          {(f.display_name || f.username || '?')[0].toUpperCase()}
                        </div>
                      )}
                      <span className={`presence-dot ${status}`} />
                    </div>
                    <span className="friend-list-name" style={{
                      fontFamily: f.name_font ? getFontFamily(f.name_font) : undefined,
                      color: f.name_color || undefined,
                      ...(f.role === 'admin' || f.role === 'owner' ? { textShadow: `1px 0 0.3px ${f.admin_outline_color || '#cba6f7'}, -1px 0 0.3px ${f.admin_outline_color || '#cba6f7'}, 0 1px 0.3px ${f.admin_outline_color || '#cba6f7'}, 0 -1px 0.3px ${f.admin_outline_color || '#cba6f7'}, 1px 1px 0.3px ${f.admin_outline_color || '#cba6f7'}, -1px 1px 0.3px ${f.admin_outline_color || '#cba6f7'}, -1px -1px 0.3px ${f.admin_outline_color || '#cba6f7'}, 1px -1px 0.3px ${f.admin_outline_color || '#cba6f7'}` } : {}),
                    }}>
                      {f.display_name || f.username}
                      <AdminBadge role={f.role} />
                    </span>
                    <span className="uid">#{f.uid}</span>
                    <div className="friend-list-right">
                      <button
                        className="friend-remove-btn"
                        onClick={(e) => { e.stopPropagation(); setConfirmRemove(f) }}
                      >
                        <Icon name="close" />
                        <span className="tooltip">Remove friend</span>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="sidebar-user">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} className="sidebar-user-avatar" alt="" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            ) : (
              <div className="sidebar-user-avatar default" style={{ backgroundColor: profile ? getAvatarColor(profile.id) : undefined }}>
                {(profile?.display_name || profile?.username || '?')[0].toUpperCase()}
              </div>
            )}
            <div className="sidebar-user-info">
              <span className="sidebar-user-name" style={{
                fontFamily: profile?.name_font ? getFontFamily(profile.name_font) : undefined,
                color: profile?.name_color || undefined,
                ...((profile?.role === 'admin' || profile?.role === 'owner') ? { textShadow: `1px 0 0.3px ${profile.admin_outline_color || '#cba6f7'}, -1px 0 0.3px ${profile.admin_outline_color || '#cba6f7'}, 0 1px 0.3px ${profile.admin_outline_color || '#cba6f7'}, 0 -1px 0.3px ${profile.admin_outline_color || '#cba6f7'}, 1px 1px 0.3px ${profile.admin_outline_color || '#cba6f7'}, -1px 1px 0.3px ${profile.admin_outline_color || '#cba6f7'}, -1px -1px 0.3px ${profile.admin_outline_color || '#cba6f7'}, 1px -1px 0.3px ${profile.admin_outline_color || '#cba6f7'}` } : {}),
              }}>
                {profile?.display_name || profile?.username}
                <AdminBadge role={profile?.role} />
              </span>
              <span className="sidebar-user-tag">{tag}</span>
            </div>
            <div className="sidebar-user-right">
              <span className="sidebar-user-actions">
                <button className={`sidebar-icon-btn${call.isMuted ? ' muted' : ''}`} onClick={call.toggleMute} title={call.isMuted ? 'Unmute' : 'Mute'}>
                  <Icon name={call.isMuted ? 'mic_off' : 'mic'} />
                </button>
                <button className="sidebar-icon-btn" onClick={handleSignOut}>
                  <Icon name="logout" />
                </button>
                {isAdmin && (
                  <button className="sidebar-icon-btn admin-icon-btn" onClick={() => setShowAdmin(true)} title="Admin Panel">
                    <Icon name="shield" />
                  </button>
                )}
              </span>
              <button className="sidebar-icon-btn" onClick={() => navigate('/settings')}>
                <Icon name="settings" />
              </button>
            </div>
          </div>
        </aside>
      ) : (
        <aside className="sidebar channel-sidebar">
          <ChannelList
            channels={channels}
            activeChannelId={activeChannelId}
            onSelectChannel={selectChannel}
            serverName={activeServer?.name || 'Server'}
            voiceParticipants={voiceParticipants}
            onJoinVoice={selectVoiceChannel}
            activeVoiceChannelId={voice.activeChannelId}
            onSettings={() => setShowServerSettings(true)}
          />
          <div className="sidebar-user">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} className="sidebar-user-avatar" alt="" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            ) : (
              <div className="sidebar-user-avatar default" style={{ backgroundColor: profile ? getAvatarColor(profile.id) : undefined }}>
                {(profile?.display_name || profile?.username || '?')[0].toUpperCase()}
              </div>
            )}
            <div className="sidebar-user-info">
              <span className="sidebar-user-name" style={{
                fontFamily: profile?.name_font ? getFontFamily(profile.name_font) : undefined,
                color: profile?.name_color || undefined,
              }}>
                {profile?.display_name || profile?.username}
              </span>
              <span className="sidebar-user-tag">{tag}</span>
            </div>
            <div className="sidebar-user-right">
              <button className="sidebar-icon-btn" onClick={() => navigate('/settings')}>
                <Icon name="settings" />
              </button>
            </div>
          </div>
        </aside>
      )}

      <main className="main-content">
        {activeDm && activeChatId ? (
          <ChatView
            chatId={activeChatId}
            partner={activeFriend}
            onClose={closeChat}
            callStatus={call.status}
            incomingCallerId={call.incomingCallerId}
            elapsed={call.elapsed}
            startCall={call.startCall}
            acceptCall={call.acceptCall}
            declineCall={call.declineCall}
            endCall={call.endCall}
          />
        ) : !activeDm && activeChannel ? (
          <ChannelView
            channel={activeChannel}
            onClose={() => { setActiveServerId(null); setActiveDm(true); navigate('/', { replace: true }) }}
            canManageMessages={canManageMessages}
          />
        ) : !activeDm && !activeChannel && channels.length === 0 ? (
          <div className="empty-state">
            <Icon name="message" />
            <h2>No channels yet</h2>
          </div>
        ) : (
          <div className="empty-state">
            <Icon name="message" />
            <h2>{activeDm ? 'Select a friend to start chatting' : 'Select a channel'}</h2>
          </div>
        )}
      </main>

      <VoiceOverlay
        channelName={channels.find(c => c.id === voice.activeChannelId)?.name || ''}
        connected={voice.connected}
        onLeave={voice.leaveChannel}
      />

      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}

      <ConfirmDialog
        open={!!confirmRemove}
        title="Remove friend?"
        message={`Are you sure you want to remove ${confirmRemove?.display_name || confirmRemove?.username} as a friend?`}
        onConfirm={() => confirmRemove && handleRemoveFriend(confirmRemove)}
        onCancel={() => setConfirmRemove(null)}
      />

      {showCreateServer && (
        <CreateServerModal
          onClose={() => setShowCreateServer(false)}
          onCreate={handleCreateServer}
        />
      )}

      {showServerSettings && activeServer && (
        <ServerSettings
          server={activeServer}
          onClose={() => setShowServerSettings(false)}
          onUpdate={() => {
            if (activeServerId) fetchServerChannels(activeServerId).then(setChannels)
          }}
        />
      )}
    </div>
  )
}
