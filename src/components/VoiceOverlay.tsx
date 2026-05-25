import { Icon } from './Icon'

interface Props {
  channelName: string
  connected: boolean
  onLeave: () => void
}

export function VoiceOverlay({ channelName, connected, onLeave }: Props) {
  if (!connected) return null

  return (
    <div className="voice-overlay">
      <div className="voice-overlay-info">
        <div className="voice-overlay-channel">
          <Icon name="mic" /> {channelName}
        </div>
        <div className="voice-overlay-status">Connected</div>
      </div>
      <button className="voice-overlay-btn" onClick={onLeave}>
        Leave
      </button>
    </div>
  )
}
