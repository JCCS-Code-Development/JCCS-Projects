import { useState } from 'react'

// Markup drawn over a photo (arrows, circles, lines, freehand, text).
// Stored on the photo as { v: 1, shapes: [...] } with every coordinate
// normalized to 0..1 of the image, so it lines up at any display size.
// Rendered in the image's own pixel space (viewBox = natural size) so arrow
// heads and text keep their proportions on wide or tall photos.
//
// Shapes:
//   { t: 'pen',    c, pts: [[x, y], ...] }
//   { t: 'arrow' | 'line' | 'circle', c, a: [x, y], b: [x, y] }
//   { t: 'text',   c, p: [x, y], text }

function Shape({ s, w, h, sw }) {
  const X = (v) => v[0] * w
  const Y = (v) => v[1] * h
  const common = { stroke: s.c, strokeWidth: sw, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }
  switch (s.t) {
    case 'pen':
      return <polyline {...common} points={s.pts.map((p) => `${p[0] * w},${p[1] * h}`).join(' ')} />
    case 'line':
      return <line {...common} x1={X(s.a)} y1={Y(s.a)} x2={X(s.b)} y2={Y(s.b)} />
    case 'circle': {
      const cx = (X(s.a) + X(s.b)) / 2, cy = (Y(s.a) + Y(s.b)) / 2
      return <ellipse {...common} cx={cx} cy={cy} rx={Math.abs(X(s.b) - X(s.a)) / 2} ry={Math.abs(Y(s.b) - Y(s.a)) / 2} />
    }
    case 'arrow': {
      const x1 = X(s.a), y1 = Y(s.a), x2 = X(s.b), y2 = Y(s.b)
      const ang = Math.atan2(y2 - y1, x2 - x1)
      const head = sw * 6
      const p1 = [x2 - head * Math.cos(ang - Math.PI / 7), y2 - head * Math.sin(ang - Math.PI / 7)]
      const p2 = [x2 - head * Math.cos(ang + Math.PI / 7), y2 - head * Math.sin(ang + Math.PI / 7)]
      return (
        <g>
          <line {...common} x1={x1} y1={y1} x2={x2} y2={y2} />
          <polygon points={`${x2},${y2} ${p1[0]},${p1[1]} ${p2[0]},${p2[1]}`} fill={s.c} stroke={s.c} strokeWidth={sw / 2} strokeLinejoin="round" />
        </g>
      )
    }
    case 'text':
      return (
        <text x={X(s.p)} y={Y(s.p)} fill={s.c} fontSize={sw * 6} fontWeight="700" fontFamily="system-ui, sans-serif"
          stroke="rgba(0,0,0,0.75)" strokeWidth={sw * 0.9} paintOrder="stroke" dominantBaseline="middle">
          {s.text}
        </text>
      )
    default:
      return null
  }
}

export default function AnnotationLayer({ shapes = [], width, height, className = '', weight = 1, ...rest }) {
  if (!width || !height) return null
  const sw = Math.max(width, height) * 0.007 * weight
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={`absolute inset-0 w-full h-full ${className}`} {...rest}>
      {shapes.map((s, i) => <Shape key={i} s={s} w={width} h={height} sw={sw} />)}
    </svg>
  )
}

// A cropped (object-cover) thumbnail with its markup drawn on top, cropped
// the same way so arrows land where they were drawn. Lines are drawn a bit
// heavier so they still read at thumbnail size.
export function MarkedImage({ src, shapes, className = '', imgClassName = '', alt = '' }) {
  const [size, setSize] = useState({ w: 0, h: 0 })
  return (
    <span className={`relative block ${className}`}>
      <img src={src} alt={alt} loading="lazy" className={`w-full h-full object-cover ${imgClassName}`}
        onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
      {shapes?.length > 0 && (
        <AnnotationLayer shapes={shapes} width={size.w} height={size.h} weight={2.5}
          preserveAspectRatio="xMidYMid slice" className="pointer-events-none" />
      )}
    </span>
  )
}
