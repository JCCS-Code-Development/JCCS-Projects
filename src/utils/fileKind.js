// Single source of truth for "what kind of file is this" — drives both the
// thumbnail badge (DocumentThumbnail) and which viewer DocumentPreviewModal
// renders. Keep this in sync with the backend ALLOWED_EXTENSIONS in
// documents/*.php and submittals/*.php.
const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp']
const VIDEO_EXT = ['mp4', 'mov', 'webm']
const PDF_EXT = ['pdf']
const WORD_EXT = ['doc', 'docx']
const EXCEL_EXT = ['xls', 'xlsx']
const CAD_EXT = ['dwg', 'dxf']

export function extOf(filename) {
  return (filename?.split('.').pop() || '').toLowerCase()
}

// 'image' | 'video' | 'pdf' | 'word' | 'excel' | 'cad' | 'other'
export function fileKind(filename) {
  const ext = extOf(filename)
  if (IMAGE_EXT.includes(ext)) return 'image'
  if (VIDEO_EXT.includes(ext)) return 'video'
  if (PDF_EXT.includes(ext)) return 'pdf'
  if (WORD_EXT.includes(ext)) return 'word'
  if (EXCEL_EXT.includes(ext)) return 'excel'
  if (CAD_EXT.includes(ext)) return 'cad'
  return 'other'
}

// Only these actually render inline in DocumentPreviewModal — everything
// else falls back to a "no preview available" state with a download link.
export function isPreviewable(filename) {
  const kind = fileKind(filename)
  return kind === 'image' || kind === 'video' || kind === 'pdf'
}
