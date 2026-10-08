import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Spinner from '../../../components/ui/Spinner'
import { fmtDateTime } from '../quoteUtils'

const SPEEDS = [1, 1.5, 2]
const PLACEHOLDER = Array.from({ length: 40 }, (_, i) => 20 + ((i * 37) % 50))
const fmt = (sec) => {
  const s = Math.max(0, Math.round(sec || 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Only one voice memo plays at a time across the page.
const PLAY_EVENT = 'jccs:voice-play'

// A WhatsApp-style voice message: play / pause, waveform that fills as it
// plays, time, playback speed (1× · 1.5× · 2×), who recorded it and when.
// `pending` shows a just-recorded memo while it uploads (or Retry if it failed).
export default function VoiceBubble({ memo, pending, error, onRetry, onDelete, label }) {
  const { t, i18n } = useTranslation()
  const audioRef = useRef(null)
  const id = useRef(Math.random().toString(36).slice(2))
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0)
  const [dur, setDur] = useState(memo.duration_sec || 0)
  const [speed, setSpeed] = useState(1)

  useEffect(() => {
    const onOther = (e) => { if (e.detail !== id.current) audioRef.current?.pause() }
    window.addEventListener(PLAY_EVENT, onOther)
    return () => window.removeEventListener(PLAY_EVENT, onOther)
  }, [])

  const toggle = () => {
    const a = audioRef.current
    if (!a) return
    if (a.paused) {
      window.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: id.current }))
      a.playbackRate = speed
      a.play().catch(() => {})
    } else a.pause()
  }
  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]
    setSpeed(next)
    if (audioRef.current) audioRef.current.playbackRate = next
  }
  const seek = (e) => {
    const a = audioRef.current
    if (!a || !dur) return
    const r = e.currentTarget.getBoundingClientRect()
    a.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur
    setPos(a.currentTime)
  }

  const peaks = memo.peaks?.length ? memo.peaks : PLACEHOLDER
  const progress = dur ? pos / dur : 0
  return (
    <div className="flex flex-col gap-0.5 max-w-sm">
      {label && <span className="text-[11px] font-bold text-gray-400">{label}</span>}
      <div className={`flex items-center gap-2 rounded-2xl rounded-tl-md px-2.5 py-2 ${error ? 'bg-red-50 border border-red-200' : 'bg-brand-100/70'}`}>
        <audio ref={audioRef} src={memo.url} preload="metadata"
          onLoadedMetadata={(e) => { if (Number.isFinite(e.currentTarget.duration)) setDur(e.currentTarget.duration) }}
          onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
          onEnded={() => { setPlaying(false); setPos(0) }} />
        {pending ? (
          <span className="w-10 h-10 shrink-0 rounded-full bg-white flex items-center justify-center">
            {error
              ? <button type="button" onClick={onRetry} className="text-red-600 text-lg font-bold" aria-label={t('quotes.photos.retry')}>↻</button>
              : <Spinner size="sm" className="text-brand-500" />}
          </span>
        ) : (
          <button type="button" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}
            className="w-10 h-10 shrink-0 rounded-full bg-brand-500 text-white flex items-center justify-center active:scale-95">
            {playing
              ? <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
              : <svg className="w-4 h-4 ml-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72a1 1 0 001.52.85l10.97-6.86a1 1 0 000-1.7L9.52 4.29A1 1 0 008 5.14z" /></svg>}
          </button>
        )}
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="flex items-center gap-[2px] h-7 cursor-pointer" onClick={pending ? undefined : seek}>
            {peaks.map((p, i) => (
              <span key={i} className={`flex-1 rounded-full ${i / peaks.length < progress ? 'bg-brand-500' : 'bg-brand-400/40'}`}
                style={{ height: `${Math.max(12, p)}%` }} />
            ))}
          </div>
          <div className="flex items-center justify-between text-[11px] text-gray-500 tabular-nums">
            <span>{fmt(playing || pos ? pos : dur)}</span>
            <span className="truncate">{error ? t('quotes.voice.failed') : pending ? t('quotes.voice.sending') : fmtDateTime(memo.created_at, i18n.language)}</span>
          </div>
        </div>
        {!pending && (
          <button type="button" onClick={cycleSpeed}
            className="shrink-0 rounded-full bg-white/80 px-2 py-1 text-[11px] font-bold text-gray-700 tabular-nums">{speed}×</button>
        )}
        {onDelete && !pending && (
          <button type="button" onClick={onDelete} aria-label={t('common.delete')}
            className="shrink-0 w-7 h-7 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 text-sm">×</button>
        )}
      </div>
      {memo.uploaded_by_name && !pending && <span className="text-[10px] text-gray-400 pl-1">{memo.uploaded_by_name}</span>}
    </div>
  )
}
