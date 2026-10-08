// Acceptance test for the scope generator: each case is one of the office's
// real InvoiceToGo estimates, retyped from the PDF, paired with the structured
// answers a field manager would give. The generator must reproduce the
// estimate word for word.
import { describe, expect, it } from 'vitest'
import { generateScope, emptyForm } from './index'
import { list } from './text'

const cats = (on) => Object.fromEntries(Object.entries(on).map(([k, v]) => [k, { on: true, ...v }]))
const form = (o) => {
  const base = emptyForm()
  return { ...base, ...o, cats: { ...base.cats, ...cats(o.cats ?? {}) } }
}
const doc = (...sections) => ['Scope of Work', ...sections.map(([h, ...b]) => [h, ...b.map((x) => `• ${x}`)].join('\n'))].join('\n\n')

const CLEANUP = (leave = 'the affected area', removed = 'debris and materials generated during work activities') => [
  'Finishing & Cleanup',
  'Inspect completed work for quality and proper installation.',
  `Remove ${removed}.`,
  `Leave ${leave} clean, safe, and ready for use.`,
]

describe('text helpers', () => {
  it('uses the serial comma', () => {
    expect(list(['a'])).toBe('a')
    expect(list(['a', 'b'])).toBe('a and b')
    expect(list(['a', 'b', 'c'])).toBe('a, b, and c')
  })
})

describe('JCCS sample estimates', () => {
  it('#4599 — frosted window film, exam rooms 7–10', () => {
    const g = generateScope(form({
      title: 'Option 2: Frosted Window Film Installation – Exam Rooms 7, 8, 9, and 10',
      area: 'window areas within Exam Rooms 7, 8, 9, and 10',
      locations: 'Exam Rooms 7, 8, 9, and 10',
      allRoomsPhrase: 'all four exam rooms',
      leaveArea: 'all affected exam rooms',
      protect: ['flooring', 'walls', 'window frames', 'furniture', 'medical equipment'],
      verify: ['window dimensions', 'glazing conditions', 'film quantities', 'privacy requirements'],
      cats: { windowFilm: { film: 'frosted' } },
    }))
    expect(g.title).toBe('Option 2: Frosted Window Film Installation – Exam Rooms 7, 8, 9, and 10')
    expect(g.description).toBe(doc(
      ['Work Area Preparation',
        'Prepare the designated window areas within Exam Rooms 7, 8, 9, and 10.',
        'Protect adjacent flooring, walls, window frames, furniture, medical equipment, and finishes.',
        'Field verify window dimensions, glazing conditions, film quantities, and privacy requirements before ordering and installation.'],
      ['Window Surface Preparation',
        'Inspect the designated glass surfaces for damage or conditions that may affect film adhesion.',
        'Clean the glass to remove dust, dirt, grease, adhesive residue, and surface contaminants.',
        'Remove minor surface residue using methods compatible with the existing glazing.',
        'Prepare the glass according to the film manufacturer’s recommendations.'],
      ['Frosted Window Film Installation',
        'Provide and install frosted privacy film on the designated windows in Exam Rooms 7, 8, 9, and 10.',
        'Coordinate the film pattern, opacity, color, coverage, orientation, and finished appearance with the approved selection.',
        'Field cut and fit the film to the verified glass dimensions.',
        'Apply the film uniformly with clean edges and consistent spacing at frames and glazing components.',
        'Remove visible air pockets, wrinkles, creases, and excess installation solution.',
        'Complete the installation according to manufacturer recommendations.'],
      ['Fit & Finish',
        'Verify the frosted film is properly aligned, fully adhered, and provides the intended level of privacy.',
        'Ensure film coverage and orientation are consistent throughout all four exam rooms.',
        'Verify finished surfaces are free of visible bubbles, wrinkles, peeling edges, scratches, and installation residue.',
        'Ensure completed work has clean transitions and a uniform finished appearance.'],
      ['Finishing & Cleanup',
        'Inspect completed work for quality and proper installation.',
        'Remove excess film, protective coverings, and materials generated during work activities.',
        'Clean the completed glass and adjacent surfaces as required.',
        'Leave all affected exam rooms clean, safe, and ready for use.'],
    ))
  })

  it('#4591 — bathtub removal and storage space conversion', () => {
    const g = generateScope(form({
      title: 'Bathtub Removal and Storage Space Conversion',
      area: 'bathtub and storage conversion work area',
      protect: ['flooring', 'walls', 'ceilings', 'fixtures', 'equipment'],
      verify: ['existing plumbing locations', 'wall construction', 'dimensions', 'site conditions'],
      cats: {
        itemRemoval: { item: 'bathtub', plumbing: true },
        plumbing: { work: 'cap' },
        framing: { area: 'former bathtub area', purpose: 'storage space' },
        drywall: { mode: 'new' },
        painting: { mode: 'match' },
      },
    }))
    expect(g.description).toBe(doc(
      ['Work Area Preparation',
        'Prepare the designated bathtub and storage conversion work area.',
        'Protect adjacent flooring, walls, ceilings, fixtures, equipment, and finishes.',
        'Field verify existing plumbing locations, wall construction, dimensions, and site conditions before beginning work.'],
      ['Bathtub Removal',
        'Disconnect the existing bathtub from accessible plumbing connections as required.',
        'Remove the existing bathtub and associated trim, sealants, fasteners, and components.',
        'Complete selective demolition as required to remove the bathtub without unnecessary damage to adjacent surfaces.',
        'Remove and dispose of demolished materials and debris.'],
      ['Plumbing Modifications',
        'Cap the existing accessible water-supply and drain connections as required.',
        'Secure capped plumbing connections within the wall or floor assembly as applicable.',
        'Test accessible capped connections for visible leaks before closing the affected surfaces.',
        'Exclude concealed plumbing relocation, replacement, or repairs beyond the immediate work area unless otherwise specified.'],
      ['Framing & Storage Space Preparation',
        'Frame the former bathtub area as required to create the designated storage space.',
        'Provide blocking, anchors, fasteners, and reinforcement as necessary.',
        'Coordinate the framing layout with existing plumbing, walls, and surrounding conditions.',
        'Prepare the area to provide a clean and functional storage configuration.'],
      ['Drywall Installation & Repairs',
        'Provide and install drywall over the new framing and affected wall areas.',
        'Cut and fit drywall around existing penetrations and adjacent components as required.',
        'Tape and finish joints, corners, fastener locations, and transitions.',
        'Patch and sand affected surfaces to provide a smooth, uniform finish.'],
      ['Priming & Painting',
        'Apply compatible primer to new drywall and repaired surfaces as required.',
        'Apply finish paint using the approved color and sheen.',
        'Apply additional coats and complete touch-ups as required for uniform coverage.',
        'Match adjacent existing finishes as closely as possible.'],
      ['Fit & Finish',
        'Verify the new framing and drywall are properly aligned, securely fastened, and stable.',
        'Verify accessible plumbing connections are properly capped and concealed.',
        'Ensure the converted storage area has clean, finished transitions at adjacent surfaces.',
        'Verify finished surfaces are free of visible defects, paint drips, and installation residue.'],
      CLEANUP(),
    ))
  })

  it('#4587 — drywall, insulation, cove base and hard-ceiling repairs (infection control)', () => {
    const g = generateScope(form({
      title: 'Drywall, Insulation, Cove Base, and Hard-Ceiling Repairs',
      area: 'work area for demolition and repair activities',
      ic: 'required',
      protect: ['flooring', 'walls', 'solid ceiling', 'equipment', 'utilities'],
      verify: ['the extent of affected materials', 'existing conditions'],
      cats: {
        demo: { mode: 'affected', wallDrywall: true, insulation: true, coveBase: true, solidCeiling: true },
        antimicrobial: {},
        drywall: { mode: 'replace', insulation: true },
        ceiling: { type: 'hard' },
        painting: { mode: 'match' },
        coveBase: { mode: 'match' },
      },
    }))
    expect(g.description).toBe(doc(
      ['Work Area Preparation & Infection Control',
        'Prepare the designated work area for demolition and repair activities.',
        'Provide and install temporary infection control barriers around the active work area.',
        'Implement dust-containment measures and seal barrier perimeters as required.',
        'Protect adjacent flooring, walls, solid ceiling, equipment, utilities, and finishes.',
        'Comply with applicable facility ICRA requirements.',
        'Coordinate work to minimize disruption to patients, staff, and facility operations.',
        'Field verify the extent of affected materials and existing conditions before beginning work.'],
      ['Selective Demolition',
        'Remove the designated damaged or affected wall drywall as required.',
        'Remove the designated existing insulation within the affected wall areas.',
        'Remove affected cove base and damaged portions of the solid drywall ceiling as required.',
        'Protect framing, utilities, ceiling components, and adjacent materials scheduled to remain.',
        'Remove and dispose of demolition materials in accordance with facility requirements.'],
      ['Antimicrobial Treatment',
        'Clean and prepare exposed framing and designated surfaces before reconstruction.',
        'Apply an approved antimicrobial treatment to the affected exposed surfaces as required.',
        'Allow treated areas to dry in accordance with manufacturer recommendations before installing replacement materials.',
        'Exclude specialized mold testing, laboratory analysis, and certified mold remediation unless otherwise specified.'],
      ['Insulation & Wall Drywall Replacement',
        'Provide and install new insulation within the designated wall cavities.',
        'Provide and install replacement drywall to match the existing wall assembly as closely as possible.',
        'Provide required backing, blocking, fasteners, and reinforcement.',
        'Tape and finish joints, corners, fastener locations, and transitions.',
        'Patch and sand repaired surfaces to provide a smooth, uniform finish.'],
      ['Solid Drywall Ceiling Repair',
        'Provide and install replacement drywall at the affected solid-ceiling areas.',
        'Provide backing, blocking, fasteners, and reinforcement as required.',
        'Tape and finish joints, fastener locations, edges, and transitions.',
        'Patch and sand the repaired ceiling surfaces to provide a smooth, uniform finish.',
        'Match the adjacent existing ceiling texture and appearance as closely as possible.'],
      ['Patching & Painting',
        'Apply compatible primer to new drywall and repaired wall and ceiling surfaces as required.',
        'Apply finish paint using the approved colors and sheens.',
        'Apply additional coats and complete touch-ups as required for uniform coverage.',
        'Match adjacent existing finishes as closely as possible.'],
      ['Cove Base Replacement',
        'Prepare the affected wall and floor transitions to receive the new cove base.',
        'Provide and install replacement cove base to match the existing material, height, color, and profile as closely as possible.',
        'Cut and fit the cove base neatly around corners, openings, and adjacent components.',
        'Provide clean seams, edges, and terminations.'],
      ['Fit & Finish',
        'Verify the replacement insulation, wall drywall, solid-ceiling drywall, and cove base are properly installed and securely supported.',
        'Ensure repaired and painted surfaces blend with adjacent existing conditions as closely as possible.',
        'Verify the cove base and repaired ceiling have clean, uniform transitions.',
        'Verify finished surfaces are free of visible defects and installation residue.'],
      ['Medical-Grade Cleaning',
        'Perform hospital-grade cleaning within the affected work area.',
        'Remove construction dust, demolition residue, and surface contaminants.',
        'Clean completed surfaces according to applicable healthcare standards.'],
      CLEANUP('the affected area', 'infection control barriers, debris, and materials generated during work activities'),
    ))
  })

  it('#4578 — frosted sliding window, 28" x 28"', () => {
    const g = generateScope(form({
      title: 'Frosted Sliding Window Installation – 28" x 28"',
      area: 'window installation area',
      protect: ['flooring', 'walls', 'countertops', 'equipment'],
      verify: ['the opening dimensions', 'wall construction', 'mounting conditions', 'existing utilities'],
      cats: { window: { kind: 'sliding', glazing: 'frosted', qty: 1, width: 28, height: 28, approx: true } },
    }))
    expect(g.description).toBe(doc(
      ['Work Area Preparation',
        'Prepare the designated window installation area.',
        'Protect adjacent flooring, walls, countertops, equipment, and finishes.',
        'Field verify the opening dimensions, wall construction, mounting conditions, and existing utilities before fabrication and installation.'],
      ['Opening Preparation',
        'Prepare the designated wall opening to receive the new sliding window.',
        'Complete minor modifications to the opening as required.',
        'Provide framing, blocking, anchors, fasteners, and reinforcement as necessary.',
        'Exclude structural modifications and relocation of concealed utilities unless otherwise specified.'],
      ['Sliding Window Installation',
        'Provide and install one frosted sliding window measuring approximately 28 inches by 28 inches.',
        'Provide a compatible frame, sliding track, glazing, pulls, stops, guides, and associated hardware.',
        'Set, level, align, anchor, and securely fasten the window assembly within the opening.',
        'Apply compatible sealant around the frame perimeter and adjacent transitions as required.',
        'Adjust the sliding panel to provide smooth operation and secure closure.'],
      ['Patching & Touch-Ups',
        'Patch minor wall damage resulting from the window installation.',
        'Sand repaired areas to provide smooth, uniform surfaces.',
        'Apply compatible primer and touch-up paint using the approved color and sheen as required.',
        'Match adjacent existing finishes as closely as possible.'],
      ['Fit & Finish',
        'Verify the window and frame are properly aligned, securely fastened, and stable.',
        'Verify the sliding panel opens, closes, and operates smoothly as intended.',
        'Ensure the frosted glazing, edges, and transitions have a clean, finished appearance.',
        'Verify finished surfaces are free of visible defects, sharp edges, scratches, and installation residue.'],
      CLEANUP(),
    ))
  })

  it('#4577 — mold-resistant drywall, Level 5, Canvas Tan, Moon Rock cove base', () => {
    const g = generateScope(form({
      title: 'Mold-Resistant Drywall Installation and Interior Finishing',
      area: 'wall, door, and finish work areas',
      leaveArea: 'the affected areas',
      protect: ['flooring', 'ceilings', 'doors', 'equipment', 'utilities'],
      verify: ['wall dimensions', 'substrate conditions', 'cove base quantities', 'existing conditions'],
      cats: {
        demo: { mode: 'wallboard' },
        drywall: { mode: 'full', type: 'mold-resistant', finishLevel: 5 },
        painting: { mode: 'full', color: 'Canvas Tan', exteriorDoor: true },
        coveBase: { mode: 'new', color: 'Moon Rock' },
      },
    }))
    expect(g.description).toBe(doc(
      ['Work Area Preparation',
        'Prepare the designated wall, door, and finish work areas.',
        'Protect adjacent flooring, ceilings, doors, equipment, utilities, and finishes.',
        'Field verify wall dimensions, substrate conditions, cove base quantities, and existing conditions before beginning work.'],
      ['Existing Wallboard Removal',
        'Remove all designated existing wallboards and associated damaged materials.',
        'Remove fasteners, trim, sealants, and loose materials as required.',
        'Protect framing, utilities, and adjacent components scheduled to remain.',
        'Remove and dispose of demolished materials and debris.'],
      ['Wall Preparation',
        'Inspect the exposed framing and supporting conditions after wallboard removal.',
        'Clean and prepare the exposed installation areas.',
        'Provide blocking, fasteners, and minor reinforcement as required for the new drywall installation.',
        'Exclude concealed framing, utility, or moisture-source repairs unless otherwise specified.'],
      ['Mold-Resistant Drywall Installation',
        'Provide and install new mold-resistant drywall throughout the designated wall areas.',
        'Cut and fit drywall neatly around outlets, penetrations, corners, doors, and fixed components.',
        'Secure the drywall to the supporting structure using compatible fasteners.',
        'Tape and finish joints, corners, edges, fastener locations, and transitions.'],
      ['Level 5 Drywall Finish',
        'Apply joint compound and skim coating as required to achieve a Level 5 drywall finish.',
        'Sand finished surfaces to provide a smooth, uniform appearance.',
        'Inspect completed surfaces under available lighting conditions and complete touch-ups as required.',
        'Prepare the finished drywall to receive primer and paint.'],
      ['Priming & Painting',
        'Apply compatible primer to all new drywall and repaired surfaces.',
        'Apply Canvas Tan finish paint to the new walls and designated general areas.',
        'Apply additional coats and complete touch-ups as required for uniform coverage.',
        'Prepare, prime, and paint the designated exterior door using a compatible exterior coating system.',
        'Coordinate the exterior door color and sheen with the approved selection.',
        'Complete all coating applications according to manufacturer recommendations.'],
      ['Cove Base Installation',
        'Provide and install new cove base in the Moon Rock color throughout the designated areas.',
        'Coordinate the approved material, height, and profile before installation.',
        'Provide compatible adhesive and installation materials.',
        'Cut and fit the cove base neatly around corners, door frames, and transitions.',
        'Provide clean seams, edges, and terminations.'],
      ['Fit & Finish',
        'Verify the new drywall is properly aligned, securely fastened, and finished to a Level 5 standard.',
        'Verify painted surfaces have consistent color, sheen, and coverage.',
        'Verify the Moon Rock cove base is properly aligned and securely adhered.',
        'Ensure completed work blends with adjacent existing conditions as closely as possible.',
        'Verify finished surfaces are free of visible defects, paint drips, sanding marks, and installation residue.'],
      CLEANUP('the affected areas'),
    ))
  })
})

describe('guards', () => {
  it('never writes infection-control text without IC', () => {
    const g = generateScope(form({ title: 'x', cats: { drywall: { mode: 'new' } } }))
    expect(g.description).not.toMatch(/infection control|ICRA|hospital-grade/i)
  })
  it('antimicrobial work always excludes certified mold remediation', () => {
    const g = generateScope(form({ title: 'x', cats: { antimicrobial: {} } }))
    expect(g.description).toContain('Exclude specialized mold testing, laboratory analysis, and certified mold remediation unless otherwise specified.')
  })
  it('never mentions plumbing unless plumbing work is selected', () => {
    const g = generateScope(form({ title: 'x', cats: { drywall: { mode: 'new' }, painting: { mode: 'match' } } }))
    expect(g.description).not.toMatch(/plumbing/i)
  })
  it('a hard-lid ceiling repair never mentions ceiling tile or grid', () => {
    const g = generateScope(form({ title: 'x', cats: { ceiling: { type: 'hard' } } }))
    expect(g.description).not.toMatch(/tile|grid/i)
  })
  it('prefixes add-on and emergency titles', () => {
    expect(generateScope(form({ title: 'Cove base' }), { estimateType: 'addon' }).title).toBe('Add-On Estimate: Cove base')
    expect(generateScope(form({ title: 'Leak' }), { estimateType: 'emergency' }).title).toBe('Emergency Estimate: Leak')
  })
  it('flags an empty scope', () => {
    expect(generateScope(form({ title: 'x' })).missing).toContain('scope')
  })
})
