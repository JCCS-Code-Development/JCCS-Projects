// Reads a client list out of an InvoiceToGo export (or any spreadsheet saved
// as CSV). Works with a client list (Name, Email, Phone, Address…) and with
// InvoiceToGo's documents export, where every invoice/estimate row carries
// its client (Name, EmailRecipient, DocumentRecipientAddress, ShipAddress) —
// the same client on many rows becomes one client.

// RFC 4180: quoted fields, "" escapes, line breaks inside quotes, CRLF.
export function parseCsv(text) {
  text = text.replace(/^﻿/, '')
  const firstLine = text.slice(0, text.search(/\r?\n|$/))
  const delim = [',', ';', '\t'].reduce((best, d) => (firstLine.split(d).length > firstLine.split(best).length ? d : best), ',')
  const rows = []
  let row = [], field = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"' && field === '') quoted = true
    else if (c === delim) { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((v) => v.trim() !== ''))
}

const norm = (h) => h.toLowerCase().replace(/[^a-z0-9]/g, '')

// Column names we understand, per field (compared without case/spaces/punctuation).
const COLUMNS = {
  name: ['name', 'client', 'clientname', 'customer', 'customername', 'company', 'companyname', 'business', 'businessname', 'displayname', 'billto', 'documentrecipientname', 'recipientname'],
  contact_name: ['contact', 'contactname', 'contactperson', 'attention', 'attn', 'fullname'],
  first: ['firstname', 'contactfirstname'],
  last: ['lastname', 'contactlastname'],
  email: ['email', 'emailaddress', 'emailrecipient', 'clientemail', 'customeremail', 'primaryemail'],
  phone: ['phone', 'phonenumber', 'telephone', 'tel', 'workphone', 'businessphone', 'clientphone', 'officephone'],
  mobile: ['mobile', 'mobilephone', 'mobilenumber', 'cell', 'cellphone', 'cellular'],
  address: ['address', 'billingaddress', 'documentrecipientaddress', 'clientaddress', 'billtoaddress', 'fulladdress'],
  street1: ['address1', 'addressline1', 'street', 'streetaddress', 'billingaddress1', 'billingstreet'],
  street2: ['address2', 'addressline2', 'billingaddress2', 'suite'],
  city: ['city', 'billingcity', 'town'],
  state: ['state', 'province', 'region', 'billingstate'],
  zip: ['zip', 'zipcode', 'postcode', 'postalcode', 'billingzip', 'billingpostalcode'],
  ship_address: ['shipaddress', 'shippingaddress', 'shipto', 'shiptoaddress'],
  notes: ['notes', 'note', 'clientnotes', 'customernotes'],
}

// header row → { field: columnIndex }
export function detectColumns(header) {
  const keys = header.map(norm)
  const found = {}
  for (const [field, names] of Object.entries(COLUMNS)) {
    const i = names.map((n) => keys.indexOf(n)).find((x) => x >= 0)
    if (i !== undefined) found[field] = i
  }
  return found
}

const clean = (v) => (v ?? '').replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean).join('\n')
const oneLine = (v) => clean(v).replace(/\n/g, ' ').replace(/\s+/g, ' ')

// Text of a CSV file → { clients, columns, rows, error? }
export function clientsFromCsv(text) {
  const rows = parseCsv(text)
  if (rows.length < 2) return { clients: [], columns: {}, rows: 0, error: 'empty' }
  const [header, ...data] = rows
  const col = detectColumns(header)
  const hasName = col.name !== undefined || col.first !== undefined || col.last !== undefined
  if (!hasName) return { clients: [], columns: col, header, rows: data.length, error: 'noName' }

  const get = (r, f) => (col[f] !== undefined ? r[col[f]] ?? '' : '')
  const byName = new Map()
  for (const r of data) {
    const person = oneLine(`${get(r, 'first')} ${get(r, 'last')}`)
    const name = oneLine(get(r, 'name')) || person
    if (!name) continue
    const cityLine = [oneLine(get(r, 'city')), [oneLine(get(r, 'state')), oneLine(get(r, 'zip'))].filter(Boolean).join(' ')].filter(Boolean).join(', ')
    const address = clean(get(r, 'address')) || [oneLine(get(r, 'street1')), oneLine(get(r, 'street2')), cityLine].filter(Boolean).join('\n')
    const c = {
      name,
      contact_name: oneLine(get(r, 'contact_name')) || (oneLine(get(r, 'name')) && person ? person : ''),
      email: oneLine(get(r, 'email')).toLowerCase(),
      phone: oneLine(get(r, 'phone')),
      mobile: oneLine(get(r, 'mobile')),
      address,
      ship_address: clean(get(r, 'ship_address')),
      notes: clean(get(r, 'notes')),
    }
    const key = name.toLowerCase()
    const prev = byName.get(key)
    if (!prev) { byName.set(key, c); continue }
    // Same client again (e.g. another invoice): fill whatever was missing.
    for (const [k, v] of Object.entries(c)) if (!prev[k] && v) prev[k] = v
  }
  const clients = [...byName.values()].map((c) => Object.fromEntries(Object.entries(c).filter(([, v]) => v)))
  return { clients, columns: col, rows: data.length }
}
