import { describe, expect, it } from 'vitest'
import { formFromNotes } from './fromNotes'
import { generateScope } from './index'
import { summarizeVisit } from './summary'

// The LVP entry the migration adds to the Materials library.
const LVP = {
  id: 1, kind: 'flooring', label: 'LVP flooring', unit: 'SF',
  aliases: 'lvp, luxury vinyl plank, luxury vinyl, vinyl plank, lvt',
  scope_text: [
    '# Subfloor Preparation',
    'Clean and prepare the existing substrate to receive the new flooring.',
    'Remove loose materials, residual adhesive, and surface contaminants as required.',
    'Patch and level minor substrate imperfections as necessary to provide a suitable installation surface.',
    '# LVP Flooring Installation',
    'Provide and install {amount}approved luxury vinyl plank flooring{where}.',
    'Install the LVP using compatible adhesive or the approved installation system per manufacturer recommendations.',
    'Coordinate the approved product, color, and plank layout direction before installation.',
    'Cut and fit the flooring neatly around door frames, walls, and fixed components.',
    'Provide and install transition strips at doorways and changes in flooring as required.',
  ].join('\n'),
  checks: 'Verify the new flooring is flat, properly aligned, and securely installed with tight seams.\nVerify flooring transitions are smooth, secure, and flush with adjacent surfaces.',
}

describe('work taught in the Materials library', () => {
  it('writes LVP flooring from a one-line note, with the square footage worked out', () => {
    const { form, notes } = formFromNotes({ notes: [], generalNotes: 'Lvp flooring 45feet, 16 feet, front entrance 9 by 7,', library: [LVP] })
    expect(form.cats.taught.items[0].qty).toBe('783')
    expect(notes.join('\n')).toMatch(/783 SF from 45 × 16 \+ 9 × 7/)
    const g = generateScope(form)
    expect(g.missing).not.toContain('scope')
    expect(g.title).toBe('LVP Flooring Installation')
    expect(g.description).toContain('• Prepare the designated flooring area measuring approximately 45 feet by 16 feet and the front entrance area measuring approximately 9 feet by 7 feet.')
    expect(g.description).toContain('• Protect adjacent walls, doors, millwork, equipment, and finishes.')
    expect(g.description).toContain('• Field verify dimensions, flooring transitions, elevations, and existing conditions before ordering materials and beginning work.')
    expect(g.description).toContain('Subfloor Preparation\n• Clean and prepare the existing substrate')
    expect(g.description).toContain('• Provide and install approximately 783 square feet of approved luxury vinyl plank flooring within the designated areas.')
    expect(g.description).toContain('• Verify the new flooring is flat, properly aligned')
  })

  it('counts each area once when written from the estimate prompt', () => {
    const prompt = summarizeVisit({ title: 'LVP', description: 'estimate: Lvp flooring 45feet, 16 feet, front entrance 9 by 7,' })
    expect(prompt).toMatch(/Measurements:/)
    expect(formFromNotes({ generalNotes: prompt, library: [LVP] }).form.cats.taught.items[0].qty).toBe('783')
  })

  it('stays off when the notes do not mention it, and works without a quantity', () => {
    expect(formFromNotes({ generalNotes: 'Patch drywall in exam rm 3', library: [LVP] }).form.cats.taught).toEqual({ on: false })
    const { form } = formFromNotes({ generalNotes: 'Install new vinyl plank in the lobby', library: [LVP] })
    expect(generateScope(form).description).toContain('• Provide and install approved luxury vinyl plank flooring within the designated areas.')
  })

  it('ignores library entries without wording', () => {
    const { form } = formFromNotes({ generalNotes: 'lvp flooring', library: [{ ...LVP, scope_text: '' }] })
    expect(form.cats.taught.on).toBe(false)
  })
})

// The office's lessons (migration 2026-11-03e), checked for words that would
// fire on the wrong job.
import LESSONS from './lessons.fixture.json'
const LIB = [LVP, ...LESSONS].map((l, i) => ({ ...l, id: i + 1 }))
const taughtNames = (note) => (formFromNotes({ generalNotes: note, library: LIB }).form.cats.taught.items ?? []).map((it) => it.name)

describe('the office lessons', () => {
  it('picks the specific lesson, not every lesson that shares a word', () => {
    expect(taughtNames('carpet tile in the waiting room 20 x 30')).toEqual(['Carpet tile'])
    expect(taughtNames('new carpet in offices')).toEqual(['Carpet'])
    expect(taughtNames('install a barn door at the nurse station')).toEqual(['Barn door'])
    expect(taughtNames('laminate countertop at the break room, 12 LF')).toEqual(['Laminate countertop'])
    expect(taughtNames('new Corian countertop 8 LF')).toEqual(['Solid-surface countertop'])
    expect(taughtNames('replace ceiling tile and grid in corridor')).toEqual(['Acoustical ceiling'])
    expect(taughtNames('2 access panels in ceiling, access panel for valves')).toEqual(['Access panel'])
  })

  it('stays quiet on words that only describe other work', () => {
    expect(taughtNames('patch drywall next to the door frame and paint')).toEqual([])
    expect(taughtNames('cove base along the tile floor')).toEqual([])
  })

  it('lets the Handrail lesson write handrails instead of wall protection', () => {
    const { form } = formFromNotes({ generalNotes: 'install handrail along corridor 40 LF', library: LIB })
    expect(form.cats.wallProtection.on).toBe(false)
    expect(generateScope(form).description).toContain('• Fabricate and install approximately 40 linear feet of handrail along corridor.')
  })

  it('writes counts, and "the" when no count is given', () => {
    const one = generateScope(formFromNotes({ generalNotes: 'install 2 barn door', library: LIB }).form).description
    expect(one).toContain('• Provide and install two barn door and rail system within the designated areas.')
    const none = generateScope(formFromNotes({ generalNotes: 'install access panel', library: LIB }).form).description
    expect(none).toContain('• Provide and install the access panel within the designated areas.')
  })
})
