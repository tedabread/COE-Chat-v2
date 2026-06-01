import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { supabase } from '../supabaseClient'
import { useChannelMessages } from '../hooks/useChannelMessages'
import { useTyping } from '../hooks/useTyping'
import { getFontFamily, loadFont } from '../utils/fonts'
import { getAvatarColor } from '../utils/avatar'
import { compressImage } from '../utils/compress'
import { getFlagUrl } from '../utils/flags'
import { renderEmojis, isEmojiOnly, EMOJI_RE } from '../utils/openmoji'
import { nameToEmoji } from 'gemoji'
import type { Profile, Message, Channel } from '../types'
import { Icon } from './Icon'
import { EmojiPicker } from './EmojiPicker'
import { AdminBadge } from './AdminBadge'
import { InvitePreview } from './InvitePreview'

interface Props {
  channel: Channel
  onClose: () => void
  canManageMessages: boolean
  userDisplayNames?: Record<string, string>
  onMarkRead?: (channelId: number) => void
}

const FLAG_RE = /:flag-([a-z0-9-]+):/g
const EMOJI_SHORTCODE_RE = /:([a-z0-9_*+-]+):/gi

function replaceEmojiShortcodes(text: string): string {
  return text.replace(EMOJI_SHORTCODE_RE, (match, name) => {
    const emoji = nameToEmoji[name.toLowerCase()]
    return emoji || match
  })
}

function renderContent(text: string): string {
  const withFlags = text.replace(FLAG_RE, (_, name) => {
    const src = getFlagUrl(name)
    return `<img class="inline-flag" src="${src}" alt="${name}" loading="lazy" />`
  })
  const withShortcodes = replaceEmojiShortcodes(withFlags)
  return renderEmojis(withShortcodes)
}

function MessageAvatar({ profile }: { profile?: Profile }) {
  if (!profile) return <div className="msg-avatar" />
  if (profile.avatar_url) {
    return (
      <div className="msg-avatar">
        <img src={profile.avatar_url} alt="" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
      </div>
    )
  }
  const name = profile.display_name || profile.username || '?'
  return (
    <div className="msg-avatar default" style={{ backgroundColor: getAvatarColor(profile.id) }}>
      {name[0].toUpperCase()}
    </div>
  )
}

function FilePreview({ msg }: { msg: Message }) {
  if (!msg.file_url) return null
  const isImage = msg.file_type?.startsWith('image/')
  if (isImage) {
    return (
      <a href={msg.file_url} target="_blank" rel="noopener noreferrer" className="msg-image-link">
        <img src={msg.file_url} alt={msg.file_name || ''} className="msg-image" />
      </a>
    )
  }
  const sizeStr = msg.file_size ? formatSize(msg.file_size) : ''
  return (
    <a href={msg.file_url} target="_blank" rel="noopener noreferrer" className="msg-file-link" download={msg.file_name || undefined}>
      <span className="file-icon"><Icon name={getFileIcon(msg.file_type || '')} /></span>
      <span className="file-info">
        <span className="file-name">{msg.file_name}</span>
        {sizeStr && <span className="file-size">{sizeStr}</span>}
      </span>
      <span className="file-download"><Icon name="download" /></span>
    </a>
  )
}

function getFileIcon(type: string): string {
  if (type.startsWith('image/')) return 'file_image'
  if (type.startsWith('audio/')) return 'file_audio'
  if (type.startsWith('video/')) return 'file_video'
  if (type.includes('zip') || type.includes('rar') || type.includes('tar') || type.includes('7z') || type.includes('gzip')) return 'file_zip'
  return 'file'
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

export function ChannelView({ channel, onClose, canManageMessages, userDisplayNames, onMarkRead }: Props) {
  const { messages, loading, sendMessage, editMessage, deleteMessage } = useChannelMessages(channel.id)
  const [input, setInput] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [inputFocused, setInputFocused] = useState(false)
  const [editingMsg, setEditingMsg] = useState<Message | null>(null)
  const [editInput, setEditInput] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const sendingRef = useRef(false)
  const [currentUserId, setCurrentUserId] = useState<string | undefined>(undefined)

  const { typingUserIds, setTyping } = useTyping(channel.id, currentUserId, 'chan')

  useEffect(() => {
    onMarkRead?.(channel.id)
  }, [channel.id])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUserId(data.user.id)
    })
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    for (const msg of messages) {
      if (msg.profile?.message_font) loadFont(msg.profile.message_font)
    }
  }, [messages])

  // Global keydown → focus input
  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === 'Tab') return
      if (e.key.length !== 1) return
      e.preventDefault()
      const el = inputRef.current
      if (!el) return
      el.focus()
      const start = el.selectionStart ?? input.length
      const newVal = input.slice(0, start) + e.key + input.slice(start)
      setInput(newVal)
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + e.key.length
      })
    }
    document.addEventListener('keydown', handleGlobalKeyDown)
    return () => document.removeEventListener('keydown', handleGlobalKeyDown)
  }, [input])

  const isTyping = inputFocused && input.trim().length > 0
  useEffect(() => { setTyping(isTyping) }, [isTyping])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    if (e.key === 'Escape') {
      setEditingMsg(null)
      setReplyTo(null)
    }
  }

  function clearPendingFile() {
    setPendingFile(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleSend() {
    const text = input.trim()
    if (!text && !pendingFile) return
    if (sendingRef.current) return
    sendingRef.current = true
    setUploading(true)

    let file: File | undefined
    if (pendingFile) {
      file = pendingFile
      if (pendingFile.type.startsWith('image/')) {
        try {
          const compressed = await compressImage(pendingFile)
          file = new File([compressed], pendingFile.name, { type: pendingFile.type })
        } catch { }
      }
    }

    try {
      await sendMessage(text, file, replyTo?.id)
      setInput('')
      clearPendingFile()
      setReplyTo(null)
    } finally {
      sendingRef.current = false
      setUploading(false)
    }
  }

  function onFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (e.target) e.target.value = ''
    setPendingFile(f)
  }

  function onEmojiPick(emoji: string) {
    const el = inputRef.current
    if (!el) {
      setInput(prev => prev + emoji)
    } else {
      const start = el.selectionStart ?? input.length
      const newVal = input.slice(0, start) + emoji + input.slice(start)
      setInput(newVal)
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + emoji.length
        el.focus()
      })
    }
    setShowEmoji(false)
  }

  function startEdit(msg: Message) {
    if (!canManageMessages && msg.sender_id !== currentUserId) return
    setEditingMsg(msg)
    setEditInput(msg.content)
  }

  async function saveEdit() {
    if (!editingMsg || !editInput.trim()) return
    await editMessage(editingMsg.id, editInput.trim())
    setEditingMsg(null)
    setEditInput('')
  }

  function handleDelete(msg: Message) {
    if (!confirm('Delete this message?')) return
    deleteMessage(msg.id)
  }

  return (
    <div className="chat-layout">
      <div className="chat-panel">
        <div className="chat-panel-header">
          <button className="chat-close-btn" onClick={onClose}>
            <Icon name="close" />
          </button>
          <span className="channel-hash chat-channel-hash">#</span>
          <span className="chat-channel-name">{channel.name}</span>
        </div>
        <div className="messages-container">
          {loading ? (
            <div className="loading">Loading messages...</div>
          ) : messages.length === 0 ? (
            <div className="empty-messages">No messages yet. Say something!</div>
          ) : (
            messages.map((msg, i) => {
              const prev = messages[i - 1]
              const isSameSender = prev && prev.sender_id === msg.sender_id &&
                new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() < 600000
              const time = new Date(msg.created_at).toLocaleTimeString([], {
                hour: '2-digit', minute: '2-digit',
              })
              const replyMsg = msg.reply_to ? messages.find(m => m.id === msg.reply_to) : null
              const canEdit = canManageMessages || msg.sender_id === currentUserId
              return (
                <div id={`msg-${msg.id}`} key={msg.id} className={`msg-row${isSameSender ? ' same-sender' : ''}`}>
                  {isSameSender ? (
                    <div className="msg-avatar" />
                  ) : (
                    <MessageAvatar profile={msg.profile} />
                  )}
                  <div className="msg-body">
                    {!isSameSender && (
                      <div className="msg-header">
                        <span className="msg-name" style={{
                          fontFamily: msg.profile?.name_font ? getFontFamily(msg.profile.name_font) : undefined,
                          color: msg.profile?.name_color || undefined,
                          ...((msg.profile?.role === 'admin' || msg.profile?.role === 'owner') ? { textShadow: `1px 0 0.3px ${msg.profile.admin_outline_color || '#cba6f7'}, -1px 0 0.3px ${msg.profile.admin_outline_color || '#cba6f7'}, 0 1px 0.3px ${msg.profile.admin_outline_color || '#cba6f7'}, 0 -1px 0.3px ${msg.profile.admin_outline_color || '#cba6f7'}, 1px 1px 0.3px ${msg.profile.admin_outline_color || '#cba6f7'}, -1px 1px 0.3px ${msg.profile.admin_outline_color || '#cba6f7'}, -1px -1px 0.3px ${msg.profile.admin_outline_color || '#cba6f7'}, 1px -1px 0.3px ${msg.profile.admin_outline_color || '#cba6f7'}` } : {}),
                        }}>
                          {msg.profile?.display_name || msg.profile?.username || 'Unknown'}
                          <AdminBadge role={msg.profile?.role} />
                        </span>
                        <span className="msg-time">{time}</span>
                      </div>
                    )}
                    {replyMsg && (
                      <div className="msg-reply-preview" onClick={() => {
                        document.getElementById(`msg-${replyMsg.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                      }}>
                        <div className="msg-reply-line" />
                        <div className="msg-reply-content">
                          <span className="msg-reply-name">
                            {replyMsg.profile?.display_name || replyMsg.profile?.username || 'Unknown'}
                          </span>
                          <span className="msg-reply-text">
                            {replyMsg.content ? replyMsg.content.slice(0, 80) : (replyMsg.file_name || 'File')}
                            {replyMsg.content && replyMsg.content.length > 80 ? '…' : ''}
                          </span>
                        </div>
                      </div>
                    )}
                    {editingMsg?.id === msg.id ? (
                      <div className="msg-edit-box">
                        <input
                          type="text"
                          value={editInput}
                          onChange={e => setEditInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit() } }}
                          autoFocus
                        />
                        <div className="msg-edit-actions">
                          <button onClick={saveEdit}>Save</button>
                          <button onClick={() => setEditingMsg(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {msg.content && (
                          <div className={`msg-text${isEmojiOnly(msg.content) ? ' msg-emoji-only' : EMOJI_RE.test(msg.content) ? ' msg-has-emoji' : ''}`} style={{
                            fontFamily: msg.profile?.message_font ? getFontFamily(msg.profile.message_font) : undefined,
                          }}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                              {renderContent(msg.content)}
                            </ReactMarkdown>
                            {msg.edited && <span className="msg-edited">(edited)</span>}
                          </div>
                        )}
                        <FilePreview msg={msg} />
                        <InvitePreview content={msg.content} />
                      </>
                    )}
                    <div className="msg-actions-row">
                      {!editingMsg && (
                        <button className="msg-reply-btn" onClick={() => setReplyTo(msg)} title="Reply">
                          <Icon name="reply" />
                        </button>
                      )}
                      {canEdit && !editingMsg && (
                        <button className="msg-reply-btn" onClick={() => startEdit(msg)} title="Edit">
                          <Icon name="edit" />
                        </button>
                      )}
                      {(canManageMessages || msg.sender_id === currentUserId) && !editingMsg && (
                        <button className="msg-reply-btn" onClick={() => handleDelete(msg)} title="Delete">
                          <Icon name="close" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
          <div ref={bottomRef} />
        </div>

        <form className="message-input" onSubmit={e => { e.preventDefault(); handleSend() }}>
          {typingUserIds.length > 0 && (
            <div className="typing-indicator">
              {typingUserIds.map((uid) => userDisplayNames?.[uid] || 'Someone').filter((v, i, a) => a.indexOf(v) === i).join(', ')} is typing...
            </div>
          )}
          {replyTo && (
            <div className="reply-bar">
              <div className="reply-bar-line" />
              <div className="reply-bar-content">
                <span className="reply-bar-label">Replying to </span>
                <span className="reply-bar-name">
                  {replyTo.profile?.display_name || replyTo.profile?.username || 'Unknown'}
                </span>
                <span className="reply-bar-text">
                  {replyTo.content ? replyTo.content.slice(0, 60) : (replyTo.file_name || 'File')}
                  {replyTo.content && replyTo.content.length > 60 ? '…' : ''}
                </span>
              </div>
              <button type="button" className="reply-bar-close" onClick={() => setReplyTo(null)}>
                <Icon name="close" />
              </button>
            </div>
          )}
          {pendingFile && (
            <div className="pending-file">
              <span className="pending-file-icon"><Icon name={pendingFile.type.startsWith('image/') ? 'file_image' : 'file'} /></span>
              <span className="pending-file-name">{pendingFile.name}</span>
              <span className="pending-file-size">{formatSize(pendingFile.size)}</span>
              <button type="button" className="pending-file-remove" onClick={clearPendingFile}><Icon name="close" /></button>
            </div>
          )}
          <div className="input-row">
            <input type="file" ref={fileRef} onChange={onFilePick} style={{ display: 'none' }} />
            <button type="button" className="input-btn" onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Icon name="paperclip" />
            </button>
            <div className="input-emoji-wrap">
              <button type="button" className={`input-btn ${showEmoji ? 'active' : ''}`} onClick={() => setShowEmoji(!showEmoji)}>
                <Icon name="smile" />
              </button>
              {showEmoji && <EmojiPicker onEmoji={onEmojiPick} onClose={() => setShowEmoji(false)} />}
            </div>
            <input
              ref={inputRef}
              type="text"
              placeholder={uploading ? 'Uploading...' : `Message #${channel.name}`}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              disabled={uploading}
            />
            <button type="submit" disabled={uploading || (!input.trim() && !pendingFile)}>
              <Icon name="send" />
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
