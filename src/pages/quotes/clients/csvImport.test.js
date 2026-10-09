import { describe, it, expect } from 'vitest'
import { parseCsv, clientsFromCsv } from './csvImport'

describe('parseCsv', () => {
  it('handles quotes, escaped quotes and line breaks inside fields', () => {
    const rows = parseCsv('﻿Name,Address\r\n"Smith, Inc.","1 Main St\nGreenville, SC"\r\n"Say ""hi""",x\r\n')
    expect(rows).toEqual([['Name', 'Address'], ['Smith, Inc.', '1 Main St\nGreenville, SC'], ['Say "hi"', 'x']])
  })
  it('detects semicolon-separated files', () => {
    expect(parseCsv('Name;Email\nA;a@b.co')).toEqual([['Name', 'Email'], ['A', 'a@b.co']])
  })
})

describe('clientsFromCsv', () => {
  it('reads a client list', () => {
    const { clients } = clientsFromCsv('Client Name,Contact,Email,Phone,Mobile,Address 1,City,State,Zip\nPrisma Health,Jane Doe,JANE@prisma.org,864-555-0100,864-555-0101,701 Grove Rd,Greenville,SC,29605\n')
    expect(clients).toEqual([{ name: 'Prisma Health', email: 'jane@prisma.org' }])
  })
  it('turns an InvoiceToGo documents export into one client per name', () => {
    const csv = 'DocumentNumber,Name,EmailRecipient,DocumentRecipientAddress,ShipAddress,Comment\n'
      + '4577,Prisma Health,,"701 Grove Rd\nGreenville, SC 29605",,first\n'
      + '4578,prisma health,ap@prisma.org,,,second\n'
      + '4580,Bon Secours,ar@bsmh.org,,"1 Saint Francis Dr",x\n'
    const { clients, rows } = clientsFromCsv(csv)
    expect(rows).toBe(3)
    expect(clients).toEqual([
      { name: 'Prisma Health', email: 'ap@prisma.org' },
      { name: 'Bon Secours', email: 'ar@bsmh.org' },
    ])
  })
  it('builds the name from first/last when there is no name column', () => {
    expect(clientsFromCsv('First Name,Last Name\nAna,Lopez\n').clients).toEqual([{ name: 'Ana Lopez' }])
  })
  it('reports a file with no name column', () => {
    expect(clientsFromCsv('Foo,Bar\n1,2\n').error).toBe('noName')
  })
})
