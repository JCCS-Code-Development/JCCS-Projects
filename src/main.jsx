import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './i18n'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { ConfirmProvider } from './components/ConfirmProvider.jsx'
import { ToastProvider } from './components/ToastProvider.jsx'

// Installed PWAs (home-screen app on a phone) can stay open for days, so a
// new deploy would otherwise keep showing the old version. The service
// worker already takes over as soon as a new one installs (skipWaiting +
// clientsClaim in sw.js); this (1) checks for a new version every time the
// app comes back to the foreground and (2) reloads onto it — immediately if
// nobody is typing, otherwise the next time the app is backgrounded, so an
// in-progress form is never wiped.
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller
  let pendingReload = false
  const isTyping = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || pendingReload) return // first install, not an update
    pendingReload = true
    if (!isTyping()) window.location.reload()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && pendingReload) window.location.reload()
    if (document.visibilityState === 'visible') navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => {})
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <ConfirmProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ConfirmProvider>
      </ToastProvider>
    </ErrorBoundary>
  </StrictMode>,
)
