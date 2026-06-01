import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { fetchServerMembers } from '../hooks/useServers'
import type { Server, ServerMember, ServerRole, Profile } from '../types'
import { Icon } from './Icon'
import { AdminBadge } from './AdminBadge'
import { getAvatarColor } from '../utils/avatar'
import { Select } from './Select'

interface Props {
  server: Server
  onClose: () => void
  onUpdate: () => void
  onLeave?: () => void
}

type Tab = 'overview' | 'members' | 'roles' | 'channels'

const defaultPerms = {
  manage_messages: false,
  manage_channels: false,
  manage_server: false,
  kick_members: false,
  ban_members: false,
  manage_roles: false,
}

const permLabels: Record<string, string> = {
  manage_messages: 'Manage Messages (edit/delete any)',
  manage_channels: 'Manage Channels (create/edit/delete)',
  manage_server: 'Manage Server (name, icon, settings)',
  kick_members: 'Kick Members',
  ban_members: 'Ban Members',
  manage_roles: 'Manage Roles',
}

export function ServerSettings({ server, onClose, onUpdate, onLeave }: Props) {
  const [tab, setTab] = useState<Tab>('overview')
  const [name, setName] = useState(server.name)
  const [members, setMembers] = useState<ServerMember[]>([])
  const [roles, setRoles] = useState<ServerRole[]>([])
  const [channels, setChannels] = useState<{ id: number; name: string; type: string }[]>([])
  const [newChannelName, setNewChannelName] = useState('')
  const [newChannelType, setNewChannelType] = useState<'text' | 'voice'>('text')
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [savingName, setSavingName] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | undefined>(undefined)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUserId(data.user.id)
    })
  }, [])

  useEffect(() => {
    fetchServerMembers(server.id).then(setMembers)
    supabase.from('server_roles').select('*').eq('server_id', server.id).order('position').then(({ data }) => {
      if (data) setRoles(data)
    })
    supabase.from('channels').select('*').eq('server_id', server.id).order('position').then(({ data }) => {
      if (data) setChannels(data)
    })
  }, [server.id])

  async function saveName() {
    if (!name.trim()) return
    setSavingName(true)
    const { error } = await supabase.from('servers').update({ name: name.trim() }).eq('id', server.id)
    if (error) setMsg({ type: 'error', text: error.message })
    else { setMsg({ type: 'success', text: 'Server name updated' }); onUpdate() }
    setSavingName(false)
  }

  async function assignRole(memberId: number, roleId: number | null) {
    const { error } = await supabase.from('server_members').update({ role_id: roleId }).eq('id', memberId)
    if (error) setMsg({ type: 'error', text: error.message })
    else { setMsg({ type: 'success', text: 'Role updated' }); fetchServerMembers(server.id).then(setMembers) }
  }

  async function kickMember(memberId: number, _userId: string) {
    if (!confirm('Kick this member?')) return
    const { error } = await supabase.from('server_members').delete().eq('id', memberId)
    if (error) setMsg({ type: 'error', text: error.message })
    else { setMsg({ type: 'success', text: 'Member kicked' }); setMembers(prev => prev.filter(m => m.id !== memberId)) }
  }

  async function createRole() {
    const { data, error } = await supabase.from('server_roles').insert({
      server_id: server.id,
      name: 'New Role',
      permissions: defaultPerms,
      position: roles.length,
    }).select().single()
    if (error) setMsg({ type: 'error', text: error.message })
    else { setRoles(prev => [...prev, data]) }
  }

  async function updateRole(roleId: number, updates: Partial<ServerRole>) {
    const { error } = await supabase.from('server_roles').update(updates).eq('id', roleId)
    if (error) setMsg({ type: 'error', text: error.message })
    else { supabase.from('server_roles').select('*').eq('server_id', server.id).order('position').then(({ data }) => { if (data) setRoles(data) }) }
  }

  async function deleteRole(roleId: number) {
    if (!confirm('Delete this role?')) return
    const { error } = await supabase.from('server_roles').delete().eq('id', roleId)
    if (error) setMsg({ type: 'error', text: error.message })
    else { setRoles(prev => prev.filter(r => r.id !== roleId)) }
  }

  async function createChannel() {
    if (!newChannelName.trim()) return
    const { data, error } = await supabase.from('channels').insert({
      server_id: server.id,
      name: newChannelName.trim().toLowerCase().replace(/\s+/g, '-'),
      type: newChannelType,
      position: channels.length,
    }).select().single()
    if (error) setMsg({ type: 'error', text: error.message })
    else { setChannels(prev => [...prev, data]); setNewChannelName(''); setMsg({ type: 'success', text: 'Channel created' }); onUpdate() }
  }

  async function deleteChannel(channelId: number) {
    if (!confirm('Delete this channel? This cannot be undone.')) return
    const { error } = await supabase.from('channels').delete().eq('id', channelId)
    if (error) setMsg({ type: 'error', text: error.message })
    else { setChannels(prev => prev.filter(c => c.id !== channelId)); onUpdate() }
  }

  async function leaveServer() {
    if (!currentUserId) return
    if (!confirm(`Leave "${server.name}"? Your messages in this server will remain visible to others.`)) return
    const { error } = await supabase.from('server_members').delete().eq('server_id', server.id).eq('user_id', currentUserId)
    if (error) setMsg({ type: 'error', text: error.message })
    else onLeave?.()
  }

  const origin = window.location.origin
  const inviteLink = `${origin}/invite/${server.id}`

  return (
    <div className="settings-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="settings-modal admin-modal">
        <div className="settings-header">
          <h2>Server Settings — {server.name}</h2>
          <button className="settings-close-btn" onClick={onClose}><Icon name="close" /></button>
        </div>
        <div className="admin-tabs">
          {(['overview', 'members', 'roles', 'channels'] as Tab[]).map(t => (
            <button key={t} className={`settings-tab ${tab === t ? 'active' : ''}`} onClick={() => { setTab(t); setMsg(null) }}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div className="settings-scroll" style={{ padding: '1rem 1.5rem' }}>
          {msg && <p className={msg.type === 'success' ? 'settings-success' : 'settings-error'}>{msg.text}</p>}

          {tab === 'overview' && (
            <div className="settings-section">
              <h3>Server Name</h3>
              <div className="field-row">
                <input type="text" value={name} onChange={e => setName(e.target.value)} />
                <button className="settings-btn" onClick={saveName} disabled={savingName}>
                  {savingName ? 'Saving...' : 'Save'}
                </button>
              </div>
              <h3 style={{ marginTop: '1.5rem' }}>Invite Link</h3>
              <div className="field-row">
                <input type="text" value={inviteLink} readOnly onClick={e => (e.target as HTMLInputElement).select()} />
                <button className="settings-btn" onClick={() => { navigator.clipboard.writeText(inviteLink); setMsg({ type: 'success', text: 'Copied!' }) }}>
                  Copy
                </button>
              </div>
              {currentUserId && currentUserId !== server.owner_id && (
                <>
                  <hr style={{ margin: '1.5rem 0', borderColor: 'var(--surface0)' }} />
                  <button className="settings-btn" style={{ background: 'var(--red)', color: 'var(--base)' }} onClick={leaveServer}>
                    Leave Server
                  </button>
                </>
              )}
            </div>
          )}

          {tab === 'members' && (
            <div className="settings-section">
              {members.map(m => {
                const profile = m.profile as Profile | undefined
                const role = m.role as ServerRole | undefined
                return (
                  <div key={m.id} className="admin-field" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0', borderBottom: '1px solid var(--surface0)' }}>
                    {profile?.avatar_url ? (
                      <img src={profile.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: profile ? getAvatarColor(profile.id) : 'var(--surface0)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, color: 'var(--base)' }}>
                        {profile ? (profile.display_name || profile.username || '?')[0].toUpperCase() : '?'}
                      </div>
                    )}
                    <span style={{ flex: 1, fontSize: '0.85rem' }}>
                      {profile?.display_name || profile?.username || 'Unknown'}
                      <AdminBadge role={profile?.role} />
                    </span>
                    {profile?.id !== server.owner_id && (
                      <Select
                        value={String(role?.id || '')}
                        onChange={v => assignRole(m.id, v ? Number(v) : null)}
                        options={[
                          { value: '', label: 'No role' },
                          ...roles.map(r => ({ value: String(r.id), label: r.name })),
                        ]}
                      />
                    )}
                    {profile?.id === server.owner_id && <span className="role-badge role-badge-owner" style={{ fontSize: '0.5rem' }}>OWNER</span>}
                    {profile?.id !== server.owner_id && (
                      <button className="settings-btn" style={{ padding: '0.15rem 0.5rem', fontSize: '0.7rem', background: 'var(--red)', color: 'var(--base)' }} onClick={() => kickMember(m.id, m.user_id)}>
                        Kick
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {tab === 'roles' && (
            <div className="settings-section">
              <button className="settings-btn" onClick={createRole} style={{ marginBottom: '1rem' }}>+ New Role</button>
              {roles.map(r => (
                <div key={r.id} style={{ border: '1px solid var(--surface0)', borderRadius: 8, padding: '0.8rem', marginBottom: '0.5rem' }}>
                  <div className="field-row" style={{ marginBottom: '0.4rem' }}>
                    <input
                      type="text" value={r.name}
                      onChange={e => updateRole(r.id, { name: e.target.value })}
                      style={{ flex: 1, fontSize: '0.85rem', padding: '0.3rem 0.5rem' }}
                    />
                    <input
                      type="color" value={r.color || '#ffffff'}
                      onChange={e => updateRole(r.id, { color: e.target.value })}
                      style={{ width: 30, height: 30, padding: 0, border: 'none' }}
                    />
                    {r.name !== 'Admin' && r.name !== 'Moderator' && r.name !== 'Member' && (
                      <button className="settings-btn" style={{ background: 'var(--red)', color: 'var(--base)', padding: '0.2rem 0.5rem' }} onClick={() => deleteRole(r.id)}>
                        Delete
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    {Object.keys(defaultPerms).map(p => (
                      <label key={p} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={(r.permissions as any)?.[p] || false}
                          onChange={e => updateRole(r.id, { permissions: { ...(r.permissions as any), [p]: e.target.checked } })}
                        />
                        {permLabels[p]}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'channels' && (
            <div className="settings-section">
              <div className="field-row" style={{ marginBottom: '1rem' }}>
                <input
                  type="text" value={newChannelName}
                  onChange={e => setNewChannelName(e.target.value)}
                  placeholder="Channel name"
                  style={{ flex: 1 }}
                />
                <Select
                  value={newChannelType}
                  onChange={v => setNewChannelType(v as 'text' | 'voice')}
                  options={[
                    { value: 'text', label: 'Text' },
                    { value: 'voice', label: 'Voice' },
                  ]}
                  className="channel-type-select"
                />
                <button className="settings-btn" onClick={createChannel} disabled={!newChannelName.trim()}>Create</button>
              </div>
              {channels.map(ch => (
                <div key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0', borderBottom: '1px solid var(--surface0)' }}>
                  <span style={{ fontSize: '0.85rem', flex: 1 }}>#{ch.name} ({ch.type})</span>
                  <button className="settings-btn" style={{ background: 'var(--red)', color: 'var(--base)', padding: '0.15rem 0.5rem', fontSize: '0.7rem' }} onClick={() => deleteChannel(ch.id)}>
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
