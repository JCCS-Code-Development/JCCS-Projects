import { describe, expect, it } from 'vitest'
import { formFromNotes } from './fromNotes'
import { generateScope } from './index'

const library = [
  { kind: 'paint_color', label: 'Canvas Tan' },
  { kind: 'cove_base', label: 'Moon Rock' },
]
const run = (notes, extra = {}) => formFromNotes({ notes, library, ...extra })

describe('auto-fill from walk notes', () => {
  it('water damage in an exam room → repair scope with infection control', () => {
    const { form, notes } = run(['Exam rm 3 – water damage behind sink, ~40 SF, insulation wet', 'Cove base peeling, hard ceiling stained'])
    const c = form.cats
    expect(c.drywall).toMatchObject({ on: true, mode: 'replace', insulation: true })
    expect(c.demo).toMatchObject({ on: true, mode: 'affected', wallDrywall: true, insulation: true, solidCeiling: true, coveBase: true })
    expect(c.ceiling.on).toBe(true)
    expect(c.coveBase).toMatchObject({ on: true, mode: 'match' })
    expect(c.painting).toMatchObject({ on: true, mode: 'match' })
    expect(c.plumbing.on).toBe(false) // a sink is mentioned, but no plumbing work is asked for
    expect(c.antimicrobial.on).toBe(false)
    expect(form.ic).toBe('required')
    expect(form.locations).toBe('Exam Room 3')
    expect(notes.join(' ')).toMatch(/40 SF/)
    expect(form.title).toBe('Drywall, Insulation, Cove Base, and Hard-Ceiling Repairs – Exam Room 3')
    const g = generateScope(form)
    expect(g.description).toContain('Work Area Preparation & Infection Control')
    expect(g.missing).toEqual([])
  })

  it('reads Spanish notes', () => {
    const { form } = run(['Consultorio 5: moho en la pared detrás del lavamanos, cambiar tablaroca resistente al moho', 'Zócalo color Moon Rock, pintar Canvas Tan'])
    const c = form.cats
    expect(c.antimicrobial.on).toBe(true)
    expect(c.drywall).toMatchObject({ on: true, type: 'mold-resistant' })
    expect(c.coveBase).toMatchObject({ on: true, mode: 'new', color: 'Moon Rock' })
    expect(c.painting.color).toBe('Canvas Tan')
    expect(form.locations).toBe('Exam Room 5')
    expect(form.ic).toBe('required')
  })

  it('frosted window film on several rooms', () => {
    const { form } = run(['Exam rooms 7, 8, 9 & 10 – frosted privacy film on the windows'])
    expect(form.cats.windowFilm).toMatchObject({ on: true, film: 'frosted' })
    expect(form.cats.drywall.on).toBe(false)
    expect(form.ic).toBe('none')
    expect(form.locations).toBe('Exam Rooms 7, 8, 9, and 10')
    expect(form.verify).toContain('window dimensions')
  })

  it('new sliding window with a size', () => {
    const { form } = run(['Office 1148 – new frosted sliding window 28x28 in the wall'])
    expect(form.cats.window).toMatchObject({ on: true, kind: 'sliding', glazing: 'frosted', width: '28', height: '28' })
    expect(generateScope(form).description).toContain('measuring approximately 28 inches by 28 inches')
  })

  it('tub removal, cap plumbing, frame for storage', () => {
    const { form } = run(['Remove bathtub in break room restroom, cap plumbing, frame and drywall it as storage'])
    const c = form.cats
    expect(c.itemRemoval).toMatchObject({ on: true, item: 'bathtub', plumbing: true })
    expect(c.plumbing).toMatchObject({ on: true, work: 'cap' })
    expect(c.framing).toMatchObject({ on: true, area: 'former bathtub area', purpose: 'storage space' })
    expect(c.drywall).toMatchObject({ on: true, mode: 'new' })
  })

  it('never turns on plumbing just because plumbing is mentioned', () => {
    const { form, notes } = run(['Wall damage near the plumbing chase, patch and paint'])
    expect(form.cats.plumbing.on).toBe(false)
    expect(notes.join(' ')).toMatch(/plumbing/)
  })

  it('leaves the scope empty when nothing is recognized', () => {
    const { form, notes } = run(['Met with Greg, call back Tuesday'])
    expect(Object.values(form.cats).some((x) => x.on)).toBe(false)
    expect(notes.join(' ')).toMatch(/no scope recognized/)
  })
})
