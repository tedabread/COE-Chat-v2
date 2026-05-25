import type { Server } from '../types'
import { Icon } from './Icon'

interface Props {
  servers: Server[]
  activeServerId: number | null
  activeDm: boolean
  onSelectServer: (server: Server | null) => void
  onOpenDm: () => void
  onCreateServer: () => void
}

function ServerIcon({ server, active }: { server: Server; active: boolean }) {
  return (
    <div className={`server-icon-wrap ${active ? 'active' : ''}`} title={server.name}>
      {server.icon_url ? (
        <img src={server.icon_url} alt={server.name} className="server-icon-img" />
      ) : (
        <div className="server-icon-default">
          {server.name[0].toUpperCase()}
        </div>
      )}
    </div>
  )
}

export function ServerBar({ servers, activeServerId, activeDm, onSelectServer, onOpenDm, onCreateServer }: Props) {
  return (
    <div className="server-bar">
      <div className="server-bar-top">
        <div
          className={`server-icon-wrap dm-icon ${activeDm ? 'active' : ''}`}
          onClick={onOpenDm}
          title="Direct Messages"
        >
          <Icon name="message" />
        </div>
        <div className="server-divider" />
        {servers.map(s => (
          <div key={s.id} onClick={() => onSelectServer(s)}>
            <ServerIcon server={s} active={s.id === activeServerId} />
          </div>
        ))}
      </div>
      <div className="server-bar-bottom">
        <div className="server-icon-wrap add-server" onClick={onCreateServer} title="Create Server">
          <Icon name="plus" />
        </div>
      </div>
    </div>
  )
}
