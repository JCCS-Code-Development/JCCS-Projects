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
