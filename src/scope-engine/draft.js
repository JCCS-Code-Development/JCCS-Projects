import { generateScope, toInvoiceToGoText } from './index'

// The editable Scope of Work text kept on the form (form.draft). Until someone
// edits it, it simply follows the answers; once edited, the edit is kept.
//   form.draft = { text, edited, basedOn }  — basedOn: the generated text the
//   edit started from, so we can tell when the answers changed underneath it.
export function generatedText(form, estimateType) {
  return toInvoiceToGoText(generateScope(form, { estimateType }))
}

export function draftText(form, estimateType) {
  if (!form) return ''
  if (form.draft?.edited && typeof form.draft.text === 'string') return form.draft.text
  return generatedText(form, estimateType)
}
