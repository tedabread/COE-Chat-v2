import type { Channel } from '../types'
import { Icon } from './Icon'

interface Props {
  channels: Channel[]
  activeChannelId: number | null
  onSelectChannel: (channel: Channel) => void
  serverName: string
  voiceParticipants: Record<number, number>
  onJoinVoice: (channel: Channel) => void
  activeVoiceChannelId: number | null
  onSettings?: () => void
  unreadCounts?: Record<number, number>
  pageHidden?: boolean
}

export function ChannelList({ channels, activeChannelId, onSelectChannel, serverName, voiceParticipants, onJoinVoice, activeVoiceChannelId, onSettings, unreadCounts, pageHidden }: Props) {
  const textChannels = channels.filter(c => c.type === 'text')
  const voiceChannels = channels.filter(c => c.type === 'voice')

  function ChannelItem({ ch }: { ch: Channel }) {
    if (ch.type === 'voice') {
      const count = voiceParticipants[ch.id] || 0
      const isActive = activeVoiceChannelId === ch.id
      return (
        <div
          className={`channel-item voice-channel ${isActive ? 'in-voice' : ''}`}
          onClick={() => onJoinVoice(ch)}
        >
          <Icon name="mic" />
          <span className="channel-name">{ch.name}</span>
          {count > 0 && <span className="voice-count">{count}</span>}
        </div>
      )
    }
    const unread = unreadCounts?.[ch.id] ?? 0
    return (
      <div
        className={`channel-item ${activeChannelId === ch.id ? 'active' : ''}`}
        onClick={() => onSelectChannel(ch)}
      >
        <span className="channel-hash">#</span>
        <span className="channel-name">{ch.name}</span>
        {unread > 0 && (activeChannelId !== ch.id || pageHidden) && (
          <span
            className="unread-badge"
            onClick={(e) => { e.stopPropagation(); onSelectChannel(ch) }}
            title="Mark as read"
          >{unread}</span>
        )}
      </div>
    )
  }

  return (
    <div className="channel-list">
      <div className="channel-list-header">
        <span className="channel-server-name">{serverName}</span>
        {onSettings && (
          <button className="channel-settings-btn" onClick={onSettings} title="Server Settings">
            <Icon name="settings" />
          </button>
        )}
      </div>
      <div className="channel-list-section">
        <div className="channel-section-label">Text Channels</div>
        {textChannels.map(ch => <ChannelItem key={ch.id} ch={ch} />)}
      </div>
      <div className="channel-list-section">
        <div className="channel-section-label">Voice Channels</div>
        {voiceChannels.map(ch => <ChannelItem key={ch.id} ch={ch} />)}
      </div>
    </div>
  )
}
