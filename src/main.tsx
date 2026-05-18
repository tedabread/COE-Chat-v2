import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

const loader = document.getElementById('loader')
if (loader) {
  loader.classList.add('hidden')
  setTimeout(() => {
    loader.remove()
    document.body.style.removeProperty('background')
  }, 350)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

function removeBodyBg() {
  document.body.style.removeProperty('background')
}

if (!loader) removeBodyBg()

window.addEventListener('pageshow', removeBodyBg)
