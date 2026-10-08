// Trade sections of a JCCS Scope of Work, written from the office's real
// estimates (#4577, #4578, #4587, #4591, #4599 — see scope.test.js, which
// rebuilds each of them word for word).
//
// Every category is a pure function of the form answers and returns:
//   sections   [{ heading, bullets }]   in construction order
//   checks     Fit & Finish "Verify / Ensure…" bullets it contributes
//   defects    words for the "free of visible …" bullet
// The composer (index.js) orders categories, merges their contributions and
// wraps them in Work Area Preparation / Fit & Finish / Medical-Grade Cleaning /
// Finishing & Cleanup.

import { list, titleCase, cap, countWord } from './text'

const on = (c) => c && c.on

// ── Removal of one specific item (e.g. a bathtub) ───────────────────────────
export function itemRemoval(f) {
  const c = f.cats.itemRemoval
  if (!on(c)) return null
  const item = c.item || 'item'
  const bullets = []
  if (c.plumbing) bullets.push(`Disconnect the existing ${item} from accessible plumbing connections as required.`)
  bullets.push(`Remove the existing ${item} and associated trim, sealants, fasteners, and components.`)
  bullets.push(`Complete selective demolition as required to remove the ${item} without unnecessary damage to adjacent surfaces.`)
  bullets.push(disposalBullet(f))
  return { sections: [{ heading: `${titleCase(item)} Removal`, bullets }] }
}

function disposalBullet(f) {
  return f.ic === 'required'
    ? 'Remove and dispose of demolition materials in accordance with facility requirements.'
    : 'Remove and dispose of demolished materials and debris.'
}

// ── Selective demolition of affected materials, or full wallboard removal ──
export function demo(f) {
  const c = f.cats.demo
  if (!on(c)) return null
  if (c.mode === 'wallboard') {
    return {
      sections: [
        { heading: 'Existing Wallboard Removal', bullets: [
          'Remove all designated existing wallboards and associated damaged materials.',
          'Remove fasteners, trim, sealants, and loose materials as required.',
          'Protect framing, utilities, and adjacent components scheduled to remain.',
          disposalBullet(f),
        ] },
        { heading: 'Wall Preparation', bullets: [
          'Inspect the exposed framing and supporting conditions after wallboard removal.',
          'Clean and prepare the exposed installation areas.',
          'Provide blocking, fasteners, and minor reinforcement as required for the new drywall installation.',
          'Exclude concealed framing, utility, or moisture-source repairs unless otherwise specified.',
        ] },
      ],
    }
  }
  const bullets = []
  if (c.wallDrywall) bullets.push('Remove the designated damaged or affected wall drywall as required.')
  if (c.insulation) bullets.push('Remove the designated existing insulation within the affected wall areas.')
  if (c.coveBase && c.solidCeiling) bullets.push('Remove affected cove base and damaged portions of the solid drywall ceiling as required.')
  else if (c.coveBase) bullets.push('Remove affected cove base as required.')
  else if (c.solidCeiling) bullets.push('Remove damaged portions of the solid drywall ceiling as required.')
  if (c.other) bullets.push(`Remove the designated ${c.other} as required.`)
  bullets.push(c.solidCeiling
    ? 'Protect framing, utilities, ceiling components, and adjacent materials scheduled to remain.'
    : 'Protect framing, utilities, and adjacent materials scheduled to remain.')
  bullets.push(disposalBullet(f))
  return { sections: [{ heading: 'Selective Demolition', bullets }] }
}

// ── Plumbing (never assumed — only when explicitly selected) ───────────────
export function plumbing(f) {
  const c = f.cats.plumbing
  if (!on(c)) return null
  const bullets = []
  if (c.work === 'cap') {
    bullets.push('Cap the existing accessible water-supply and drain connections as required.')
    bullets.push('Secure capped plumbing connections within the wall or floor assembly as applicable.')
    bullets.push('Test accessible capped connections for visible leaks before closing the affected surfaces.')
  } else if (c.work === 'reconnect') {
    bullets.push('Disconnect and reconnect the existing accessible plumbing connections as required.')
    bullets.push('Provide new supply lines and compatible fittings as required.')
    bullets.push('Test accessible connections for visible leaks after reconnection.')
  }
  bullets.push('Exclude concealed plumbing relocation, replacement, or repairs beyond the immediate work area unless otherwise specified.')
  return {
    sections: [{ heading: 'Plumbing Modifications', bullets }],
    checks: c.work === 'cap' ? ['Verify accessible plumbing connections are properly capped and concealed.'] : ['Verify accessible plumbing connections are secure and free of visible leaks.'],
  }
}

// ── Framing (e.g. closing in a former tub alcove as storage) ───────────────
export function framing(f) {
  const c = f.cats.framing
  if (!on(c)) return null
  const purpose = c.purpose || 'designated space'
  const short = purpose.replace(/\s+(space|area)$/i, '')
  const area = c.area || 'designated area'
  const withPlumbing = on(f.cats.plumbing)
  return {
    sections: [{ heading: `Framing & ${titleCase(purpose)} Preparation`, bullets: [
      `Frame the ${area} as required to create the designated ${purpose}.`,
      'Provide blocking, anchors, fasteners, and reinforcement as necessary.',
      `Coordinate the framing layout with existing ${withPlumbing ? 'plumbing, walls, and surrounding conditions' : 'walls and surrounding conditions'}.`,
      `Prepare the area to provide a clean and functional ${short} configuration.`,
    ] }],
    after: [`Ensure the converted ${short} area has clean, finished transitions at adjacent surfaces.`],
  }
}

// ── Antimicrobial treatment — never promises certified mold remediation ───
export function antimicrobial(f) {
  const c = f.cats.antimicrobial
  if (!on(c)) return null
  return { sections: [{ heading: 'Antimicrobial Treatment', bullets: [
    'Clean and prepare exposed framing and designated surfaces before reconstruction.',
    'Apply an approved antimicrobial treatment to the affected exposed surfaces as required.',
    'Allow treated areas to dry in accordance with manufacturer recommendations before installing replacement materials.',
    'Exclude specialized mold testing, laboratory analysis, and certified mold remediation unless otherwise specified.',
  ] }] }
}

const DRYWALL_TYPE = { standard: '', 'mold-resistant': 'mold-resistant', 'moisture-resistant': 'moisture-resistant', 'fire-rated': 'fire-rated' }

// ── Drywall: new over framing / replacement of affected / full new walls ──
export function drywall(f) {
  const c = f.cats.drywall
  if (!on(c)) return null
  const type = DRYWALL_TYPE[c.type] ?? ''
  const sections = []
  if (c.mode === 'replace') {
    const bullets = []
    if (c.insulation) bullets.push('Provide and install new insulation within the designated wall cavities.')
    bullets.push(`Provide and install replacement ${type ? `${type} ` : ''}drywall to match the existing wall assembly as closely as possible.`)
    bullets.push('Provide required backing, blocking, fasteners, and reinforcement.')
    bullets.push('Tape and finish joints, corners, fastener locations, and transitions.')
    bullets.push('Patch and sand repaired surfaces to provide a smooth, uniform finish.')
    sections.push({ heading: `${c.insulation ? 'Insulation & ' : ''}Wall Drywall Replacement`, bullets })
  } else if (c.mode === 'full') {
    sections.push({ heading: `${type ? `${titleCase(type)} ` : ''}Drywall Installation`, bullets: [
      ...(c.insulation ? ['Provide and install new insulation within the designated wall cavities.'] : []),
      `Provide and install new ${type ? `${type} ` : ''}drywall throughout the designated wall areas.`,
      'Cut and fit drywall neatly around outlets, penetrations, corners, doors, and fixed components.',
      'Secure the drywall to the supporting structure using compatible fasteners.',
      'Tape and finish joints, corners, edges, fastener locations, and transitions.',
    ] })
  } else {
    sections.push({ heading: 'Drywall Installation & Repairs', bullets: [
      ...(c.insulation ? ['Provide and install new insulation within the designated wall cavities.'] : []),
      `Provide and install ${type ? `${type} ` : ''}drywall over the new framing and affected wall areas.`,
      'Cut and fit drywall around existing penetrations and adjacent components as required.',
      'Tape and finish joints, corners, fastener locations, and transitions.',
      'Patch and sand affected surfaces to provide a smooth, uniform finish.',
    ] })
  }
  if (Number(c.finishLevel) === 5) {
    sections.push({ heading: 'Level 5 Drywall Finish', bullets: [
      'Apply joint compound and skim coating as required to achieve a Level 5 drywall finish.',
      'Sand finished surfaces to provide a smooth, uniform appearance.',
      'Inspect completed surfaces under available lighting conditions and complete touch-ups as required.',
      'Prepare the finished drywall to receive primer and paint.',
    ] })
  }
  return { sections }
}

// ── Solid drywall (hard-lid) ceiling repair — no tile/grid language ────────
export function ceiling(f) {
  const c = f.cats.ceiling
  if (!on(c)) return null
  return { sections: [{ heading: 'Solid Drywall Ceiling Repair', bullets: [
    'Provide and install replacement drywall at the affected solid-ceiling areas.',
    'Provide backing, blocking, fasteners, and reinforcement as required.',
    'Tape and finish joints, fastener locations, edges, and transitions.',
    'Patch and sand the repaired ceiling surfaces to provide a smooth, uniform finish.',
    'Match the adjacent existing ceiling texture and appearance as closely as possible.',
  ] }] }
}

// ── Window film ─────────────────────────────────────────────────────────────
export function windowFilm(f) {
  const c = f.cats.windowFilm
  if (!on(c)) return null
  const film = c.film || 'frosted'
  const where = f.locations ? ` in ${f.locations}` : ''
  return {
    sections: [
      { heading: 'Window Surface Preparation', bullets: [
        'Inspect the designated glass surfaces for damage or conditions that may affect film adhesion.',
        'Clean the glass to remove dust, dirt, grease, adhesive residue, and surface contaminants.',
        'Remove minor surface residue using methods compatible with the existing glazing.',
        'Prepare the glass according to the film manufacturer’s recommendations.',
      ] },
      { heading: `${titleCase(film)} Window Film Installation`, bullets: [
        `Provide and install ${film} privacy film on the designated windows${where}.`,
        'Coordinate the film pattern, opacity, color, coverage, orientation, and finished appearance with the approved selection.',
        'Field cut and fit the film to the verified glass dimensions.',
        'Apply the film uniformly with clean edges and consistent spacing at frames and glazing components.',
        'Remove visible air pockets, wrinkles, creases, and excess installation solution.',
        'Complete the installation according to manufacturer recommendations.',
      ] },
    ],
    checks: [
      `Verify the ${film} film is properly aligned, fully adhered, and provides the intended level of privacy.`,
      ...(f.allRoomsPhrase ? [`Ensure film coverage and orientation are consistent throughout ${f.allRoomsPhrase}.`] : []),
    ],
    defects: ['bubbles', 'wrinkles', 'peeling edges', 'scratches'],
    replacesDefects: true,
    after: ['Ensure completed work has clean transitions and a uniform finished appearance.'],
  }
}

// ── New window in a wall opening (e.g. a frosted sliding pass window) ──────
export function window(f) {
  const c = f.cats.window
  if (!on(c)) return null
  const kind = c.kind || 'sliding'
  const glazing = c.glazing || ''
  const qty = Number(c.qty) || 1
  const size = c.width && c.height ? ` measuring ${c.approx ? 'approximately ' : ''}${c.width} inches by ${c.height} inches` : ''
  const noun = `${glazing ? `${glazing} ` : ''}${kind} window${qty > 1 ? 's' : ''}`
  const sections = [
    { heading: 'Opening Preparation', bullets: [
      `Prepare the designated wall opening to receive the new ${kind} window.`,
      'Complete minor modifications to the opening as required.',
      'Provide framing, blocking, anchors, fasteners, and reinforcement as necessary.',
      'Exclude structural modifications and relocation of concealed utilities unless otherwise specified.',
    ] },
    { heading: `${titleCase(kind)} Window Installation`, bullets: [
      `Provide and install ${countWord(qty)} ${noun}${size}.`,
      `Provide a compatible frame, ${kind === 'sliding' ? 'sliding track, ' : ''}glazing, pulls, stops, guides, and associated hardware.`,
      'Set, level, align, anchor, and securely fasten the window assembly within the opening.',
      'Apply compatible sealant around the frame perimeter and adjacent transitions as required.',
      ...(kind === 'sliding' ? ['Adjust the sliding panel to provide smooth operation and secure closure.'] : []),
    ] },
  ]
  if (c.touchUp !== false) {
    sections.push({ heading: 'Patching & Touch-Ups', bullets: [
      'Patch minor wall damage resulting from the window installation.',
      'Sand repaired areas to provide smooth, uniform surfaces.',
      'Apply compatible primer and touch-up paint using the approved color and sheen as required.',
      'Match adjacent existing finishes as closely as possible.',
    ] })
  }
  return {
    sections,
    checks: [
      'Verify the window and frame are properly aligned, securely fastened, and stable.',
      ...(kind === 'sliding' ? ['Verify the sliding panel opens, closes, and operates smoothly as intended.'] : []),
      `Ensure the ${glazing ? `${glazing} ` : ''}glazing, edges, and transitions have a clean, finished appearance.`,
    ],
    defects: ['sharp edges', 'scratches'],
  }
}

// ── Priming & painting ──────────────────────────────────────────────────────
//  match: touch up / repaint affected surfaces to match existing.
//  full:  new finish over the new walls (named color), optional exterior door.
export function painting(f) {
  const c = f.cats.painting
  if (!on(c)) return null
  const dw = f.cats.drywall
  const repair = on(dw) && dw.mode === 'replace'
  const withCeiling = on(f.cats.ceiling)
  if (c.mode === 'full') {
    const bullets = [
      'Apply compatible primer to all new drywall and repaired surfaces.',
      `Apply ${c.color ? `${c.color} ` : ''}finish paint to the new walls and designated general areas.`,
      'Apply additional coats and complete touch-ups as required for uniform coverage.',
    ]
    if (c.exteriorDoor) {
      bullets.push('Prepare, prime, and paint the designated exterior door using a compatible exterior coating system.')
      bullets.push('Coordinate the exterior door color and sheen with the approved selection.')
    }
    bullets.push('Complete all coating applications according to manufacturer recommendations.')
    return {
      sections: [{ heading: 'Priming & Painting', bullets }],
      checks: ['Verify painted surfaces have consistent color, sheen, and coverage.'],
      defects: ['paint drips'],
    }
  }
  return {
    sections: [{ heading: repair ? 'Patching & Painting' : 'Priming & Painting', bullets: [
      `Apply compatible primer to new drywall and repaired ${withCeiling ? 'wall and ceiling surfaces' : 'surfaces'} as required.`,
      c.color
        ? `Apply ${c.color} finish paint using the approved ${withCeiling ? 'sheens' : 'sheen'}.`
        : `Apply finish paint using the approved ${withCeiling ? 'colors and sheens' : 'color and sheen'}.`,
      'Apply additional coats and complete touch-ups as required for uniform coverage.',
      'Match adjacent existing finishes as closely as possible.',
    ] }],
    // Touch-up work on repairs doesn't promise "no paint drips" separately.
    defects: repair ? [] : ['paint drips'],
  }
}

// ── Cove base: replace to match existing, or new in a named color ──────────
export function coveBase(f) {
  const c = f.cats.coveBase
  if (!on(c)) return null
  if (c.mode === 'new') {
    return {
      sections: [{ heading: 'Cove Base Installation', bullets: [
        `Provide and install new cove base${c.color ? ` in the ${c.color} color` : ''} throughout the designated areas.`,
        'Coordinate the approved material, height, and profile before installation.',
        'Provide compatible adhesive and installation materials.',
        'Cut and fit the cove base neatly around corners, door frames, and transitions.',
        'Provide clean seams, edges, and terminations.',
      ] }],
      checks: [`Verify the ${c.color ? `${c.color} ` : ''}cove base is properly aligned and securely adhered.`],
    }
  }
  return { sections: [{ heading: 'Cove Base Replacement', bullets: [
    'Prepare the affected wall and floor transitions to receive the new cove base.',
    'Provide and install replacement cove base to match the existing material, height, color, and profile as closely as possible.',
    'Cut and fit the cove base neatly around corners, openings, and adjacent components.',
    'Provide clean seams, edges, and terminations.',
  ] }] }
}

// ── Anything else: free-form sections the user writes ──────────────────────
export function other(f) {
  const c = f.cats.other
  if (!on(c)) return null
  const sections = (c.sections ?? [])
    .map((s) => ({ heading: (s.heading ?? '').trim(), bullets: (s.bullets ?? []).map((b) => cap(String(b).trim())).filter(Boolean) }))
    .filter((s) => s.heading && s.bullets.length)
  return sections.length ? { sections } : null
}

// Construction order of the trade sections.
export const ORDER = [itemRemoval, demo, plumbing, framing, antimicrobial, drywall, ceiling, windowFilm, window, painting, coveBase, other]

// Fit & Finish checks that depend on several categories at once.
export function structuralChecks(f) {
  const { framing: fr, drywall: dw, demo: dm, coveBase: cb, ceiling: cl, painting: pt } = f.cats
  const checks = []
  if (on(dw) && dw.mode === 'replace') {
    const items = [dw.insulation && 'insulation', 'wall drywall', on(cl) && 'solid-ceiling drywall', on(cb) && cb.mode !== 'new' && 'cove base']
    checks.push(`Verify the replacement ${list(items)} are properly installed and securely supported.`)
  } else if (on(dw) && dw.mode === 'full') {
    checks.push(Number(dw.finishLevel) === 5
      ? 'Verify the new drywall is properly aligned, securely fastened, and finished to a Level 5 standard.'
      : 'Verify the new drywall is properly aligned, securely fastened, and stable.')
  } else if (on(fr) && on(dw)) {
    checks.push('Verify the new framing and drywall are properly aligned, securely fastened, and stable.')
  } else if (on(fr)) {
    checks.push('Verify the new framing is properly aligned, securely fastened, and stable.')
  } else if (on(dw)) {
    checks.push('Verify the new drywall is properly aligned, securely fastened, and stable.')
  }
  const blendRepair = on(dw) && dw.mode === 'replace' && on(pt)
  const blendFull = on(dw) && dw.mode === 'full'
  const coveRepairTransitions = on(cb) && cb.mode !== 'new'
    ? (on(cl) ? 'Verify the cove base and repaired ceiling have clean, uniform transitions.' : 'Verify the cove base has clean, uniform transitions.')
    : null
  return { checks, blendRepair, blendFull, coveRepairTransitions, demoOn: on(dm) }
}
