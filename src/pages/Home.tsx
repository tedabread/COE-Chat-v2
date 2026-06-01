import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useFriends, ensureDmExists } from '../hooks/useFriends'
import { useServers, fetchServerChannels, fetchServerMembers } from '../hooks/useServers'
import { useCall } from '../hooks/useCall'
import { useVoiceChannel } from '../hooks/useVoiceChannel'
import { usePresence } from '../hooks/usePresence'
import { useUnread } from '../hooks/useUnread'
import { getAvatarColor } from '../utils/avatar'
import { getFontFamily, loadFont } from '../utils/fonts'
import type { Profile, Server, Channel, ServerMember } from '../types'
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
import { SettingsView } from '../components/SettingsView'
import { ServerSettings } from '../components/ServerSettings'
import { VoiceOverlay } from '../components/VoiceOverlay'
import { signalAppReady } from '../appReady'

export function Home() {
  const { user, signOut } = useAuth()
  const { friends, requests, loading: friendsLoading, removeFriend, refetch: refetchFriends, refetchRequests, acceptRequest, rejectRequest } = useFriends(user?.id)
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
  const [showSettings, setShowSettings] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<Profile | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [showCreateServer, setShowCreateServer] = useState(false)
  const [showServerSettings, setShowServerSettings] = useState(false)
  const [activeDm, setActiveDm] = useState(true)
  const [serverMembers, setServerMembers] = useState<ServerMember[]>([])
  const showMemberSidebar = true
  const [resolvingChat, setResolvingChat] = useState(false)
  const closingChatRef = useRef(false)
  const [pageHidden, setPageHidden] = useState(false)
  const originalTitleRef = useRef(document.title)

  const userDisplayNames = useMemo(() => {
    const map: Record<string, string> = {}
    for (const sm of serverMembers) {
      map[sm.user_id] = sm.profile?.display_name || sm.profile?.username || 'Unknown'
    }
    return map
  }, [serverMembers])

  const call = useCall(user?.id, activeChatId ?? undefined, activeFriend?.id)
  const { userStatuses, refreshStatuses } = usePresence(user?.id)
  const { dmUnreads, channelUnreads, chatIdForFriend, markChatRead, markChannelRead } = useUnread(user?.id)

  // ── Real-time profile subscription ──────────────────────────
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel('profile-updates')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=neq.${user.id}` },
        () => {
          console.log('[profile-updates] Realtime event fired')
          refreshStatuses()
          refetchFriends()
          if (activeServerId) fetchServerMembers(activeServerId).then(setServerMembers)
          if (activeFriend) {
            supabase.from('profiles').select('*').eq('id', activeFriend.id).single().then(({ data }) => {
              if (data) setActiveFriend(data)
            })
          }
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user, activeFriend?.id, activeServerId])

  // ── Real-time friend request changes ────────────────────────
  useEffect(() => {
    if (!user) return

    // Two subscriptions (incoming + outgoing) instead of `or()` filter
    // which may not be supported by Realtime postgres_changes.
    const incoming = supabase
      .channel('friend-requests-incoming')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'friend_requests', filter: `receiver_id=eq.${user.id}` },
        () => { refetchRequests(); refetchFriends() }
      )
      .subscribe()

    const outgoing = supabase
      .channel('friend-requests-outgoing')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'friend_requests', filter: `sender_id=eq.${user.id}` },
        () => { refetchRequests(); refetchFriends() }
      )
      .subscribe()

    // Fallback poll every 5s in case Realtime doesn't fire
    const poll = setInterval(() => {
      refetchRequests()
      refetchFriends()
    }, 5_000)

    return () => {
      supabase.removeChannel(incoming)
      supabase.removeChannel(outgoing)
      clearInterval(poll)
    }
  }, [user])

  // ── Real-time server membership changes ─────────────────────
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel('server-member-changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'server_members', filter: `user_id=eq.${user.id}` },
        () => { refetchServers() }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user])

  // ── Fetch server members when active server changes ─────────
  useEffect(() => {
    if (!activeServerId) { setServerMembers([]); return }
    fetchServerMembers(activeServerId).then(setServerMembers)
    const channel = supabase
      .channel(`server-members-${activeServerId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'server_members', filter: `server_id=eq.${activeServerId}` },
        () => { fetchServerMembers(activeServerId).then(setServerMembers) }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [activeServerId])

  const chatIdParam = routeParams.id
  const serverIdParam = routeParams.serverId
  const channelIdParam = routeParams.channelId

  // ── Route resolution ──────────────────────────────────────

  useEffect(() => {
    if (!user) return
    console.log('serverResolve: checking serverIdParam', { serverIdParam })

    if (serverIdParam) {
      const sid = Number(serverIdParam)
      if (sid) {
        console.log('serverResolve: setting active server', { sid })
        setActiveServerId(sid)
        setActiveDm(false)
        setActiveChatId(null)
        setActiveFriendId(null)
        setActiveFriend(null)
      }
    }
  }, [serverIdParam, user])

  useEffect(() => {
    if (!user || !chatIdParam) {
      console.log('chatResolve: skipped — no user or no chatIdParam', { user: !!user, chatIdParam })
      return
    }
    const cid = Number(chatIdParam)
    if (!cid || cid === activeChatId || closingChatRef.current) {
      console.log('chatResolve: skipped — invalid cid or already active', { cid, activeChatId })
      return
    }
    console.log('chatResolve: resolving chat', { cid })
    setResolvingChat(true)
    setActiveDm(true)
    setActiveServerId(null)
    setActiveServer(null)
    setActiveChannelId(null)
    setActiveChatId(null)
    setChannels([])
    ;(async () => {
      try {
        const { data: members } = await supabase
          .rpc('get_chat_members', { chat_id_input: cid }) as unknown as { data: { user_id: string }[] | null }
        console.log('chatResolve: members result', { members })
        if (!members || members.length === 0) {
          console.log('chatResolve: no members found')
          setResolvingChat(false)
          return
        }
        const otherId = members.find((m) => m.user_id !== user.id)?.user_id
        console.log('chatResolve: otherId', { otherId })
        if (!otherId) {
          console.log('chatResolve: setting solo chat')
          setActiveChatId(cid)
          setActiveFriendId(user.id)
          setResolvingChat(false)
          return
        }
        const { data: other } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', otherId)
          .single()
        console.log('chatResolve: other profile', { other })
        if (other) {
          setActiveFriendId(other.id)
          setActiveFriend(other)
          setActiveChatId(cid)
        }
      } catch (err) {
        console.error('chatResolve: error', err)
      }
      setResolvingChat(false)
    })()
  }, [chatIdParam, user, activeChatId])

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

  // ── Page visibility ──────────────────────────────────────

  const prevHiddenRef = useRef(false)

  useEffect(() => {
    function handleVisibility() {
      setPageHidden(document.visibilityState === 'hidden')
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  useEffect(() => {
    const wasHidden = prevHiddenRef.current
    prevHiddenRef.current = pageHidden
    if (wasHidden && !pageHidden) {
      if (activeFriendId && chatIdForFriend[activeFriendId]) {
        markChatRead(chatIdForFriend[activeFriendId])
      }
      if (activeChannelId) {
        markChannelRead(activeChannelId)
      }
    }
  }, [pageHidden])

  // ── Document title for unread count ──────────────────────

  const totalUnreads = useMemo(() => {
    let total = 0
    for (const f of friends) {
      total += dmUnreads[f.id] || 0
    }
    for (const ch of channels) {
      total += channelUnreads[ch.id] || 0
    }
    return total
  }, [dmUnreads, channelUnreads, friends, channels])

  useEffect(() => {
    if (totalUnreads > 0) {
      document.title = `${totalUnreads} unread messages`
    } else {
      document.title = originalTitleRef.current
    }
    return () => { document.title = originalTitleRef.current }
  }, [totalUnreads])

  // ── DM actions ────────────────────────────────────────────

  async function openDm(friend: Profile) {
    console.log('openDm: opening DM with', { friendId: friend.id, friendName: friend.display_name || friend.username })
    setActiveFriendId(friend.id)
    setActiveFriend(friend)
    try {
      const chatId = await ensureDmExists(user!.id, friend.id)
      console.log('openDm: ensureDmExists returned', { chatId })
      if (chatId) {
        setActiveChatId(chatId)
        setActiveDm(true)
        setActiveServerId(null)
        setActiveServer(null)
        setActiveChannelId(null)
        navigate(`/chat/${chatId}`, { replace: true })
        console.log('openDm: navigated to', { url: `/chat/${chatId}` })
      }
    } catch (err) {
      console.error('Error in openDm:', err)
    }
  }

  function closeChat() {
    closingChatRef.current = true
    setActiveChatId(null)
    setActiveFriendId(null)
    setActiveFriend(null)
    navigate('/', { replace: true })
    setTimeout(() => { closingChatRef.current = false }, 0)
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

  function renderMemberGroups() {
    const grouped: Record<string, { members: ServerMember[]; color: string | null; position: number }> = {}
    const noRoleMembers: ServerMember[] = []

    for (const m of serverMembers) {
      if (m.role) {
        const key = m.role.name
        if (!grouped[key]) grouped[key] = { members: [], color: m.role.color, position: m.role.position }
        grouped[key].members.push(m)
      } else {
        noRoleMembers.push(m)
      }
    }

    const sortedGroups = Object.entries(grouped).sort((a, b) => a[1].position - b[1].position)

    return (
      <>
        {sortedGroups.map(([name, group]) => (
          <div key={name} className="member-role-section">
            <div className="member-role-label" style={group.color ? { color: group.color } : undefined}>
              {name} — {group.members.length}
            </div>
            {group.members.map(m => {
              const p = m.profile as Profile | undefined
              const status = p ? userStatuses[p.id] || 'offline' : 'offline'
              return (
                <div key={m.id} className="member-item">
                  <div style={{ position: 'relative', flexShrink: 0, width: 28, height: 28 }}>
                    <div className="member-item-avatar">
                      {p?.avatar_url ? (
                        <img src={p.avatar_url} alt="" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: p ? getAvatarColor(p.id) : 'var(--surface0)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700, color: 'var(--base)' }}>
                          {p ? (p.display_name || p.username || '?')[0].toUpperCase() : '?'}
                        </div>
                      )}
                    </div>
                    <span className={`presence-dot ${status}`} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="member-item-name" style={{
                      fontFamily: p?.name_font ? getFontFamily(p.name_font) : undefined,
                      color: p?.name_color || undefined,
                      ...((p?.role === 'admin' || p?.role === 'owner') ? { textShadow: `1px 0 0.3px ${p.admin_outline_color || '#cba6f7'}, -1px 0 0.3px ${p.admin_outline_color || '#cba6f7'}, 0 1px 0.3px ${p.admin_outline_color || '#cba6f7'}, 0 -1px 0.3px ${p.admin_outline_color || '#cba6f7'}, 1px 1px 0.3px ${p.admin_outline_color || '#cba6f7'}, -1px 1px 0.3px ${p.admin_outline_color || '#cba6f7'}, -1px -1px 0.3px ${p.admin_outline_color || '#cba6f7'}, 1px -1px 0.3px ${p.admin_outline_color || '#cba6f7'}` } : {}),
                    }}>
                      {p?.display_name || p?.username || 'Unknown'}
                      <AdminBadge role={p?.role} />
                    </div>
                    <div className="member-item-status">{status}</div>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
        {noRoleMembers.length > 0 && (
          <div className="member-role-section">
            <div className="member-role-label">Members — {noRoleMembers.length}</div>
            {noRoleMembers.map(m => {
              const p = m.profile as Profile | undefined
              const status = p ? userStatuses[p.id] || 'offline' : 'offline'
              return (
                <div key={m.id} className="member-item">
                  <div style={{ position: 'relative', flexShrink: 0, width: 28, height: 28 }}>
                    <div className="member-item-avatar">
                      {p?.avatar_url ? (
                        <img src={p.avatar_url} alt="" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: p ? getAvatarColor(p.id) : 'var(--surface0)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700, color: 'var(--base)' }}>
                          {p ? (p.display_name || p.username || '?')[0].toUpperCase() : '?'}
                        </div>
                      )}
                    </div>
                    <span className={`presence-dot ${status}`} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="member-item-name" style={{
                      fontFamily: p?.name_font ? getFontFamily(p.name_font) : undefined,
                      color: p?.name_color || undefined,
                    }}>
                      {p?.display_name || p?.username || 'Unknown'}
                    </div>
                    <div className="member-item-status">{status}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </>
    )
  }

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
            <FriendRequests requests={requests} onAccept={acceptRequest} onReject={rejectRequest} />

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
                    {dmUnreads[f.id] > 0 && (activeFriendId !== f.id || pageHidden) && (
                      <span
                        className="unread-badge"
                        onClick={(e) => {
                          e.stopPropagation()
                          const cid = chatIdForFriend[f.id]
                          if (cid) markChatRead(cid)
                        }}
                        title="Mark as read"
                      >{dmUnreads[f.id]}</span>
                    )}
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
            <div className="sidebar-user-avatar-wrap">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} className="sidebar-user-avatar" alt="" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
              ) : (
                <div className="sidebar-user-avatar default" style={{ backgroundColor: profile ? getAvatarColor(profile.id) : undefined }}>
                  {(profile?.display_name || profile?.username || '?')[0].toUpperCase()}
                </div>
              )}
              <span className={`presence-dot ${userStatuses[user?.id || ''] || 'online'}`} />
            </div>
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
              <button className="sidebar-icon-btn" onClick={() => setShowSettings(true)}>
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
            unreadCounts={channelUnreads}
            pageHidden={pageHidden}
          />
          <div className="sidebar-user">
            <div className="sidebar-user-avatar-wrap">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} className="sidebar-user-avatar" alt="" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
              ) : (
                <div className="sidebar-user-avatar default" style={{ backgroundColor: profile ? getAvatarColor(profile.id) : undefined }}>
                  {(profile?.display_name || profile?.username || '?')[0].toUpperCase()}
                </div>
              )}
              <span className={`presence-dot ${userStatuses[user?.id || ''] || 'online'}`} />
            </div>
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
              <button className="sidebar-icon-btn" onClick={() => setShowSettings(true)}>
                <Icon name="settings" />
              </button>
            </div>
          </div>
        </aside>
      )}

      <main className="main-content">
        {activeDm && resolvingChat ? (
          <div className="empty-state">
            <div className="loading" style={{ fontSize: '0.85rem' }}>Loading chat...</div>
          </div>
        ) : activeDm && activeChatId ? (
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
            onMarkRead={markChatRead}
          />
        ) : !activeDm && activeChannel ? (
          <ChannelView
            channel={activeChannel}
            onClose={() => { setActiveServerId(null); setActiveDm(true); navigate('/', { replace: true }) }}
            canManageMessages={canManageMessages}
            userDisplayNames={userDisplayNames}
            onMarkRead={markChannelRead}
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

        {!activeDm && activeServerId && showMemberSidebar && (
          <aside className="member-sidebar">
            <div className="member-sidebar-header">
              Members — {serverMembers.length}
            </div>
            {renderMemberGroups()}
          </aside>
        )}
      </main>

      <VoiceOverlay
        channelName={channels.find(c => c.id === voice.activeChannelId)?.name || ''}
        connected={voice.connected}
        onLeave={voice.leaveChannel}
      />

      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}

      {showSettings && profile && (
        <SettingsView
          profile={profile}
          onClose={() => setShowSettings(false)}
          onProfileUpdate={(p) => setProfile(p)}
        />
      )}

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
          onLeave={() => {
            setShowServerSettings(false)
            setActiveServerId(null)
            setActiveServer(null)
            setActiveChannelId(null)
            setActiveDm(true)
            refetchServers()
            navigate('/', { replace: true })
          }}
        />
      )}
    </div>
  )
}
