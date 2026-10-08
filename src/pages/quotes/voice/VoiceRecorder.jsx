import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

// WhatsApp-style voice recording:
//  • press and HOLD the mic to record, release to send
//  • slide LEFT to cancel
//  • slide UP to lock → hands-free, with Send / trash buttons
//  • a quick tap just shows "Hold to record"
// While recording, a bar at the bottom of the screen shows a pulsing red dot,
// the timer and the slide hints. The sound level is sampled ~10×/s so the
// finished memo can show a waveform.
//
// onRecorded({ blob, mime, duration, peaks }) is called with the clip.

const MIN_MS = 700           // shorter than this = an accidental tap
const MAX_MS = 5 * 60 * 1000 // auto-send after 5 minutes
const CANCEL_DX = -90        // px to the left
const LOCK_DY = -70          // px upward
const BARS = 40

function pickMime() {
  const opts = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
  return opts.find((m) => window.MediaRecorder?.isTypeSupported?.(m)) ?? ''
}

// Squash the per-tick levels into BARS bars scaled 8–100.
function toPeaks(levels) {
  if (!levels.length) return []
  const out = []
  for (let i = 0; i < BARS; i++) {
    const a = Math.floor((i * levels.length) / BARS)
    const b = Math.max(a + 1, Math.floor(((i + 1) * levels.length) / BARS))
    const slice = levels.slice(a, b)
    out.push(slice.reduce((s, v) => s + v, 0) / slice.length)
  }
  const max = Math.max(...out, 0.0001)
  return out.map((v) => Math.round(8 + (v / max) * 92))
}

const fmt = (ms) => {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const MicIcon = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M12 15a3 3 0 003-3V6a3 3 0 10-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 006 6.92V21h2v-2.08A7 7 0 0019 12h-2z" /></svg>
)

export default function VoiceRecorder({ onRecorded, disabled, size = 'md', className = '' }) {
  const { t } = useTranslation()
  const [phase, setPhase] = useState('idle') // idle | recording | locked
  const [elapsed, setElapsed] = useState(0)
  const [drag, setDrag] = useState({ dx: 0, dy: 0 })
  const [hint, setHint] = useState('')
  const r = useRef({}) // recorder, stream, chunks, levels, timers, start point…

  const cleanup = () => {
    const s = r.current
    clearInterval(s.tick); clearInterval(s.levelTimer); clearTimeout(s.maxTimer)
    s.stream?.getTracks().forEach((tr) => tr.stop())
    s.audioCtx?.close?.().catch(() => {})
    r.current = {}
    setPhase('idle'); setElapsed(0); setDrag({ dx: 0, dy: 0 })
  }
  useEffect(() => cleanup, [])

  const flashHint = (msg) => { setHint(msg); setTimeout(() => setHint(''), 2200) }

  const start = async (e) => {
    if (disabled || phase !== 'idle') return
    e.preventDefault()
    try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch { /* fine */ }
    const s = (r.current = { x: e.clientX, y: e.clientY, down: true, cancelled: false })
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { flashHint(t('quotes.voice.unsupported')); return }
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    } catch {
      flashHint(t('quotes.voice.denied')); r.current = {}; return
    }
    // The finger came up while the permission prompt was open: nothing to record.
    if (!s.down) { stream.getTracks().forEach((tr) => tr.stop()); flashHint(t('quotes.voice.holdHint')); r.current = {}; return }
    s.stream = stream
    s.mime = pickMime()
    s.chunks = []
    s.levels = []
    const rec = new MediaRecorder(stream, s.mime ? { mimeType: s.mime } : undefined)
    rec.ondataavailable = (ev) => { if (ev.data?.size) s.chunks.push(ev.data) }
    s.rec = rec
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      s.audioCtx = new Ctx()
      const analyser = s.audioCtx.createAnalyser()
      analyser.fftSize = 512
      s.audioCtx.createMediaStreamSource(stream).connect(analyser)
      const buf = new Uint8Array(analyser.fftSize)
      s.levelTimer = setInterval(() => {
        analyser.getByteTimeDomainData(buf)
        let sum = 0
        for (const v of buf) sum += ((v - 128) / 128) ** 2
        s.levels.push(Math.sqrt(sum / buf.length))
      }, 100)
    } catch { /* waveform is optional */ }
    rec.start(250)
    s.startAt = Date.now()
    s.tick = setInterval(() => setElapsed(Date.now() - s.startAt), 100)
    s.maxTimer = setTimeout(() => finish(true), MAX_MS)
    navigator.vibrate?.(20)
    setPhase('recording')
  }

  const finish = (send) => {
    const s = r.current
    if (!s.rec) { cleanup(); return }
    const duration = (Date.now() - s.startAt) / 1000
    const keep = send && Date.now() - s.startAt >= MIN_MS
    const mime = s.rec.mimeType || s.mime || 'audio/webm'
    const peaks = toPeaks(s.levels)
    s.rec.onstop = () => {
      const blob = new Blob(s.chunks, { type: mime })
      cleanup()
      if (keep && blob.size) onRecorded({ blob, mime, duration, peaks })
    }
    try { s.rec.stop() } catch { cleanup() }
    if (send && !keep) flashHint(t('quotes.voice.holdHint'))
    if (!send) navigator.vibrate?.([10, 40, 10])
  }

  const move = (e) => {
    const s = r.current
    if (!s.down || phase !== 'recording') return
    const dx = Math.min(0, e.clientX - s.x)
    const dy = Math.min(0, e.clientY - s.y)
    setDrag({ dx, dy })
    if (dx < CANCEL_DX) { s.down = false; finish(false) }
    else if (dy < LOCK_DY) { s.down = false; setDrag({ dx: 0, dy: 0 }); setPhase('locked'); navigator.vibrate?.(15) }
  }

  const up = () => {
    const s = r.current
    const wasDown = s.down
    s.down = false
    if (phase === 'recording' && wasDown) finish(true)
  }

  const big = size === 'lg'
  const btn = `${big ? 'w-14 h-14' : 'w-10 h-10'} shrink-0 rounded-full flex items-center justify-center select-none touch-none transition-transform`

  return (
    <>
      <button type="button" disabled={disabled} aria-label={t('quotes.voice.holdHint')} title={t('quotes.voice.holdHint')}
        onPointerDown={start} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onContextMenu={(e) => e.preventDefault()}
        className={`${btn} ${phase === 'idle' ? 'bg-brand-500 text-white active:scale-95' : 'bg-red-600 text-white scale-125'} disabled:opacity-40 ${className}`}
        style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}>
        <MicIcon className={big ? 'w-7 h-7' : 'w-5 h-5'} />
      </button>

      {hint && createPortal(
        <div className="fixed left-1/2 -translate-x-1/2 z-[1300] rounded-full bg-gray-900/90 px-4 py-2 text-sm font-semibold text-white"
          style={{ bottom: 'calc(96px + env(safe-area-inset-bottom))' }}>{hint}</div>, document.body)}

      {phase !== 'idle' && createPortal(
        <div className="fixed inset-x-0 z-[1250] px-3" style={{ bottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
          <div className="mx-auto max-w-xl rounded-2xl bg-white shadow-2xl border border-gray-200 px-4 py-3 flex items-center gap-3">
            <span className="relative flex w-3 h-3 shrink-0">
              <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-70" />
              <span className="relative w-3 h-3 rounded-full bg-red-600" />
            </span>
            <span className="font-mono text-base font-semibold text-gray-900 tabular-nums">{fmt(elapsed)}</span>
            {phase === 'recording' ? (
              <>
                <span className="flex-1 text-center text-sm text-gray-500 transition-transform" style={{ transform: `translateX(${drag.dx / 2}px)` }}>
                  ‹ {t('quotes.voice.slideCancel')}
                </span>
                <span className="flex flex-col items-center text-[11px] font-semibold text-gray-400" style={{ transform: `translateY(${drag.dy / 3}px)` }}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="6" y="11" width="12" height="9" rx="2" /><path d="M9 11V8a3 3 0 016 0v3" /></svg>
                  ↑ {t('quotes.voice.lock')}
                </span>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm text-gray-500">{t('quotes.voice.lockedHint')}</span>
                <button type="button" onClick={() => finish(false)} aria-label={t('quotes.voice.discard')}
                  className="w-11 h-11 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 active:bg-gray-200">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3" /></svg>
                </button>
                <button type="button" onClick={() => finish(true)} aria-label={t('quotes.voice.send')}
                  className="w-12 h-12 rounded-full bg-brand-500 text-white flex items-center justify-center active:scale-95">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a.99.99 0 00-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z" /></svg>
                </button>
              </>
            )}
          </div>
        </div>, document.body)}
    </>
  )
}
