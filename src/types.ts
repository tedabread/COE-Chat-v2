export interface Profile {
  id: string
  username: string
  uid: string
  avatar_url: string | null
  display_name: string | null
  name_font: string | null
  name_color: string | null
  banner_color: string | null
  status: string | null
  message_font: string | null
  role: string | null
  admin_outline_color: string | null
  created_at: string
}

export interface ChatMember {
  chat_id: number
  user_id: string
}

export interface FriendRequest {
  id: number
  sender_id: string
  receiver_id: string
  status: 'pending' | 'accepted' | 'rejected'
  created_at: string
  sender?: Profile
  receiver?: Profile
}

export interface Chat {
  id: number
  created_by: string
  created_at: string
}

export type CallStatus = 'idle' | 'calling' | 'ringing' | 'connected' | 'ended'

export interface Call {
  id: number
  chat_id: number
  caller_id: string
  receiver_id: string
  status: 'ringing' | 'active' | 'ended' | 'missed'
  channel_name: string
  created_at: string
  ended_at: string | null
}

export interface Message {
  id: number
  chat_id: number
  sender_id: string
  content: string
  file_url: string | null
  file_name: string | null
  file_type: string | null
  file_size: number | null
  reply_to: number | null
  created_at: string
  profile?: Profile
}
