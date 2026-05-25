interface Props {
  role: string | null | undefined
}

const badges: Record<string, { label: string; className: string }> = {
  owner: { label: 'OWN', className: 'role-badge-owner' },
  admin: { label: 'ADM', className: 'role-badge-admin' },
  moderator: { label: 'MOD', className: 'role-badge-mod' },
}

export function RoleBadge({ role }: Props) {
  if (!role) return null
  const b = badges[role]
  if (!b) return null
  return <span className={`role-badge ${b.className}`}>{b.label}</span>
}
