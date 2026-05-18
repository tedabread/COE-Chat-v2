import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import type { Profile } from '../types'
import { Icon } from './Icon'

interface Props {
  status: 'idle' | 'calling' | 'ringing' | 'connected' | 'ended'
  incomingCallerId: string | null
  elapsed: number
  onAccept: () => void
  onDecline: () => void
  onEnd: () => void
}

export function CallOverlay({ status, incomingCallerId, elapsed, onAccept, onDecline, onEnd }: Props) {
  const [callerProfile, setCallerProfile] = useState<Profile | null>(null)

  useEffect(() => {
    if (!incomingCallerId) return
    supabase
      .from('profiles')
      .select('*')
      .eq('id', incomingCallerId)
      .single()
      .then(({ data }) => {
        if (data) setCallerProfile(data)
      })
  }, [incomingCallerId])

  if (status === 'idle') return null

  const callerName = callerProfile?.display_name || callerProfile?.username || 'Someone'

  function formatTime(secs: number) {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  return (
    <div className="call-overlay">
      {status === 'ringing' && (
        <div className="call-overlay-content">
          <div className="call-avatar-ring">
            <span className="call-avatar-text">{callerName[0].toUpperCase()}</span>
          </div>
          <div className="call-name">{callerName}</div>
          <div className="call-sub">Incoming call</div>
          <div className="call-actions">
            <button className="call-btn call-btn-accept" onClick={onAccept}>
              <Icon name="call" />
            </button>
            <button className="call-btn call-btn-decline" onClick={onDecline}>
              <Icon name="close" />
            </button>
          </div>
        </div>
      )}

      {status === 'calling' && (
        <div className="call-overlay-content">
          <div className="call-avatar-ring">
            <span className="call-avatar-text">{callerName[0].toUpperCase()}</span>
          </div>
          <div className="call-name">{callerName}</div>
          <div className="call-sub">Calling...</div>
          <div className="call-actions">
            <button className="call-btn call-btn-end" onClick={onEnd}>
              <Icon name="close" />
            </button>
          </div>
        </div>
      )}

      {status === 'connected' && (
        <div className="call-overlay-content call-active">
          <div className="call-avatar-connected">
            <span className="call-avatar-text">{callerName[0].toUpperCase()}</span>
          </div>
          <div className="call-name">{callerName}</div>
          <div className="call-timer">{formatTime(elapsed)}</div>
          <div className="call-actions">
            <button className="call-btn call-btn-end" onClick={onEnd}>
              <Icon name="call_end" />
            </button>
          </div>
        </div>
      )}

      {status === 'ended' && (
        <div className="call-overlay-content">
          <div className="call-sub">Call ended</div>
        </div>
      )}
    </div>
  )
}
