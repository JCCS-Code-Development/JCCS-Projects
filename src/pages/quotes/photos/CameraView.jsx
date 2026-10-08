import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getCameraStream, release } from './mediaStreams'

// CompanyCam-style in-app camera: a live viewfinder and a shutter you can tap
// over and over without leaving the app (the native file picker returns to
// the app after every single shot). Frames are grabbed from the video stream
// at full camera resolution and handed to onCapture as JPEG Files.
//
// The stream only runs while `active` (e.g. the Camera tab is showing) to
// save battery. If the camera can't be opened (permission denied, desktop
// without one, insecure origin) it falls back to the phone camera / library
// pickers, which always work.
export default function CameraView({ active = true, onCapture, onFiles, header, className = '', extra = null }) {
  const { t } = useTranslation()
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const nativeRef = useRef(null)
  const libraryRef = useRef(null)
  const [status, setStatus] = useState('starting') // starting | live | paused | unavailable
  const [flash, setFlash] = useState(false)
  const [shots, setShots] = useState(0)
  const [attempt, setAttempt] = useState(0) // bump to (re)start the camera
  const [hidden, setHidden] = useState(() => document.visibilityState === 'hidden')

  // The camera is switched off while the app is in the background (so the
  // system's "camera in use" indicator doesn't linger) and back on after.
  useEffect(() => {
    const onVis = () => {
      const h = document.visibilityState === 'hidden'
      if (h) release('camera')
      setHidden(h)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  useEffect(() => {
    if (!active || hidden) return
    let cancelled = false
    let retried = false
    const video = videoRef.current
    if (!navigator.mediaDevices?.getUserMedia) { setStatus('unavailable'); return }
    setStatus('starting')

    // Shared stream (mediaStreams.js): reused across tab switches so the
    // browser doesn't ask for permission again each time.
    const open = () => getCameraStream().then((stream) => {
      if (cancelled) return
      streamRef.current = stream
      const v = videoRef.current
      if (v) { v.srcObject = stream; v.play().catch(() => {}) }
      setStatus('live')
      // iPadOS/iOS can cut the camera from outside the app — the user taps
      // the system "recording" indicator, or the mic starts for a voice memo.
      // Reconnect once automatically; if that fails, offer a button instead
      // of leaving a dead black viewfinder.
      for (const track of stream.getVideoTracks()) {
        track.addEventListener('ended', () => {
          if (cancelled) return
          streamRef.current = null
          if (!retried) { retried = true; setTimeout(() => { if (!cancelled) open().catch(() => setStatus('paused')) }, 400) }
          else setStatus('paused')
        })
      }
    })
    open().catch(() => { if (!cancelled) setStatus('unavailable') })
    return () => {
      // Don't stop the shared stream here — the screen releases it on leave.
      cancelled = true
      if (video) video.srcObject = null
      streamRef.current = null
    }
  }, [active, hidden, attempt])

  const shoot = () => {
    const v = videoRef.current
    if (!v || status !== 'live' || !v.videoWidth) return
    const c = document.createElement('canvas')
    c.width = v.videoWidth
    c.height = v.videoHeight
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height)
    setFlash(true); setTimeout(() => setFlash(false), 120)
    navigator.vibrate?.(15)
    c.toBlob((blob) => {
      if (!blob) return
      const now = Date.now()
      onCapture(new File([blob], `walk-${now}.jpg`, { type: 'image/jpeg', lastModified: now }))
      setShots((n) => n + 1)
    }, 'image/jpeg', 0.9)
  }

  const pick = (e) => {
    // Read the FileList before clearing the input (clearing empties it).
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length) onFiles(files)
  }

  return (
    <div className={`relative flex flex-col bg-black rounded-2xl overflow-hidden ${className}`}>
      <input ref={nativeRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={pick} />
      <input ref={libraryRef} type="file" accept="image/*" multiple className="hidden" onChange={pick} />

      {header && <div className="absolute top-0 inset-x-0 z-10 p-2.5">{header}</div>}

      <div className="relative flex-1 min-h-0 flex items-center justify-center">
        <video ref={videoRef} playsInline muted autoPlay
          className={`w-full h-full object-cover ${status === 'live' ? '' : 'hidden'}`} />
        {status === 'starting' && <p className="text-sm text-white/60">{t('quotes.camera.starting')}</p>}
        {status === 'paused' && (
          <div className="flex flex-col items-center gap-3 px-6 text-center">
            <p className="text-sm text-white/70">{t('quotes.camera.paused')}</p>
            <button onClick={() => setAttempt((n) => n + 1)} className="rounded-full bg-white text-gray-900 px-5 py-2.5 text-sm font-bold">
              {t('quotes.camera.resume')}
            </button>
          </div>
        )}
        {status === 'unavailable' && (
          <div className="flex flex-col items-center gap-3 px-6 text-center">
            <p className="text-sm text-white/70">{t('quotes.camera.unavailable')}</p>
            <button onClick={() => nativeRef.current?.click()} className="rounded-full bg-white text-gray-900 px-5 py-2.5 text-sm font-bold">
              {t('quotes.camera.usePhoneCamera')}
            </button>
          </div>
        )}
        {flash && <div className="absolute inset-0 bg-white/80 pointer-events-none" />}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between px-6 pt-4 pb-3 bg-black">
        <button onClick={() => libraryRef.current?.click()} aria-label={t('quotes.photos.fromLibrary')}
          className="w-12 h-12 rounded-xl bg-white/10 text-white flex items-center justify-center active:bg-white/20">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path strokeLinecap="round" strokeLinejoin="round" d="M21 15l-5-5L5 21"/></svg>
        </button>
        {/* Big red shutter with a label — easy to find and hit at a glance. */}
        <div className="flex flex-col items-center gap-1.5">
          <button onClick={status === 'live' ? shoot : () => nativeRef.current?.click()} aria-label={t('quotes.photos.takePhoto')}
            className="w-[84px] h-[84px] rounded-full border-[5px] border-white flex items-center justify-center shadow-[0_0_0_4px_rgba(239,68,68,0.35)] active:scale-95 transition-transform">
            <span className="w-[64px] h-[64px] rounded-full bg-brand-500 flex items-center justify-center text-white">
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.66-.89l.82-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.66.89l.82 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><circle cx="12" cy="13" r="3"/></svg>
            </span>
          </button>
          <span className="text-[11px] font-bold uppercase tracking-wider text-white/80">{t('quotes.photos.takePhoto')}</span>
        </div>
        {extra ?? <span className="w-12 text-center text-xs font-bold text-white/70 tabular-nums">{shots > 0 ? `${shots}` : ''}</span>}
      </div>
    </div>
  )
}
