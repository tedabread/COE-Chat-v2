import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { getAvatarColor } from '../utils/avatar'
import { getFontFamily } from '../utils/fonts'
import type { Profile, Message, FriendRequest, Chat, Call, Server } from '../types'
import { Icon } from './Icon'
import { AdminBadge } from './AdminBadge'
import { Select } from './Select'

type Tab = 'profiles' | 'friend_requests' | 'chats' | 'calls' | 'messages' | 'servers'

interface Props {
  onClose: () => void
}

const TAB_LABELS: Record<Tab, string> = {
  profiles: 'Profiles',
  friend_requests: 'Friend Requests',
  chats: 'Chats',
  calls: 'Calls',
  messages: 'Messages',
  servers: 'Servers',
}

export function AdminPanel({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>('profiles')
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Table data
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [requests, setRequests] = useState<FriendRequest[]>([])
  const [chats, setChats] = useState<Chat[]>([])
  const [calls, setCalls] = useState<Call[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [servers, setServers] = useState<Server[]>([])

  // Editing state
  const [editingProfile, setEditingProfile] = useState<string | null>(null)
  const [editProfileForm, setEditProfileForm] = useState<Partial<Profile>>({})
  const [search, setSearch] = useState('')

  useEffect(() => { loadTab(tab) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadTab(t: Tab) {
    setLoading(true)
    setMsg(null)
    try {
      switch (t) {
        case 'profiles': {
          const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
          if (data) setProfiles(data)
          break
        }
        case 'friend_requests': {
          const { data } = await supabase.from('friend_requests').select('*, sender:sender_id(id, username, uid), receiver:receiver_id(id, username, uid)').order('created_at', { ascending: false })
          if (data) setRequests(data as unknown as FriendRequest[])
          break
        }
        case 'chats': {
          const { data } = await supabase.from('chats').select('*').order('created_at', { ascending: false })
          if (data) setChats(data)
          break
        }
        case 'calls': {
          const { data } = await supabase.from('calls').select('*').order('created_at', { ascending: false })
          if (data) setCalls(data as Call[])
          break
        }
        case 'messages': {
          const { data } = await supabase.from('messages').select('*, profile:profiles!sender_id(id, username, uid, display_name, avatar_url, name_font, name_color, role, admin_outline_color)').order('created_at', { ascending: false }).limit(200)
          if (data) setMessages(data as unknown as Message[])
          break
        }
        case 'servers': {
          const { data } = await supabase.from('servers').select('*').order('created_at', { ascending: false })
          if (data) setServers(data)
          break
        }
      }
    } catch (err) {
      setMsg({ type: 'error', text: `Failed to load: ${(err as Error).message}` })
    }
    setLoading(false)
  }

  async function updateProfile(id: string) {
    const { error } = await supabase.from('profiles').update(editProfileForm).eq('id', id)
    if (error) setMsg({ type: 'error', text: error.message })
    else {
      setMsg({ type: 'success', text: 'Profile updated' })
      setEditingProfile(null)
      loadTab('profiles')
    }
  }

  async function deleteRow(table: string, id: number | string) {
    if (!confirm(`Delete this ${table.slice(0, -1)}?`)) return
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) setMsg({ type: 'error', text: error.message })
    else {
      setMsg({ type: 'success', text: `${table.slice(0, -1)} deleted` })
      loadTab(tab)
    }
  }

  async function endCall(id: number) {
    if (!confirm('End this call?')) return
    const { error } = await supabase.from('calls').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', id)
    if (error) setMsg({ type: 'error', text: error.message })
    else {
      setMsg({ type: 'success', text: 'Call ended' })
      loadTab('calls')
    }
  }

  function startEditProfile(p: Profile) {
    setEditingProfile(p.id)
    setEditProfileForm({
      username: p.username,
      uid: p.uid,
      display_name: p.display_name,
      role: p.role || 'user',
      name_color: p.name_color,
      banner_color: p.banner_color,
      admin_outline_color: p.admin_outline_color,
      status: p.status,
    })
  }

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const filteredProfiles = profiles.filter(p => {
    if (!search) return true
    const q = search.toLowerCase()
    return p.username?.toLowerCase().includes(q) || p.display_name?.toLowerCase().includes(q) || p.uid?.toLowerCase().includes(q) || p.id?.toLowerCase().includes(q)
  })

  return (
    <div className="settings-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="settings-modal admin-modal">
        <div className="settings-header">
          <h2>Admin Panel — Table Editor</h2>
          <button className="settings-close-btn" onClick={onClose}><Icon name="close" /></button>
        </div>
        <div className="admin-tabs">
          {(Object.keys(TAB_LABELS) as Tab[]).map(t => (
            <button key={t} className={`settings-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
        <div className="settings-scroll" style={{ padding: '1rem 1.5rem' }}>
          {msg && <p className={msg.type === 'success' ? 'settings-success' : 'settings-error'}>{msg.text}</p>}

          {tab === 'profiles' && (
            <div>
              <div className="admin-table-toolbar">
                <input className="admin-search" placeholder="Search profiles..." value={search} onChange={e => setSearch(e.target.value)} />
                <button className="admin-refresh-btn" onClick={() => loadTab('profiles')}><Icon name="refresh" /> Refresh</button>
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead><tr><th>Avatar</th><th>Username</th><th>UID</th><th>Display Name</th><th>Role</th><th>Created</th><th>Actions</th></tr></thead>
                  <tbody>
                    {filteredProfiles.map(p => editingProfile === p.id ? (
                      <tr key={p.id}>
                        <td colSpan={7} style={{ padding: '0.5rem' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                            <div className="field-row">
                              <label style={{ fontSize: '0.7rem', minWidth: 80 }}>Username</label>
                              <input value={editProfileForm.username || ''} onChange={e => setEditProfileForm(f => ({ ...f, username: e.target.value }))} style={{ flex: 1, fontSize: '0.8rem', padding: '0.2rem 0.4rem' }} />
                            </div>
                            <div className="field-row">
                              <label style={{ fontSize: '0.7rem', minWidth: 80 }}>UID</label>
                              <input value={editProfileForm.uid || ''} onChange={e => setEditProfileForm(f => ({ ...f, uid: e.target.value }))} style={{ flex: 1, fontSize: '0.8rem', padding: '0.2rem 0.4rem' }} />
                            </div>
                            <div className="field-row">
                              <label style={{ fontSize: '0.7rem', minWidth: 80 }}>Display Name</label>
                              <input value={editProfileForm.display_name || ''} onChange={e => setEditProfileForm(f => ({ ...f, display_name: e.target.value || null }))} style={{ flex: 1, fontSize: '0.8rem', padding: '0.2rem 0.4rem' }} />
                            </div>
                            <div className="field-row">
                              <label style={{ fontSize: '0.7rem', minWidth: 80 }}>Role</label>
                              <Select
                                value={editProfileForm.role || 'user'}
                                onChange={v => setEditProfileForm(f => ({ ...f, role: v }))}
                                options={[
                                  { value: 'user', label: 'User' },
                                  { value: 'moderator', label: 'Moderator' },
                                  { value: 'admin', label: 'Admin' },
                                ]}
                              />
                            </div>
                            <div className="field-row">
                              <label style={{ fontSize: '0.7rem', minWidth: 80 }}>Name Color</label>
                              <input type="color" value={editProfileForm.name_color || '#89b4fa'} onChange={e => setEditProfileForm(f => ({ ...f, name_color: e.target.value }))} style={{ width: 36, height: 28, padding: 0, border: 'none' }} />
                            </div>
                            <div className="field-row">
                              <label style={{ fontSize: '0.7rem', minWidth: 80 }}>Banner Color</label>
                              <input type="color" value={editProfileForm.banner_color || '#313244'} onChange={e => setEditProfileForm(f => ({ ...f, banner_color: e.target.value }))} style={{ width: 36, height: 28, padding: 0, border: 'none' }} />
                            </div>
                            <div className="field-row">
                              <label style={{ fontSize: '0.7rem', minWidth: 80 }}>Outline Color</label>
                              <input type="color" value={editProfileForm.admin_outline_color || '#cba6f7'} onChange={e => setEditProfileForm(f => ({ ...f, admin_outline_color: e.target.value }))} style={{ width: 36, height: 28, padding: 0, border: 'none' }} />
                            </div>
                            <div className="field-row">
                              <label style={{ fontSize: '0.7rem', minWidth: 80 }}>Status</label>
                              <input value={editProfileForm.status || ''} onChange={e => setEditProfileForm(f => ({ ...f, status: e.target.value || null }))} style={{ flex: 1, fontSize: '0.8rem', padding: '0.2rem 0.4rem' }} />
                            </div>
                            <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.3rem' }}>
                              <button className="settings-btn" style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }} onClick={() => updateProfile(p.id)}>Save</button>
                              <button className="settings-btn" style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }} onClick={() => setEditingProfile(null)}>Cancel</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={p.id}>
                        <td>
                          {p.avatar_url ? <img src={p.avatar_url} alt="" className="admin-avatar" />
                            : <div className="admin-avatar admin-avatar-default" style={{ backgroundColor: getAvatarColor(p.id) }}>{(p.display_name || p.username || '?')[0].toUpperCase()}</div>}
                        </td>
                        <td>{p.username}</td>
                        <td>#{p.uid}</td>
                        <td>
                          <span style={{ fontFamily: p.name_font ? getFontFamily(p.name_font) : undefined, color: p.name_color || undefined }}>
                            {p.display_name || '-'}
                          </span>
                        </td>
                        <td><span className={`admin-role-badge admin-role-${p.role || 'user'}`}>{p.role || 'user'}</span></td>
                        <td>{fmtDate(p.created_at)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.2rem' }}>
                            <button className="settings-btn" style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem' }} onClick={() => startEditProfile(p)}>Edit</button>
                            <button className="settings-btn" style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem', background: 'var(--red)', color: 'var(--base)' }} onClick={() => deleteRow('profiles', p.id)}>Del</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {loading && <p className="admin-loading">Loading...</p>}
            </div>
          )}

          {tab === 'friend_requests' && (
            <div>
              <div className="admin-table-toolbar">
                <button className="admin-refresh-btn" onClick={() => loadTab('friend_requests')}><Icon name="refresh" /> Refresh</button>
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead><tr><th>ID</th><th>Sender</th><th>Receiver</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
                  <tbody>
                    {requests.map(r => (
                      <tr key={r.id}>
                        <td><code>{r.id}</code></td>
                        <td>{r.sender ? `${r.sender.username}#${r.sender.uid}` : r.sender_id.slice(0, 8)}</td>
                        <td>{r.receiver ? `${r.receiver.username}#${r.receiver.uid}` : r.receiver_id.slice(0, 8)}</td>
                        <td><span className={`admin-role-badge admin-role-${r.status}`}>{r.status}</span></td>
                        <td>{fmtDate(r.created_at)}</td>
                        <td><button className="settings-btn" style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem', background: 'var(--red)', color: 'var(--base)' }} onClick={() => deleteRow('friend_requests', r.id)}>Del</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {loading && <p className="admin-loading">Loading...</p>}
            </div>
          )}

          {tab === 'chats' && (
            <div>
              <div className="admin-table-toolbar">
                <button className="admin-refresh-btn" onClick={() => loadTab('chats')}><Icon name="refresh" /> Refresh</button>
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead><tr><th>ID</th><th>Created By</th><th>Created</th><th>Actions</th></tr></thead>
                  <tbody>
                    {chats.map(c => (
                      <tr key={c.id}>
                        <td><code>{c.id}</code></td>
                        <td><code>{c.created_by.slice(0, 12)}...</code></td>
                        <td>{fmtDate(c.created_at)}</td>
                        <td><button className="settings-btn" style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem', background: 'var(--red)', color: 'var(--base)' }} onClick={() => deleteRow('chats', c.id)}>Del</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {loading && <p className="admin-loading">Loading...</p>}
            </div>
          )}

          {tab === 'calls' && (
            <div>
              <div className="admin-table-toolbar">
                <button className="admin-refresh-btn" onClick={() => loadTab('calls')}><Icon name="refresh" /> Refresh</button>
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead><tr><th>ID</th><th>Chat</th><th>Caller</th><th>Receiver</th><th>Status</th><th>Channel</th><th>Created</th><th>Ended</th><th>Actions</th></tr></thead>
                  <tbody>
                    {calls.map(c => {
                      const statusColors: Record<string, string> = { ringing: '#f9e2af', active: '#a6e3a1', ended: '#6c7086', missed: '#f38ba8' }
                      return (
                        <tr key={c.id}>
                          <td><code>{c.id}</code></td>
                          <td><code>{c.chat_id}</code></td>
                          <td><code>{c.caller_id.slice(0, 8)}...</code></td>
                          <td><code>{c.receiver_id.slice(0, 8)}...</code></td>
                          <td><span style={{ color: statusColors[c.status] || 'var(--text)' }}>{c.status}</span></td>
                          <td><code>{c.channel_name}</code></td>
                          <td>{fmtDate(c.created_at)}</td>
                          <td>{c.ended_at ? fmtDate(c.ended_at) : '-'}</td>
                          <td>
                            {c.status !== 'ended' ? (
                              <button className="settings-btn" style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem', background: 'var(--peach)', color: 'var(--base)' }} onClick={() => endCall(c.id)}>End</button>
                            ) : (
                              <button className="settings-btn" style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem', background: 'var(--red)', color: 'var(--base)' }} onClick={() => deleteRow('calls', c.id)}>Del</button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {loading && <p className="admin-loading">Loading...</p>}
            </div>
          )}

          {tab === 'messages' && (
            <div>
              <div className="admin-table-toolbar">
                <button className="admin-refresh-btn" onClick={() => loadTab('messages')}><Icon name="refresh" /> Refresh</button>
              </div>
              <div className="admin-table-wrap" style={{ maxHeight: '500px' }}>
                <table className="admin-table">
                  <thead><tr><th>ID</th><th>Sender</th><th>Content</th><th>Channel</th><th>Created</th><th>Actions</th></tr></thead>
                  <tbody>
                    {messages.map(m => {
                      const sender = (m as Message & { profile: Profile }).profile
                      return (
                        <tr key={m.id}>
                          <td><code>{m.id}</code></td>
                          <td>
                            <span style={{ fontFamily: sender?.name_font ? getFontFamily(sender.name_font) : undefined, color: sender?.name_color || undefined }}>
                              {sender ? `${sender.display_name || sender.username}#${sender.uid}` : m.sender_id.slice(0, 8)}
                            </span>
                            <AdminBadge role={sender?.role} />
                          </td>
                          <td className="admin-cell-preview">{m.content ? m.content.slice(0, 80) : (m.file_name || '(file)')}{m.content && m.content.length > 80 ? '…' : ''}</td>
                          <td>{m.channel_id ? `ch#${m.channel_id}` : `dm#${m.chat_id}`}</td>
                          <td>{fmtDate(m.created_at)}</td>
                          <td><button className="settings-btn" style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem', background: 'var(--red)', color: 'var(--base)' }} onClick={() => deleteRow('messages', m.id)}>Del</button></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {loading && <p className="admin-loading">Loading...</p>}
            </div>
          )}

          {tab === 'servers' && (
            <div>
              <div className="admin-table-toolbar">
                <button className="admin-refresh-btn" onClick={() => loadTab('servers')}><Icon name="refresh" /> Refresh</button>
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead><tr><th>ID</th><th>Name</th><th>Owner</th><th>Created</th><th>Actions</th></tr></thead>
                  <tbody>
                    {servers.map(s => (
                      <tr key={s.id}>
                        <td><code>{s.id}</code></td>
                        <td>{s.name}</td>
                        <td><code>{s.owner_id.slice(0, 12)}...</code></td>
                        <td>{fmtDate(s.created_at)}</td>
                        <td><button className="settings-btn" style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem', background: 'var(--red)', color: 'var(--base)' }} onClick={() => deleteRow('servers', s.id)}>Del</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {loading && <p className="admin-loading">Loading...</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
