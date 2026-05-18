const CDN = 'https://cdn.jsdelivr.net/npm/openmoji/color/svg'

const SKIP = new Set([0xFE0F])

export function emojiToHex(emoji: string): string {
  const codes: string[] = []
  for (const char of emoji) {
    const cp = char.codePointAt(0)
    if (cp !== undefined && !SKIP.has(cp)) codes.push(cp.toString(16).toUpperCase())
  }
  return codes.join('-')
}

export function getOpenmojiUrl(emoji: string): string {
  return `${CDN}/${emojiToHex(emoji)}.svg`
}

export const EMOJI_RE = /(\p{Emoji_Presentation}|\p{Extended_Pictographic})(\u200D\p{Emoji_Presentation}|\uFE0F)*/gu

export function isEmojiOnly(text: string): boolean {
  const stripped = text.replace(EMOJI_RE, '').trim()
  return stripped.length === 0
}

export function renderEmojis(text: string): string {
  return text.replace(EMOJI_RE, (match) => {
    if (/[0-9#*]/.test(match)) return match
    const src = getOpenmojiUrl(match)
    return `<img class="openmoji" src="${src}" alt="${match}" loading="lazy" />`
  })
}
