// Turning site-visit photos into files the office can attach to an estimate
// in InvoiceToGo: single photos (with their markup drawn on) and a 2×2
// collage PNG.

const isTouch = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

// Photos live on the same site as the app in production, so fetching them
// as blobs keeps the canvas exportable.
async function loadBitmap(url) {
  const blob = await fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Could not load photo (${r.status})`)
    return r.blob()
  })
  if (window.createImageBitmap) {
    try { return await createImageBitmap(blob) } catch { /* fall back to <img> */ }
  }
  const src = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.src = src
    await img.decode()
    return img
  } finally { URL.revokeObjectURL(src) }
}

// Same drawing as AnnotationLayer, onto a canvas. (x, y, w, h) is where the
// whole photo sits on the canvas — for a cropped tile it can spill past the
// tile, which the caller clips.
function drawShapes(ctx, shapes, x, y, w, h, weight = 1) {
  const sw = Math.max(w, h) * 0.007 * weight
  const X = (p) => x + p[0] * w
  const Y = (p) => y + p[1] * h
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = sw
  for (const s of shapes ?? []) {
    ctx.strokeStyle = s.c
    ctx.fillStyle = s.c
    ctx.beginPath()
    if (s.t === 'pen') {
      s.pts.forEach((p, i) => (i ? ctx.lineTo(X(p), Y(p)) : ctx.moveTo(X(p), Y(p))))
      ctx.stroke()
    } else if (s.t === 'line') {
      ctx.moveTo(X(s.a), Y(s.a)); ctx.lineTo(X(s.b), Y(s.b)); ctx.stroke()
    } else if (s.t === 'circle') {
      const cx = (X(s.a) + X(s.b)) / 2, cy = (Y(s.a) + Y(s.b)) / 2
      ctx.ellipse(cx, cy, Math.abs(X(s.b) - X(s.a)) / 2, Math.abs(Y(s.b) - Y(s.a)) / 2, 0, 0, Math.PI * 2)
      ctx.stroke()
    } else if (s.t === 'arrow') {
      const x1 = X(s.a), y1 = Y(s.a), x2 = X(s.b), y2 = Y(s.b)
      const ang = Math.atan2(y2 - y1, x2 - x1)
      const head = sw * 6
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(x2, y2)
      ctx.lineTo(x2 - head * Math.cos(ang - Math.PI / 7), y2 - head * Math.sin(ang - Math.PI / 7))
      ctx.lineTo(x2 - head * Math.cos(ang + Math.PI / 7), y2 - head * Math.sin(ang + Math.PI / 7))
      ctx.closePath(); ctx.fill()
    } else if (s.t === 'text') {
      ctx.font = `700 ${sw * 6}px system-ui, sans-serif`
      ctx.textBaseline = 'middle'
      ctx.lineWidth = sw * 0.9
      ctx.strokeStyle = 'rgba(0,0,0,0.75)'
      ctx.strokeText(s.text, X(s.p), Y(s.p))
      ctx.fillText(s.text, X(s.p), Y(s.p))
      ctx.lineWidth = sw
    }
  }
  ctx.restore()
}

const toBlob = (canvas, type, quality) => new Promise((resolve, reject) =>
  canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create the image'))), type, quality))

const hasMarkup = (photo) => (photo.annotations?.shapes?.length ?? 0) > 0

// One photo as a file. With markup it's redrawn at full size with the markup
// on it; without, the original file is used as-is.
export async function photoFile(photo, name, { markup = true } = {}) {
  if (!markup || !hasMarkup(photo)) {
    const blob = await fetch(photo.url).then((r) => r.blob())
    const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
    return new File([blob], `${name}.${ext}`, { type: blob.type || 'image/jpeg' })
  }
  const img = await loadBitmap(photo.url)
  const c = document.createElement('canvas')
  c.width = img.width; c.height = img.height
  const ctx = c.getContext('2d')
  ctx.drawImage(img, 0, 0)
  drawShapes(ctx, photo.annotations.shapes, 0, 0, c.width, c.height)
  return new File([await toBlob(c, 'image/jpeg', 0.92)], `${name}.jpg`, { type: 'image/jpeg' })
}

// 2×2 collage of 4 photos as a PNG.
//   fit 'cover'   — each photo fills its tile (edges may be trimmed)
//   fit 'contain' — the whole photo shows, on white
export async function collageFile(photos, name, { fit = 'cover', markup = true } = {}) {
  const TW = 1200, TH = 900, GAP = 16
  const c = document.createElement('canvas')
  c.width = TW * 2 + GAP * 3
  c.height = TH * 2 + GAP * 3
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, c.width, c.height)
  const imgs = await Promise.all(photos.map((p) => loadBitmap(p.url)))
  imgs.forEach((img, i) => {
    const tx = GAP + (i % 2) * (TW + GAP)
    const ty = GAP + Math.floor(i / 2) * (TH + GAP)
    const scale = fit === 'cover' ? Math.max(TW / img.width, TH / img.height) : Math.min(TW / img.width, TH / img.height)
    const w = img.width * scale, h = img.height * scale
    const x = tx + (TW - w) / 2, y = ty + (TH - h) / 2
    ctx.save()
    ctx.beginPath(); ctx.rect(tx, ty, TW, TH); ctx.clip()
    ctx.drawImage(img, x, y, w, h)
    if (markup && hasMarkup(photos[i])) drawShapes(ctx, photos[i].annotations.shapes, x, y, w, h)
    ctx.restore()
  })
  return new File([await toBlob(c, 'image/png')], `${name}.png`, { type: 'image/png' })
}

// Hand files to the user. On an iPad/phone that's the share sheet ("Save
// Image" puts them in Photos, where InvoiceToGo can attach them); on a
// computer they download.
export async function saveFiles(files) {
  if (isTouch() && navigator.canShare?.({ files })) {
    try { await navigator.share({ files }); return } catch (err) {
      if (err?.name === 'AbortError') return // closed the share sheet
    }
  }
  for (const f of files) {
    const url = URL.createObjectURL(f)
    const a = document.createElement('a')
    a.href = url; a.download = f.name
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
    // Browsers drop rapid back-to-back downloads; space them out.
    if (files.length > 1) await new Promise((r) => setTimeout(r, 350))
  }
}
