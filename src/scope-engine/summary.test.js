import { describe, expect, it } from 'vitest'
import { summarizeVisit } from './summary'
import { readVisitMessage } from './fromMessage'

describe('summarizeVisit', () => {
  const visit = {
    title: 'Wall protection – hallways',
    facility: 'Prisma North Greenville Hospital',
    location_detail: '2nd floor',
    description: 'Estimate for Prisma North Greenville Hospital, install Inpro wall protection throughout the hallways, excluding the ER side, approx 1,280 LF, for Mr Bobby',
    notes: [{ body: 'Corner guards at the nurse station. 12 x 10 ft' }, { body: '' }],
    engineer: { name: 'Bobby Smith' },
    company: 'Prisma Health',
  }

  it('keeps the important details', () => {
    const s = summarizeVisit(visit)
    expect(s.split('\n')[0]).toBe('Wall protection – hallways')
    expect(s).toContain('Location: Prisma North Greenville Hospital – 2nd floor')
    expect(s).toContain('For: Bobby Smith (Prisma Health)')
    expect(s).toContain('• Corner guards at the nurse station')
    expect(s).toMatch(/Measurements: .*approx 1,280 LF/)
    expect(s).toContain('12 x 10 ft')
    expect(s).toMatch(/Exclusions: excluding the ER side/)
  })

  it('drops repeated notes and says when it has no work yet', () => {
    const s = summarizeVisit({ title: 'X', description: 'Paint the wall.\nPaint the wall.' })
    expect(s.match(/Paint the wall/g)).toHaveLength(1)
    expect(summarizeVisit({ title: 'Only a title' })).toBe('Only a title')
  })

  it('writes an estimate from the summary', () => {
    const read = readVisitMessage(summarizeVisit(visit))
    expect(read.form.cats.wallProtection.on).toBe(true)
  })
})
