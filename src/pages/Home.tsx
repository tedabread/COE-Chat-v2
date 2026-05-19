import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useFriends, ensureDmExists } from '../hooks/useFriends'
import { useCall } from '../hooks/useCall'
import { usePresence } from '../hooks/usePresence'
import { getAvatarColor } from '../utils/avatar'
import { getFontFamily, loadFont } from '../utils/fonts'
import type { Profile } from '../types'
import { FriendSearch } from '../components/FriendSearch'
import { FriendRequests } from '../components/FriendRequests'
import { ChatView } from '../components/ChatView'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Icon } from '../components/Icon'
import { AdminBadge } from '../components/AdminBadge'
import { AdminPanel } from '../components/AdminPanel'

export function Home() {
  const { user, signOut } = useAuth()
  const { friends, removeFriend, refetch: refetchFriends } = useFriends(user?.id)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [activeFriendId, setActiveFriendId] = useState<string | null>(null)
  const [activeFriend, setActiveFriend] = useState<Profile | null>(null)
  const [activeChatId, setActiveChatId] = useState<number | null>(null)
  const [showAdmin, setShowAdmin] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<Profile | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const navigate = useNavigate()

  const call = useCall(user?.id, activeChatId ?? undefined, activeFriend?.id)
  const { userStatuses } = usePresence(user?.id)

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
          if (data.role === 'admin') setIsAdmin(true)
        }
      })
  }, [user])

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

  async function openDm(friend: Profile) {
    setActiveFriendId(friend.id)
    setActiveFriend(friend)
    try {
      const chatId = await ensureDmExists(user!.id, friend.id)
      if (chatId) {
        setActiveChatId(chatId)
      }
      window.history.replaceState(null, '', `/${friend.uid}`)
    } catch (err) {
      console.error('Error in openDm:', err)
    }
  }

  function closeChat() {
    setActiveChatId(null)
    setActiveFriendId(null)
    setActiveFriend(null)
    window.history.replaceState(null, '', '/')
  }

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

  return (
    <div className="home-layout">
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
                    ...(f.role === 'admin' ? { textShadow: `1px 0 0.3px ${f.admin_outline_color || '#cba6f7'}, -1px 0 0.3px ${f.admin_outline_color || '#cba6f7'}, 0 1px 0.3px ${f.admin_outline_color || '#cba6f7'}, 0 -1px 0.3px ${f.admin_outline_color || '#cba6f7'}, 1px 1px 0.3px ${f.admin_outline_color || '#cba6f7'}, -1px 1px 0.3px ${f.admin_outline_color || '#cba6f7'}, -1px -1px 0.3px ${f.admin_outline_color || '#cba6f7'}, 1px -1px 0.3px ${f.admin_outline_color || '#cba6f7'}` } : {}),
                  }}>
                    {f.display_name || f.username}
                    {f.role === 'admin' && <AdminBadge />}
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
              ...(profile?.role === 'admin' ? { textShadow: `1px 0 0.3px ${profile.admin_outline_color || '#cba6f7'}, -1px 0 0.3px ${profile.admin_outline_color || '#cba6f7'}, 0 1px 0.3px ${profile.admin_outline_color || '#cba6f7'}, 0 -1px 0.3px ${profile.admin_outline_color || '#cba6f7'}, 1px 1px 0.3px ${profile.admin_outline_color || '#cba6f7'}, -1px 1px 0.3px ${profile.admin_outline_color || '#cba6f7'}, -1px -1px 0.3px ${profile.admin_outline_color || '#cba6f7'}, 1px -1px 0.3px ${profile.admin_outline_color || '#cba6f7'}` } : {}),
            }}>
              {profile?.display_name || profile?.username}
              {profile?.role === 'admin' && <AdminBadge />}
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

      <main className="main-content">
        {activeChatId ? (
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
        ) : (
          <div className="empty-state">
            <Icon name="message" />
            <h2>Select a friend to start chatting</h2>
          </div>
        )}
      </main>

      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}

      <ConfirmDialog
        open={!!confirmRemove}
        title="Remove friend?"
        message={`Are you sure you want to remove ${confirmRemove?.display_name || confirmRemove?.username} as a friend?`}
        onConfirm={() => confirmRemove && handleRemoveFriend(confirmRemove)}
        onCancel={() => setConfirmRemove(null)}
      />
    </div>
  )
}
