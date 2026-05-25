interface Props {
  name: string
  className?: string
}

const icons: Record<string, string> = {
  search: '\uF002',
  user: '\uF007',
  users: '\uF0C0',
  message: '\uF086',
  send: '\uEAB6',
  plus: '\uF055',
  check: '\uF00C',
  close: '\uF00D',
  logout: '\uF08B',
  settings: '\uF013',
  friend: '\uF234',
  back: '\uF053',
  ellipsis: '\uF142',
  image: '\uF03E',
  paperclip: '\uF0C6',
  smile: '\uF118',
  download: '\uF019',
  file: '\uF15B',
  file_image: '\uF1C5',
  file_audio: '\uF1C7',
  file_video: '\uF1C8',
  file_zip: '\uF1C6',
  reply: '\uEAE2',
  call: '\uF095',
  call_end: '\uF090',
  mic: '\uF130',
  mic_off: '\uF131',
  shield: '\uF132',
  refresh: '\uF021',
  edit: '\uF044',
}

export function Icon({ name, className = '' }: Props) {
  const code = icons[name]
  if (!code) return null
  return <span className={`nf-icon ${className}`}>{code}</span>
}
