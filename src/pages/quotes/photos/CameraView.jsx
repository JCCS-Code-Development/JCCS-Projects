import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

// CompanyCam-style in-app camera: a live viewfinder and a shutter you can tap
// over and over without leaving the app (the native file picker returns to
// the app after every single shot). Frames are grabbed from the video stream
// at full camera resolution and handed to onCapture as JPEG Files.
//
// The stream only runs while `active` (e.g. the Camera tab is showing) to
// save battery. If the camera can't be opened (permission denied, desktop
// without one, insecure origin) it falls back to the phone camera / library
// pickers, which always work.
export default function CameraView({ active = true, onCapture, onFiles, header, className = '' }) {
  const { t } = useTranslation()
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const nativeRef = useRef(null)
  const libraryRef = useRef(null)
  const [status, setStatus] = useState('starting') // starting | live | unavailable
  const [flash, setFlash] = useState(false)
  const [shots, setShots] = useState(0)

  useEffect(() => {
    if (!active) return
    let cancelled = false
    if (!navigator.mediaDevices?.getUserMedia) { setStatus('unavailable'); return }
    setStatus('starting')
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1920 } },
      audio: false,
    }).then((stream) => {
      if (cancelled) { stream.getTracks().forEach((tr) => tr.stop()); return }
      streamRef.current = stream
      const v = videoRef.current
      if (v) { v.srcObject = stream; v.play().catch(() => {}) }
      setStatus('live')
    }).catch(() => { if (!cancelled) setStatus('unavailable') })
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((tr) => tr.stop())
      streamRef.current = null
    }
  }, [active])

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
      <div className="flex items-center justify-between px-6 py-4 bg-black">
        <button onClick={() => libraryRef.current?.click()} aria-label={t('quotes.photos.fromLibrary')}
          className="w-12 h-12 rounded-xl bg-white/10 text-white flex items-center justify-center active:bg-white/20">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path strokeLinecap="round" strokeLinejoin="round" d="M21 15l-5-5L5 21"/></svg>
        </button>
        <button onClick={status === 'live' ? shoot : () => nativeRef.current?.click()} aria-label={t('quotes.photos.takePhoto')}
          className="w-[72px] h-[72px] rounded-full border-4 border-white flex items-center justify-center active:scale-95 transition-transform">
          <span className="w-[56px] h-[56px] rounded-full bg-white" />
        </button>
        <span className="w-12 text-center text-xs font-bold text-white/70 tabular-nums">{shots > 0 ? `${shots}` : ''}</span>
      </div>
    </div>
  )
}
