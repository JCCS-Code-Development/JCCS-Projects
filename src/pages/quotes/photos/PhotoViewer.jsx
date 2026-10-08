import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useToast } from '../../../components/ToastProvider'
import { useConfirm } from '../../../components/ConfirmProvider'
import { updateQuotePhoto, deleteQuotePhoto } from '../../../api/quoteRequests'
import AnnotationLayer from './AnnotationLayer'
import { fmtDateTime } from '../quoteUtils'

const TOOLS = ['arrow', 'circle', 'line', 'pen', 'text']
const MARKUP_COLORS = ['#ef4444', '#facc15', '#ffffff']

const ToolIcon = ({ tool }) => {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24">
      {tool === 'arrow' && <><path {...p} d="M5 19L19 5" /><path {...p} d="M10 5h9v9" /></>}
      {tool === 'circle' && <ellipse {...p} cx="12" cy="12" rx="8" ry="6" />}
      {tool === 'line' && <path {...p} d="M4 18L20 6" />}
      {tool === 'pen' && <path {...p} d="M4 17c3-6 5 2 8-3s5-6 8-4" />}
      {tool === 'text' && <><path {...p} d="M5 6h14M12 6v13" /></>}
    </svg>
  )
}

// Full-screen, CompanyCam-style photo viewer: swipe / arrow keys between
// photos, caption + Before/Reference tags, delete, and a markup mode for
// drawing arrows, circles, lines, freehand and text labels on the photo.
export default function PhotoViewer({ photos, startId, canEdit, onClose, onChanged, notes = [] }) {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const confirmDialog = useConfirm()
  const [id, setId] = useState(startId)
  const index = Math.max(0, photos.findIndex((p) => p.id === id))
  const photo = photos[index]

  const [natural, setNatural] = useState({ w: 0, h: 0 })
  const [caption, setCaption] = useState(photo?.caption ?? '')
  const [markup, setMarkup] = useState(false)
  const [shapes, setShapes] = useState([])
  const [tool, setTool] = useState('arrow')
  const [color, setColor] = useState(MARKUP_COLORS[0])
  const [drawing, setDrawing] = useState(null)
  const [textAt, setTextAt] = useState(null)
  const [textValue, setTextValue] = useState('')
  const [saving, setSaving] = useState(false)
  const svgWrap = useRef(null)
  const touchStart = useRef(null)
  // Zoom: scale + offset of the photo (origin top-left), pinch / double-tap /
  // wheel. Active pointers live in a ref so two-finger gestures can be told
  // apart from drawing or swiping.
  const [zoom, setZoom] = useState({ s: 1, x: 0, y: 0 })
  const pointers = useRef(new Map())
  const gesture = useRef(null)
  const lastTap = useRef(0)
  // The photo is sized to the space actually left between the top bar and
  // the bottom panel (which is taller while marking up).
  const stageRef = useRef(null)
  const wheelRef = useRef(null)
  const [stageH, setStageH] = useState(0)
  useEffect(() => {
    const el = stageRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setStageH(el.clientHeight))
    ro.observe(el)
    // Wheel / trackpad pinch zooms the photo, not the whole page (needs a
    // non-passive listener to stop the browser's own zoom).
    const onWheel = (e) => { e.preventDefault(); wheelRef.current?.(e) }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => { ro.disconnect(); el.removeEventListener('wheel', onWheel) }
  }, [])

  // Reset per-photo state when moving to a different photo (keyed on the id
  // only — a caption save reloading the same photo must not wipe the editor).
  // React's "adjust state when a prop changes" pattern, no effect needed.
  const [shownId, setShownId] = useState(photo?.id)
  if (photo && photo.id !== shownId) {
    setShownId(photo.id)
    setCaption(photo.caption ?? '')
    setMarkup(false); setDrawing(null); setTextAt(null)
    setNatural({ w: 0, h: 0 })
    setZoom({ s: 1, x: 0, y: 0 })
  }

  // Photo deleted out from under us (or list emptied) → close.
  useEffect(() => { if (!photo) onClose() }, [photo, onClose])

  const go = (delta) => {
    if (markup || !photos.length) return
    const next = photos[(index + delta + photos.length) % photos.length]
    setId(next.id)
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT') return
      if (e.key === 'Escape') { if (markup) setMarkup(false); else onClose() }
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  })

  if (!photo) return null
  const savedShapes = photo.annotations?.shapes ?? []

  const patch = async (payload) => {
    try { await updateQuotePhoto(photo.id, payload); onChanged() }
    catch (err) { toast.error(err?.response?.data?.error ?? t('common.couldNotSave')) }
  }
  const remove = async () => {
    if (!await confirmDialog(t('quotes.photos.deleteConfirm'), { danger: true, confirmLabel: t('quotes.photos.delete') })) return
    const fallback = photos[index + 1] ?? photos[index - 1]
    try {
      await deleteQuotePhoto(photo.id)
      if (fallback) setId(fallback.id)
      onChanged()
    } catch (err) { toast.error(err?.response?.data?.error ?? t('common.couldNotSave')) }
  }

  // ── Markup drawing ──
  const pointFrom = (e) => {
    const r = svgWrap.current.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
    return [Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000]
  }
  // ── Zoom ──
  // Keep the zoomed photo covering its frame (no drifting off into black).
  const clampZoom = (z) => {
    const el = svgWrap.current
    const s = Math.min(5, Math.max(1, z.s))
    if (!el || s === 1) return { s: 1, x: 0, y: 0 }
    const w = el.offsetWidth, h = el.offsetHeight
    return { s, x: Math.min(0, Math.max(w * (1 - s), z.x)), y: Math.min(0, Math.max(h * (1 - s), z.y)) }
  }
  // Zoom to scale `to`, keeping the photo point under (cx, cy) in place.
  const zoomAt = (cx, cy, to, from = zoom) => {
    const r = svgWrap.current.getBoundingClientRect()
    const restL = r.left - from.x, restT = r.top - from.y
    const ux = (cx - r.left) / from.s, uy = (cy - r.top) / from.s
    return clampZoom({ s: to, x: cx - restL - ux * to, y: cy - restT - uy * to })
  }
  const pinchInfo = () => {
    const [a, b] = [...pointers.current.values()]
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }
  }
  wheelRef.current = (e) => {
    if (!svgWrap.current) return
    setZoom((z) => zoomAt(e.clientX, e.clientY, z.s * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)), z))
  }

  const onPointerDown = (e) => {
    e.preventDefault()
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch { /* fine */ }
    if (pointers.current.size === 2) {
      // Second finger: it's a pinch — drop any stroke the first finger began.
      setDrawing(null)
      const { d, mx, my } = pinchInfo()
      gesture.current = { kind: 'pinch', d0: d, mx0: mx, my0: my, z0: zoom }
      return
    }
    if (pointers.current.size > 2) return
    if (markup) {
      const p = pointFrom(e)
      if (tool === 'text') { setTextAt(p); setTextValue(''); return }
      setDrawing(tool === 'pen' ? { t: 'pen', c: color, pts: [p] } : { t: tool, c: color, a: p, b: p })
      return
    }
    // Double-tap / double-click: zoom in on that spot, or back out.
    const now = Date.now()
    if (now - lastTap.current < 300) {
      lastTap.current = 0
      setZoom(zoom.s > 1 ? { s: 1, x: 0, y: 0 } : zoomAt(e.clientX, e.clientY, 2.5))
      return
    }
    lastTap.current = now
    if (zoom.s > 1) gesture.current = { kind: 'pan', x0: e.clientX, y0: e.clientY, z0: zoom }
  }
  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    if (g?.kind === 'pinch' && pointers.current.size === 2) {
      const { d, mx, my } = pinchInfo()
      // Scale around where the pinch started, and follow the fingers as they move.
      const z = zoomAt(g.mx0, g.my0, g.z0.s * (d / g.d0), g.z0)
      setZoom(clampZoom({ ...z, x: z.x + mx - g.mx0, y: z.y + my - g.my0 }))
      return
    }
    if (g?.kind === 'pan') {
      setZoom(clampZoom({ ...g.z0, x: g.z0.x + e.clientX - g.x0, y: g.z0.y + e.clientY - g.y0 }))
      return
    }
    if (!drawing) return
    const p = pointFrom(e)
    setDrawing((d) => (d.t === 'pen' ? { ...d, pts: [...d.pts, p] } : { ...d, b: p }))
  }
  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId)
    if (gesture.current) {
      if (pointers.current.size === 0) gesture.current = null
      return
    }
    if (!drawing) return
    const d = drawing
    const tiny = d.t === 'pen' ? d.pts.length < 2 : Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]) < 0.01
    if (!tiny) setShapes((s) => [...s, d])
    setDrawing(null)
  }
  const addText = () => {
    if (textValue.trim()) setShapes((s) => [...s, { t: 'text', c: color, p: textAt, text: textValue.trim().slice(0, 80) }])
    setTextAt(null)
  }
  const startMarkup = () => { setShapes(savedShapes); setMarkup(true) }
  const saveMarkup = async () => {
    setSaving(true)
    await patch({ annotations: shapes.length ? { v: 1, shapes } : null })
    setSaving(false); setMarkup(false)
  }

  const shown = markup ? [...shapes, ...(drawing ? [drawing] : [])] : savedShapes

  // Swipe to the next / previous photo — only when not zoomed in and it was
  // a one-finger swipe (not the end of a pinch).
  const onTouchStart = (e) => { touchStart.current = !markup && zoom.s === 1 && e.touches.length === 1 ? e.touches[0].clientX : null }
  const onTouchEnd = (e) => {
    if (markup || zoom.s !== 1 || touchStart.current == null || e.touches.length) { touchStart.current = null; return }
    const dx = e.changedTouches[0].clientX - touchStart.current
    touchStart.current = null
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1)
  }

  const chip = (on) => `rounded-full px-3.5 py-2 text-sm font-semibold border transition-colors ${on ? 'bg-white text-gray-900 border-white' : 'border-white/30 text-white/80'}`
  const iconBtn = 'w-11 h-11 rounded-full flex items-center justify-center text-white/90 hover:bg-white/10 active:bg-white/20'

  return createPortal(
    <div className="fixed inset-0 z-[1200] bg-black flex flex-col select-none" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      {/* Top bar */}
      <div className="shrink-0 flex items-center justify-between px-2 py-2 text-white">
        <button className={iconBtn} onClick={markup ? () => setMarkup(false) : onClose} aria-label="Close">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        <span className="text-sm font-semibold text-white/80">{markup ? t('quotes.photos.markup') : `${index + 1} / ${photos.length}`}</span>
        {canEdit && !markup ? (
          <button className={iconBtn} onClick={remove} aria-label={t('quotes.photos.delete')}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3" /></svg>
          </button>
        ) : <span className="w-11" />}
      </div>

      {/* Photo */}
      <div ref={stageRef} className="relative flex-1 min-h-0 overflow-hidden flex items-center justify-center px-2"
        onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {!markup && photos.length > 1 && (
          <button className={`${iconBtn} absolute left-2 z-10 hidden sm:flex bg-black/40`} onClick={() => go(-1)} aria-label="Previous">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" /></svg>
          </button>
        )}
        <div ref={svgWrap} className="relative inline-block max-w-full max-h-full"
          style={{ touchAction: 'none', transformOrigin: '0 0', transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.s})` }}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <img src={photo.url} alt={photo.caption ?? ''} draggable={false}
            onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            className="block max-w-full object-contain" style={{ maxHeight: stageH ? stageH - 8 : 'calc(100svh - 250px)' }} />
          <AnnotationLayer shapes={shown} width={natural.w} height={natural.h} className={markup ? 'cursor-crosshair' : 'pointer-events-none'} />
        </div>
        {!markup && photos.length > 1 && (
          <button className={`${iconBtn} absolute right-2 z-10 hidden sm:flex bg-black/40`} onClick={() => go(1)} aria-label="Next">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" /></svg>
          </button>
        )}
      </div>

      {/* Bottom panel */}
      <div className="shrink-0 px-4 pt-3 text-white" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
        {markup ? (
          <div className="flex flex-col gap-3 max-w-xl mx-auto">
            {textAt ? (
              <div className="flex gap-2">
                <input autoFocus value={textValue} onChange={(e) => setTextValue(e.target.value)} placeholder={t('quotes.photos.textPlaceholder')}
                  onKeyDown={(e) => e.key === 'Enter' && addText()}
                  className="flex-1 rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-base text-white placeholder-white/40 outline-none focus:border-white/60" />
                <button onClick={addText} className="rounded-xl bg-white text-gray-900 px-4 font-semibold">{t('quotes.photos.addText')}</button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="flex items-center justify-center gap-1.5">
                  {TOOLS.map((tl) => (
                    <button key={tl} onClick={() => setTool(tl)} aria-label={t(`quotes.photos.tools.${tl}`)}
                      className={`w-11 h-11 rounded-xl flex items-center justify-center ${tool === tl ? 'bg-white text-gray-900' : 'bg-white/10 text-white'}`}>
                      <ToolIcon tool={tl} />
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-center gap-3">
                  {MARKUP_COLORS.map((c) => (
                    <button key={c} onClick={() => setColor(c)} aria-label={c}
                      className={`w-8 h-8 rounded-full border-2 transition-transform ${color === c ? 'border-white scale-110' : 'border-white/30'}`} style={{ background: c }} />
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => setShapes((s) => s.slice(0, -1))} disabled={!shapes.length}
                className="rounded-xl bg-white/10 py-3 text-sm font-semibold disabled:opacity-40">{t('quotes.photos.undo')}</button>
              <button onClick={() => setShapes([])} disabled={!shapes.length}
                className="rounded-xl bg-white/10 py-3 text-sm font-semibold disabled:opacity-40">{t('quotes.photos.clear')}</button>
              <button onClick={saveMarkup} disabled={saving}
                className="rounded-xl bg-brand-500 py-3 text-sm font-bold disabled:opacity-60">{t('quotes.photos.saveMarkup')}</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 max-w-xl mx-auto">
            {(() => {
              const ni = notes.findIndex((n) => n.id === photo.note_id)
              return ni >= 0 && notes[ni].body ? (
                <p className="text-sm text-white/80 text-center"><span className="font-bold text-white">{t('quotes.walk.noteN', { n: ni + 1 })}</span> · {notes[ni].body}</p>
              ) : null
            })()}
            {canEdit ? (
              <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder={t('quotes.photos.captionPlaceholder')}
                onBlur={() => caption !== (photo.caption ?? '') && patch({ caption })}
                className="w-full rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-base text-white placeholder-white/40 outline-none focus:border-white/60" />
            ) : photo.caption ? (
              <p className="text-base text-center">{photo.caption}</p>
            ) : null}
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {canEdit ? (
                <>
                  <button className={chip(!!photo.is_before)} onClick={() => patch({ is_before: !photo.is_before })}>{t('quotes.photos.before')}</button>
                  <button className={chip(!!photo.is_reference)} onClick={() => patch({ is_reference: !photo.is_reference })}>{t('quotes.photos.reference')}</button>
                  <button className="rounded-full px-4 py-2 text-sm font-bold bg-brand-500 text-white flex items-center gap-1.5" onClick={startMarkup}>
                    <ToolIcon tool="pen" /> {t('quotes.photos.markup')}
                  </button>
                </>
              ) : (
                <>
                  {!!photo.is_before && <span className={chip(true)}>{t('quotes.photos.before')}</span>}
                  {!!photo.is_reference && <span className={chip(true)}>{t('quotes.photos.reference')}</span>}
                </>
              )}
            </div>
            <p className="text-xs text-white/50 text-center">
              {[photo.uploaded_by_name, fmtDateTime(photo.taken_at || photo.uploaded_at, i18n.language)].filter(Boolean).join(' · ')}
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
