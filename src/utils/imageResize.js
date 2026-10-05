// Shrinks a phone photo before upload (job sites often have weak signal and
// a modern phone shot is 3–8MB). Long edge capped at maxEdge, re-encoded as
// JPEG. Anything the browser can't decode (e.g. HEIC on desktop Chrome) is
// returned untouched and the server takes it as-is.
export async function resizeImage(file, { maxEdge = 2400, quality = 0.85 } = {}) {
  if (!file.type.startsWith('image/') || typeof createImageBitmap !== 'function') return file
  let bitmap
  try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }) } catch { return file }
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  if (scale === 1 && file.type === 'image/jpeg' && file.size < 2.5 * 1024 * 1024) { bitmap.close?.(); return file }
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  if (!blob || blob.size >= file.size) return file
  const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
  return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified })
}
