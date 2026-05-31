import { Link } from 'react-router-dom'
import { Icon } from '../components/Icon'

export function NotFound() {
  return (
    <div className="not-found-page">
      <div className="not-found-content">
        <div className="not-found-icon">
          <Icon name="search" />
        </div>
        <h1 className="not-found-title">404</h1>
        <p className="not-found-subtitle">Page not found</p>
        <p className="not-found-desc">The page you're looking for doesn't exist or has been moved.</p>
        <Link to="/" className="not-found-btn">
          <Icon name="message" />
          Go home
        </Link>
      </div>
    </div>
  )
}
