import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { getAvatarColor } from '../utils/avatar'
import { getFontFamily } from '../utils/fonts'
import type { Profile, Message, FriendRequest, Chat, Call } from '../types'
import { Icon } from './Icon'
import { AdminBadge } from './AdminBadge'

type Tab = 'dashboard' | 'users' | 'requests' | 'chats' | 'calls' | 'database'

interface Props {
  onClose: () => void
}

interface DashboardStats {
  users: number
  requests: number
  chats: number
  calls: number
}

export function AdminPanel({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [stats, setStats] = useState<DashboardStats>({ users: 0, requests: 0, chats: 0, calls: 0 })
  const [users, setUsers] = useState<Profile[]>([])
  const [requests, setRequests] = useState<FriendRequest[]>([])
  const [chats, setChats] = useState<Chat[]>([])
  const [calls, setCalls] = useState<Call[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null)
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null)
  const [chatMembers, setChatMembers] = useState<Profile[]>([])
  const [chatMessages, setChatMessages] = useState<Message[]>([])
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [rawTables, setRawTables] = useState<Record<string, any[]>>({})
  const [rawLoading, setRawLoading] = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const results = await Promise.allSettled([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('friend_requests').select('*', { count: 'exact', head: true }),
      supabase.from('chats').select('*', { count: 'exact', head: true }),
      supabase.from('calls').select('*', { count: 'exact', head: true }),
    ])
    setStats({
      users: (results[0] as any).value?.count ?? 0,
      requests: (results[1] as any).value?.count ?? 0,
      chats: (results[2] as any).value?.count ?? 0,
      calls: (results[3] as any).value?.count ?? 0,
    })
    setLoading(false)
  }

  async function loadUsers() {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
    if (data) setUsers(data)
    setLoading(false)
  }

  async function loadRequests() {
    setLoading(true)
    const { data } = await supabase
      .from('friend_requests')
      .select('*, sender:sender_id(id, username, uid), receiver:receiver_id(id, username, uid)')
      .order('created_at', { ascending: false })
    if (data) setRequests(data as unknown as FriendRequest[])
    setLoading(false)
  }

  async function loadChats() {
    setLoading(true)
    const { data } = await supabase.from('chats').select('*').order('created_at', { ascending: false })
    if (data) setChats(data)
    setLoading(false)
  }

  async function loadCalls() {
    setLoading(true)
    const { data } = await supabase.from('calls').select('*').order('created_at', { ascending: false })
    if (data) setCalls(data as Call[])
    setLoading(false)
  }

  function switchTab(t: Tab) {
    setTab(t)
    setSearch('')
    setSelectedUser(null)
    setSelectedChat(null)
    setMsg(null)
    if (t === 'users') loadUsers()
    else if (t === 'requests') loadRequests()
    else if (t === 'chats') loadChats()
    else if (t === 'calls') loadCalls()
    else if (t === 'database') loadRawData()
  }

  async function updateUser(userId: string, updates: Partial<Profile>) {
    setMsg(null)
    const { error } = await supabase.from('profiles').update(updates).eq('id', userId)
    if (error) setMsg({ type: 'error', text: error.message })
    else {
      setMsg({ type: 'success', text: 'User updated' })
      loadUsers()
    }
  }

  async function deleteMessage(msgId: number) {
    if (!confirm('Delete this message?')) return
    const { error } = await supabase.from('messages').delete().eq('id', msgId)
    if (error) setMsg({ type: 'error', text: error.message })
    else {
      setMsg({ type: 'success', text: 'Message deleted' })
      setSelectedChat(null)
      loadChats()
    }
  }

  async function endCall(callId: number) {
    if (!confirm('End this call?')) return
    const { error } = await supabase.from('calls').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', callId)
    if (error) setMsg({ type: 'error', text: error.message })
    else {
      setMsg({ type: 'success', text: 'Call ended' })
      loadCalls()
    }
  }

  async function loadRawData() {
    setRawLoading(true)
    const tables = ['profiles', 'messages', 'chats', 'chat_members', 'friend_requests', 'calls']
    const results: Record<string, any[]> = {}
    for (const t of tables) {
      const { data } = await supabase.from(t).select('*').limit(50)
      results[t] = data || []
    }
    setRawTables(results)
    setRawLoading(false)
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const filteredUsers = users.filter(u => {
    if (!search) return true
    const q = search.toLowerCase()
    return u.username?.toLowerCase().includes(q) || u.display_name?.toLowerCase().includes(q) || u.uid?.toLowerCase().includes(q)
  })

  const filteredRequests = requests.filter(r => {
    if (!search) return true
    const q = search.toLowerCase()
    return r.sender?.username?.toLowerCase().includes(q) || r.receiver?.username?.toLowerCase().includes(q)
  })

  function renderTab() {
    switch (tab) {
      case 'dashboard': return renderDashboard()
      case 'users': return renderUsers()
      case 'requests': return renderRequests()
      case 'chats': return renderChats()
      case 'calls': return renderCalls()
      case 'database': return renderDatabase()
    }
  }

  function renderDashboard() {
    return (
      <div className="admin-dashboard">
        <div className="admin-stat-grid">
          {(['users', 'requests', 'chats', 'calls'] as (keyof DashboardStats)[]).map(k => (
            <div key={k} className="admin-stat-card">
              <div className="admin-stat-number">{stats[k]}</div>
              <div className="admin-stat-label">{k.charAt(0).toUpperCase() + k.slice(1)}</div>
            </div>
          ))}
        </div>
        {loading && <p className="admin-loading">Loading...</p>}
      </div>
    )
  }

  function renderUsers() {
    if (selectedUser) {
      const u = selectedUser
      return (
        <div className="admin-detail">
          <button className="admin-back-btn" onClick={() => setSelectedUser(null)}><Icon name="back" /> Back</button>
          <h3>{u.display_name || u.username}#{u.uid}</h3>
          <div className="admin-detail-fields">
            <div className="admin-field"><label>ID</label><code>{u.id}</code></div>
            <div className="admin-field">
              <label>Username</label>
              <input defaultValue={u.username} onBlur={e => updateUser(u.id, { username: e.target.value })} />
            </div>
            <div className="admin-field">
              <label>UID</label>
              <input defaultValue={u.uid} onBlur={e => updateUser(u.id, { uid: e.target.value })} />
            </div>
            <div className="admin-field">
              <label>Display Name</label>
              <input defaultValue={u.display_name || ''} onBlur={e => updateUser(u.id, { display_name: e.target.value || null })} />
            </div>
            <div className="admin-field">
              <label>Role</label>
              <select defaultValue={u.role || 'user'} onChange={e => updateUser(u.id, { role: e.target.value })}>
                <option value="user">User</option>
                <option value="moderator">Moderator</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="admin-field">
              <label>Outline Color</label>
              <input type="color" defaultValue={u.admin_outline_color || '#cba6f7'} onBlur={e => updateUser(u.id, { admin_outline_color: e.target.value })} />
            </div>
            <div className="admin-field">
              <label>Name Color</label>
              <input type="color" defaultValue={u.name_color || '#89b4fa'} onBlur={e => updateUser(u.id, { name_color: e.target.value })} />
            </div>
            <div className="admin-field">
              <label>Banner Color</label>
              <input type="color" defaultValue={u.banner_color || '#313244'} onBlur={e => updateUser(u.id, { banner_color: e.target.value })} />
            </div>
            <div className="admin-field">
              <label>Status</label>
              <input defaultValue={u.status || ''} onBlur={e => updateUser(u.id, { status: e.target.value || null })} />
            </div>
            <div className="admin-field">
              <label>Created</label>
              <span>{formatDate(u.created_at)}</span>
            </div>
          </div>
        </div>
      )
    }
    return (
      <>
        <div className="admin-table-toolbar">
          <input className="admin-search" placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} />
          <button className="admin-refresh-btn" onClick={loadUsers}><Icon name="refresh" /> Refresh</button>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Avatar</th><th>Username</th><th>UID</th><th>Display Name</th><th>Role</th><th>Created</th></tr></thead>
            <tbody>
              {filteredUsers.map(u => (
                <tr key={u.id} className="admin-row-clickable" onClick={() => setSelectedUser(u)}>
                  <td>
                    {u.avatar_url ? <img src={u.avatar_url} alt="" className="admin-avatar" />
                      : <div className="admin-avatar admin-avatar-default" style={{ backgroundColor: getAvatarColor(u.id) }}>{(u.display_name || u.username || '?')[0].toUpperCase()}</div>}
                  </td>
                  <td>{u.username}</td>
                  <td>#{u.uid}</td>
                  <td>
                    <span style={{
                      fontFamily: u.name_font ? getFontFamily(u.name_font) : undefined,
                      color: u.name_color || undefined,
                      ...(u.role === 'admin' ? { textShadow: `1px 0 0.3px ${u.admin_outline_color || '#cba6f7'}, -1px 0 0.3px ${u.admin_outline_color || '#cba6f7'}, 0 1px 0.3px ${u.admin_outline_color || '#cba6f7'}, 0 -1px 0.3px ${u.admin_outline_color || '#cba6f7'}, 1px 1px 0.3px ${u.admin_outline_color || '#cba6f7'}, -1px 1px 0.3px ${u.admin_outline_color || '#cba6f7'}, -1px -1px 0.3px ${u.admin_outline_color || '#cba6f7'}, 1px -1px 0.3px ${u.admin_outline_color || '#cba6f7'}` } : {}),
                    }}>
                      {u.display_name || '-'}
                    </span>
                  </td>
                  <td><span className={`admin-role-badge admin-role-${u.role || 'user'}`}>{u.role || 'user'}</span></td>
                  <td>{formatDate(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && <p className="admin-loading">Loading...</p>}
      </>
    )
  }

  function renderRequests() {
    return (
      <>
        <div className="admin-table-toolbar">
          <input className="admin-search" placeholder="Search requests..." value={search} onChange={e => setSearch(e.target.value)} />
          <button className="admin-refresh-btn" onClick={loadRequests}><Icon name="refresh" /> Refresh</button>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>ID</th><th>Sender</th><th>Receiver</th><th>Status</th><th>Created</th></tr></thead>
            <tbody>
              {filteredRequests.map(r => (
                <tr key={r.id}>
                  <td><code>{r.id}</code></td>
                  <td>{r.sender ? `${r.sender.username}#${r.sender.uid}` : r.sender_id}</td>
                  <td>{r.receiver ? `${r.receiver.username}#${r.receiver.uid}` : r.receiver_id}</td>
                  <td><span className={`admin-role-badge admin-role-${r.status}`}>{r.status}</span></td>
                  <td>{formatDate(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && <p className="admin-loading">Loading...</p>}
      </>
    )
  }

  async function loadChatDetail(chat: Chat) {
    setSelectedChat(chat)
    setLoading(true)
    const [membersRes, messagesRes] = await Promise.all([
      supabase.from('chat_members').select('user_id').eq('chat_id', chat.id),
      supabase.from('messages').select('*, profile:profiles!sender_id(*)').eq('chat_id', chat.id).order('created_at', { ascending: false }).limit(200),
    ])
    if (membersRes.data) {
      const userIds = membersRes.data.map(m => m.user_id)
      if (userIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('*').in('id', userIds)
        setChatMembers(profiles || [])
      } else {
        setChatMembers([])
      }
    }
    if (messagesRes.data) setChatMessages(messagesRes.data as unknown as Message[])
    setLoading(false)
  }

  function renderChats() {
    if (selectedChat) {
      return (
        <div className="admin-detail">
          <button className="admin-back-btn" onClick={() => { setSelectedChat(null); setChatMessages([]); setChatMembers([]) }}><Icon name="back" /> Back</button>
          <h3>Chat #{selectedChat.id}</h3>
          <div className="admin-detail-fields">
            <div className="admin-field"><label>ID</label><code>{selectedChat.id}</code></div>
            <div className="admin-field">
              <label>Participants</label>
              <div>
                {chatMembers.length === 0 ? <span style={{ color: 'var(--overlay0)' }}>None</span> : chatMembers.map(p => (
                  <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', marginRight: '0.5rem', marginBottom: '0.25rem', fontFamily: p.name_font ? getFontFamily(p.name_font) : undefined, color: p.name_color || undefined }}>
                    {p.display_name || p.username}#{p.uid}
                  </span>
                ))}
              </div>
            </div>
            <div className="admin-field"><label>Created By</label><code>{selectedChat.created_by}</code></div>
            <div className="admin-field"><label>Created</label><span>{formatDate(selectedChat.created_at)}</span></div>
          </div>
          <h4 style={{ margin: '1rem 0 0.5rem' }}>Messages ({chatMessages.length})</h4>
          {loading ? (
            <p className="admin-loading">Loading...</p>
          ) : chatMessages.length === 0 ? (
            <p style={{ color: 'var(--overlay0)' }}>No messages</p>
          ) : (
            <div className="admin-table-wrap" style={{ maxHeight: '400px' }}>
              <table className="admin-table">
                <thead><tr><th>ID</th><th>Sender</th><th>Content</th><th>File</th><th>Created</th><th>Action</th></tr></thead>
                <tbody>
                  {chatMessages.map(m => {
                    const sender = (m as any).profile
                    return (
                      <tr key={m.id}>
                        <td><code>{m.id}</code></td>
                        <td>
                          <span style={{ fontFamily: sender?.name_font ? getFontFamily(sender.name_font) : undefined, color: sender?.name_color || undefined }}>
                            {sender ? `${sender.display_name || sender.username}#${sender.uid}` : m.sender_id.slice(0, 8)}
                          </span>
                          {sender?.role === 'admin' && <AdminBadge />}
                        </td>
                        <td className="admin-cell-preview">{m.content ? m.content.slice(0, 80) : '(empty)'}{m.content && m.content.length > 80 ? '…' : ''}</td>
                        <td>{m.file_url ? 'Yes' : 'No'}</td>
                        <td>{formatDate(m.created_at)}</td>
                        <td><button className="admin-delete-btn" style={{ padding: '0.15rem 0.4rem', fontSize: '0.7rem' }} onClick={() => deleteMessage(m.id)}>Delete</button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )
    }
    return (
      <>
        <div className="admin-table-toolbar">
          <button className="admin-refresh-btn" onClick={loadChats}><Icon name="refresh" /> Refresh</button>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>ID</th><th>Participants</th><th>Created By</th><th>Created</th></tr></thead>
            <tbody>
              {chats.map(c => (
                <tr key={c.id} className="admin-row-clickable" onClick={() => loadChatDetail(c)}>
                  <td><code>{c.id}</code></td>
                  <td><span style={{ color: 'var(--overlay0)', fontSize: '0.8rem' }}>Click to view</span></td>
                  <td><code>{c.created_by.slice(0, 12)}...</code></td>
                  <td>{formatDate(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && <p className="admin-loading">Loading...</p>}
      </>
    )
  }

  function renderCalls() {
    const statusColors: Record<string, string> = { ringing: '#f9e2af', active: '#a6e3a1', ended: '#6c7086', missed: '#f38ba8' }
    return (
      <>
        <div className="admin-table-toolbar">
          <button className="admin-refresh-btn" onClick={loadCalls}><Icon name="refresh" /> Refresh</button>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>ID</th><th>Chat</th><th>Caller</th><th>Receiver</th><th>Status</th><th>Channel</th><th>Created</th><th>Ended</th><th>Action</th></tr></thead>
            <tbody>
              {calls.map(c => (
                <tr key={c.id}>
                  <td><code>{c.id}</code></td><td><code>{c.chat_id}</code></td>
                  <td><code>{c.caller_id.slice(0, 8)}...</code></td><td><code>{c.receiver_id.slice(0, 8)}...</code></td>
                  <td><span className="admin-call-status" style={{ color: statusColors[c.status] || 'var(--text)' }}>{c.status}</span></td>
                  <td><code>{c.channel_name}</code></td>
                  <td>{formatDate(c.created_at)}</td><td>{c.ended_at ? formatDate(c.ended_at) : '-'}</td>
                  <td>{c.status !== 'ended' ? <button className="admin-delete-btn" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }} onClick={() => endCall(c.id)}>End</button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && <p className="admin-loading">Loading...</p>}
      </>
    )
  }

  function renderDatabase() {
    const tables = ['profiles', 'messages', 'chats', 'chat_members', 'friend_requests', 'calls']
    return (
      <div style={{ padding: '1rem' }}>
        <div className="admin-table-toolbar">
          <button className="admin-refresh-btn" onClick={loadRawData}><Icon name="refresh" /> Refresh</button>
        </div>
        {rawLoading ? (
          <p className="admin-loading">Loading...</p>
        ) : Object.keys(rawTables).length === 0 ? (
          <p style={{ color: 'var(--overlay0)' }}>Click Refresh to load data</p>
        ) : (
          tables.map(name => {
            const rows = rawTables[name] || []
            return (
              <details key={name} style={{ marginBottom: '1rem' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--text)', marginBottom: '0.5rem' }}>
                  {name} ({rows.length} rows)
                </summary>
                <pre style={{ fontSize: '0.75rem', maxHeight: '300px', overflow: 'auto', background: 'var(--surface0)', padding: '0.5rem', borderRadius: '4px', color: 'var(--subtext1)' }}>
                  {JSON.stringify(rows, null, 2)}
                </pre>
              </details>
            )
          })
        )}
      </div>
    )
  }

  return (
    <div className="settings-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="settings-modal admin-modal">
        <div className="settings-header">
          <h2>Admin Panel</h2>
          <button className="settings-close-btn" onClick={onClose}><Icon name="close" /></button>
        </div>
        <div className="admin-tabs">
          {(['dashboard', 'users', 'requests', 'chats', 'calls', 'database'] as Tab[]).map(t => (
            <button key={t} className={`settings-tab ${tab === t ? 'active' : ''}`} onClick={() => switchTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div className="settings-scroll">
          {msg && <div style={{ padding: '0 1.5rem' }}><p className={msg.type === 'success' ? 'settings-success' : 'settings-error'}>{msg.text}</p></div>}
          {renderTab()}
        </div>
      </div>
    </div>
  )
}