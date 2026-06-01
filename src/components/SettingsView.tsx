import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useTheme, themes, accentPresets } from '../hooks/useTheme'
import { loadFont, getFontFamily } from '../utils/fonts'
import type { Profile } from '../types'
import { Icon } from './Icon'
import { FontSelect } from './FontSelect'
import { AdminBadge } from './AdminBadge'

type Tab = 'account' | 'profile' | 'appearance' | 'about'

interface Props {
  profile: Profile
  onClose: () => void
  onProfileUpdate: (p: Profile) => void
}

export function SettingsView({ profile, onClose, onProfileUpdate }: Props) {
  const { user } = useAuth()
  const { theme, setTheme, accent, setAccent } = useTheme()
  const [tab, setTab] = useState<Tab>('account')
  const [creator, setCreator] = useState<Profile | null>(null)

  const [email, setEmail] = useState(user?.email ?? '')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [username, setUsername] = useState(profile.username)
  const [uid, setUid] = useState(profile.uid)

  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? '')
  const [displayName, setDisplayName] = useState(profile.display_name ?? '')
  const [nameFont, setNameFont] = useState(profile.name_font ?? 'GoogleSansCodeNF')
  const [nameColor, setNameColor] = useState(profile.name_color ?? '#89b4fa')
  const [bannerColor, setBannerColor] = useState(profile.banner_color ?? '#313244')
  const [status, setStatus] = useState(profile.status ?? '')
  const [messageFont, setMessageFont] = useState(profile.message_font ?? 'GoogleSansCodeNF')

  const [saving, setSaving] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  useEffect(() => {
    loadFont(nameFont)
    loadFont(messageFont)
  }, [])

  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .eq('username', 'pidgeon-religion')
      .maybeSingle()
      .then(({ data }) => {
        if (data) setCreator(data)
      })
  }, [])

  async function updateEmail() {
    setSaving('email')
    setMsg(null)
    const { error } = await supabase.auth.updateUser({ email })
    if (error) setMsg({ type: 'error', text: error.message })
    else setMsg({ type: 'success', text: 'Confirmation email sent. Check your inbox.' })
    setSaving(null)
  }

  async function updatePassword() {
    if (newPassword !== confirmPassword) {
      setMsg({ type: 'error', text: 'Passwords do not match' })
      return
    }
    if (newPassword.length < 6) {
      setMsg({ type: 'error', text: 'Password must be at least 6 characters' })
      return
    }
    setSaving('password')
    setMsg(null)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) setMsg({ type: 'error', text: error.message })
    else {
      setMsg({ type: 'success', text: 'Password updated successfully' })
      setNewPassword('')
      setConfirmPassword('')
    }
    setSaving(null)
  }

  async function updateUsername() {
    if (!username.trim()) return
    setSaving('username')
    setMsg(null)
    const { error } = await supabase
      .from('profiles')
      .update({ username: username.trim() })
      .eq('id', user!.id)
    if (error) setMsg({ type: 'error', text: error.message })
    else {
      setMsg({ type: 'success', text: 'Username updated' })
      onProfileUpdate({ ...profile, username: username.trim() })
    }
    setSaving(null)
  }

  async function updateUid() {
    if (!uid.trim()) return
    setSaving('uid')
    setMsg(null)
    const { error } = await supabase
      .from('profiles')
      .update({ uid: uid.trim() })
      .eq('id', user!.id)
    if (error) setMsg({ type: 'error', text: error.message })
    else {
      setMsg({ type: 'success', text: 'Tag updated' })
      onProfileUpdate({ ...profile, uid: uid.trim() })
    }
    setSaving(null)
  }

  async function uploadAvatar(file: File) {
    if (!user) return
    setUploading(true)
    setMsg(null)
    const ext = file.name.split('.').pop()
    const filePath = `${user.id}/${Date.now()}.${ext}`
    const { error } = await supabase.storage
      .from('avatars')
      .upload(filePath, file)
    if (error) {
      if (error.message?.includes('bucket')) {
        setMsg({ type: 'error', text: 'Storage bucket "avatars" not found. Run the SQL migration.' })
      } else {
        setMsg({ type: 'error', text: error.message })
      }
      setUploading(false)
      return
    }
    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath)
    setAvatarUrl(publicUrl)
    setUploading(false)
  }

  async function saveProfile() {
    setSaving('profile')
    setMsg(null)
    loadFont(nameFont)
    loadFont(messageFont)
    const updates: Partial<Profile> = {
      avatar_url: avatarUrl || null,
      display_name: displayName || null,
      name_font: nameFont,
      name_color: nameColor,
      banner_color: bannerColor,
      status: status || null,
      message_font: messageFont,
    }
    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user!.id)
    if (error) setMsg({ type: 'error', text: error.message })
    else {
      setMsg({ type: 'success', text: 'Profile saved' })
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 2000)
      onProfileUpdate({
        ...profile,
        ...updates,
      } as Profile)
    }
    setSaving(null)
  }

  function handleThemeChange(t: typeof themes[number]) {
    setTheme(t.id)
  }

  const adminOutline = (color?: string | null) =>
    `1px 0 0.3px ${color || '#cba6f7'}, -1px 0 0.3px ${color || '#cba6f7'}, 0 1px 0.3px ${color || '#cba6f7'}, 0 -1px 0.3px ${color || '#cba6f7'}, 1px 1px 0.3px ${color || '#cba6f7'}, -1px 1px 0.3px ${color || '#cba6f7'}, -1px -1px 0.3px ${color || '#cba6f7'}, 1px -1px 0.3px ${color || '#cba6f7'}`

  return (
    <div className="settings-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="settings-modal">
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close-btn" onClick={onClose}><Icon name="close" /></button>
        </div>
        <div className="settings-tabs">
          {(['account', 'profile', 'appearance', 'about'] as Tab[]).map(t => (
            <button
              key={t}
              className={`settings-tab ${tab === t ? 'active' : ''}`}
              onClick={() => { setTab(t); setMsg(null) }}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div className="settings-body">
          <div className="settings-sidebar">
            <div className="sidebar-banner" style={{ backgroundColor: profile.banner_color || '#313244' }} />
            <div className="sidebar-avatar">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
              ) : (
                <Icon name="user" />
              )}
            </div>
            <div
              className="sidebar-name"
              style={{
                fontFamily: profile.name_font ? getFontFamily(profile.name_font) : undefined,
                color: profile.name_color || undefined,
                ...((profile.role === 'admin' || profile.role === 'owner') ? { textShadow: adminOutline(profile.admin_outline_color) } : {}),
              }}
            >
              {profile.display_name || profile.username}
              <AdminBadge role={profile.role} />
            </div>
            <div className="sidebar-tag">{profile.username}#{profile.uid}</div>
            {profile.status && <div className="sidebar-status">{profile.status}</div>}
          </div>
          <div className="settings-main">
            {msg && (
              <p className={msg.type === 'success' ? 'settings-success' : 'settings-error'}>
                {msg.text}
              </p>
            )}
            <div className="settings-scroll">
              {tab === 'account' && renderAccount()}
              {tab === 'profile' && renderProfile()}
              {tab === 'appearance' && renderAppearance()}
              {tab === 'about' && renderAbout()}
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  function renderAccount() {
    return (
      <>
        <div className="settings-section">
          <h3>Email</h3>
          <div className="settings-field">
            <label>Current email</label>
            <div className="field-row">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
              <button
                className="settings-btn"
                onClick={updateEmail}
                disabled={saving === 'email'}
              >
                {saving === 'email' ? 'Saving...' : 'Update'}
              </button>
            </div>
          </div>
        </div>

        <div className="settings-section">
          <h3>Password</h3>
          <div className="settings-field">
            <label>New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Enter new password"
            />
          </div>
          <div className="settings-field">
            <label>Confirm password</label>
            <div className="field-row">
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
              />
              <button
                className="settings-btn"
                onClick={updatePassword}
                disabled={saving === 'password'}
              >
                {saving === 'password' ? 'Saving...' : 'Update'}
              </button>
            </div>
          </div>
        </div>

        <div className="settings-section">
          <h3>Username</h3>
          <div className="settings-field">
            <label>Your unique username</label>
            <div className="field-row">
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
              />
              <button
                className="settings-btn"
                onClick={updateUsername}
                disabled={saving === 'username'}
              >
                {saving === 'username' ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>

        <div className="settings-section">
          <h3>Tag</h3>
          <div className="settings-field">
            <label>Your tag – auto-generated as 4 digits, but you can set it to anything</label>
            <div className="field-row">
              <input
                type="text"
                value={uid}
                onChange={e => setUid(e.target.value)}
              />
              <button
                className="settings-btn"
                onClick={updateUid}
                disabled={saving === 'uid'}
              >
                {saving === 'uid' ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </>
    )
  }

  function renderProfile() {
    return (
      <>
        <div className="settings-section">
          <h3>Avatar</h3>
          <div className="settings-field">
            {avatarUrl && (
              <div style={{ marginBottom: '0.5rem' }}>
                <img
                  src={avatarUrl}
                  alt=""
                  style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', display: 'block' }}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              </div>
            )}
            <label>Upload image or enter URL</label>
            <div className="field-row" style={{ marginBottom: '0.5rem' }}>
              <input
                type="text"
                value={avatarUrl}
                onChange={e => setAvatarUrl(e.target.value)}
                placeholder="https://example.com/avatar.png"
              />
            </div>
            <div className="field-row">
              <input
                type="file"
                accept="image/*"
                id="avatar-upload"
                style={{ display: 'none' }}
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) uploadAvatar(file)
                  e.target.value = ''
                }}
              />
              <button
                className="settings-btn"
                onClick={() => document.getElementById('avatar-upload')?.click()}
                disabled={uploading}
              >
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
              {avatarUrl && (
                <button
                  className="settings-btn"
                  style={{ background: 'var(--surface1)', color: 'var(--text)' }}
                  onClick={() => setAvatarUrl('')}
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="settings-section">
          <h3>Display name</h3>
          <div className="settings-field">
            <label>Shown instead of username</label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Leave empty to use username"
            />
          </div>
        </div>

        <div className="settings-section">
          <h3>Name font</h3>
          <div className="settings-field">
            <label>Font for your display name</label>
            <FontSelect value={nameFont} onChange={setNameFont} />
          </div>
        </div>

        <div className="settings-section">
          <h3>Name color</h3>
          <div className="settings-field">
            <label>Color for your display name</label>
            <input
              type="color"
              value={nameColor}
              onChange={e => setNameColor(e.target.value)}
            />
          </div>
        </div>

        <div className="settings-section">
          <h3>Banner color</h3>
          <div className="settings-field">
            <label>Solid color for your profile banner</label>
            <input
              type="color"
              value={bannerColor}
              onChange={e => setBannerColor(e.target.value)}
            />
          </div>
        </div>

        <div className="settings-section">
          <h3>Status</h3>
          <div className="settings-field">
            <label>A short status message</label>
            <input
              type="text"
              value={status}
              onChange={e => setStatus(e.target.value)}
              placeholder="What's on your mind?"
              maxLength={100}
            />
          </div>
        </div>

        <div className="settings-section">
          <h3>Message font</h3>
          <div className="settings-field">
            <label>Font your messages appear in for others</label>
            <FontSelect value={messageFont} onChange={setMessageFont} />
          </div>
        </div>

        <div className="settings-sticky-footer">
          <button
            className="settings-btn"
            onClick={saveProfile}
            disabled={saving === 'profile'}
          >
            {saving === 'profile' ? (
              'Saving...'
            ) : justSaved ? (
              <><Icon name="check" /> Saved</>
            ) : (
              'Save Profile'
            )}
          </button>
        </div>
      </>
    )
  }

  function renderAppearance() {
    return (
      <div className="settings-section">
        <h3>Theme</h3>
        <div className="theme-options">
          {themes.map(t => (
            <label
              key={t.id}
              className={`theme-option ${theme === t.id ? 'active' : ''}`}
            >
              <input
                type="radio"
                name="theme"
                checked={theme === t.id}
                onChange={() => handleThemeChange(t)}
              />
              <div>
                <div className="theme-name">{t.name}</div>
                {t.description && <div className="theme-desc">{t.description}</div>}
              </div>
            </label>
          ))}
        </div>

        <h3 style={{ marginTop: '1rem' }}>Accent Colour</h3>
        <div className="accent-options">
          {accentPresets.map(p => (
            <button
              key={p.color}
              className={`accent-swatch ${accent === p.color ? 'active' : ''}`}
              style={{ background: p.color }}
              title={p.name}
              onClick={() => setAccent(p.color)}
            />
          ))}
        </div>
      </div>
    )
  }

  function renderAbout() {
    const c = creator
    return (
      <>
        <div className="about-header">
          <img src="/favicon.png" alt="COE Chat" style={{ width: 48, height: 48 }} />
          <h2>COE Chat</h2>
        </div>

        <p style={{ color: 'var(--subtext0)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
          Peer-to-peer messaging built with React and Supabase.
        </p>

        <br></br>

        <div className="settings-section">
          <h3>Created by</h3>
          <div className="profile-card-preview">
            <div className="banner" style={{ backgroundColor: c?.banner_color || '#313244' }} />
            <div className="avatar">
              {c?.avatar_url ? (
                <img src={c.avatar_url} alt="" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
              ) : (
                <Icon name="user" />
              )}
            </div>
            <div
              className="profile-preview-name"
              style={{
                fontFamily: c?.name_font ? getFontFamily(c.name_font) : undefined,
                color: c?.name_color || undefined,
                ...((c?.role === 'admin' || c?.role === 'owner') ? { textShadow: adminOutline(c?.admin_outline_color) } : {}),
              }}
            >
              {c?.display_name || c?.username || 'pidgeon-religion'}
              <AdminBadge role={c?.role} />
            </div>
            <div className="sidebar-tag">
              {c ? `${c.username}#${c.uid}` : 'pidgeon-religion#?'}
            </div>
          </div>
        </div>
      </>
    )
  }
}
