import { RoleBadge } from './RoleBadge'

interface Props {
  role?: string | null
}

export function AdminBadge({ role }: Props) {
  return <RoleBadge role={role} />
}
