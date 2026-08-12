import { fileKind, extOf } from '../utils/fileKind'

const VideoIcon = ({ s = 'w-5 h-5' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="2" y="5" width="15" height="14" rx="2"/><path strokeLinecap="round" strokeLinejoin="round" d="M17 10l5-3v10l-5-3"/></svg>
const PdfIcon = ({ s = 'w-5 h-5' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 2h6l5 5v13a2 2 0 01-2 2H7a2 2 0 01-2-2V4a2 2 0 012-2z"/><path strokeLinecap="round" strokeLinejoin="round" d="M14 2v5h5"/></svg>
const WordIcon = PdfIcon
const ExcelIcon = PdfIcon
const CadIcon = ({ s = 'w-5 h-5' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="3" width="18" height="18" rx="1.5"/><path strokeLinecap="round" strokeLinejoin="round" d="M7 3v18M3 8h4M3 15h4M11 6h7M11 11h7v7h-7z"/></svg>
const FileIcon = ({ s = 'w-5 h-5' }) => <svg className={s} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 2h6l5 5v13a2 2 0 01-2 2H7a2 2 0 01-2-2V4a2 2 0 012-2z"/><path strokeLinecap="round" strokeLinejoin="round" d="M14 2v5h5"/></svg>

// Color + icon per file kind — the point is a document's TYPE is
// recognizable at a glance across a whole section, before ever reading the
// filename. Images get a real rendered thumbnail instead of a badge (a
// photo of a site condition looks nothing like another one; an icon would
// erase exactly the detail that makes it findable).
const BADGES = {
  video: { icon: VideoIcon, className: 'bg-purple-100 text-purple-600' },
  pdf:   { icon: PdfIcon,   className: 'bg-red-100 text-red-600' },
  word:  { icon: WordIcon,  className: 'bg-blue-100 text-blue-600' },
  excel: { icon: ExcelIcon, className: 'bg-emerald-100 text-emerald-600' },
  cad:   { icon: CadIcon,   className: 'bg-amber-100 text-amber-600' },
  other: { icon: FileIcon,  className: 'bg-gray-100 text-gray-500' },
}

export default function DocumentThumbnail({ filename, url, size = 'w-11 h-11' }) {
  const kind = filename ? fileKind(filename) : 'other'

  if (kind === 'image' && url) {
    return (
      <div className={`${size} rounded-lg overflow-hidden bg-gray-100 shrink-0 flex items-center justify-center`}>
        <img src={url} alt="" className="w-full h-full object-cover" />
      </div>
    )
  }

  if (kind === 'video' && url) {
    return (
      <div className={`${size} rounded-lg overflow-hidden bg-gray-900 shrink-0 relative flex items-center justify-center`}>
        <video src={url} className="w-full h-full object-cover" muted preload="metadata" />
        <VideoIcon s="w-4 h-4 text-white absolute drop-shadow" />
      </div>
    )
  }

  const badge = BADGES[kind] ?? BADGES.other
  const Icon = badge.icon
  return (
    <div className={`${size} rounded-lg shrink-0 flex flex-col items-center justify-center gap-0.5 ${badge.className}`}>
      <Icon s="w-4 h-4" />
      {filename && <span className="text-[8px] font-bold uppercase leading-none">{extOf(filename)}</span>}
    </div>
  )
}
