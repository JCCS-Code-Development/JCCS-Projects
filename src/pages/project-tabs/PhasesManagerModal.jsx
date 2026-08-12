import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import { useToast } from '../../components/ToastProvider'
import { createPhase, updatePhase, deletePhase } from '../../api/phases'
import { listDocuments } from '../../api/documents'
import BlueprintReferenceHeader from '../../components/BlueprintReferenceHeader'

const STATUS_OPTIONS = ['upcoming', 'current', 'completed']

function PhaseRow({ phase, onSaved }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [name, setName] = useState(phase.name)
  const [scope, setScope] = useState(phase.scope ?? '')
  const [status, setStatus] = useState(phase.status)
  const [startDate, setStartDate] = useState(phase.start_date ?? '')
  const [endDate, setEndDate] = useState(phase.end_date ?? '')
  const [saving, setSaving] = useState(false)

  const dirty = name !== phase.name || scope !== (phase.scope ?? '') || status !== phase.status
    || (startDate || '') !== (phase.start_date ?? '') || (endDate || '') !== (phase.end_date ?? '')

  const save = async () => {
    setSaving(true)
    try {
      await updatePhase(phase.id, { name, scope: scope || null, status, start_date: startDate || null, end_date: endDate || null })
      onSaved()
    } catch {
      toast.error(t('common.couldNotSave'))
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    setSaving(true)
    try {
      await deletePhase(phase.id)
      onSaved()
    } catch {
      toast.error(t('common.couldNotSave'))
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 py-3 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-gray-400 w-5 shrink-0">{phase.sequence}</span>
        <input value={name} onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-brand-500" />
        <select value={status} onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs outline-none focus:border-brand-500">
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{t(`phases.status.${s}`)}</option>)}
        </select>
      </div>
      <div className="pl-7">
        <textarea rows={2} value={scope} onChange={(e) => setScope(e.target.value)}
          placeholder={t('phases.scopePlaceholder')}
          className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs outline-none focus:border-brand-500 resize-none" />
      </div>
      <div className="flex items-center gap-2 pl-7">
        <input type="date" value={startDate ?? ''} onChange={(e) => setStartDate(e.target.value)}
          className="rounded-lg border border-gray-300 px-2 py-1 text-xs outline-none focus:border-brand-500" />
        <span className="text-xs text-gray-300">–</span>
        <input type="date" value={endDate ?? ''} onChange={(e) => setEndDate(e.target.value)}
          className="rounded-lg border border-gray-300 px-2 py-1 text-xs outline-none focus:border-brand-500" />
        <div className="flex-1" />
        {dirty && <Button size="sm" variant="primary" onClick={save} loading={saving}>{t('common.save')}</Button>}
        <Button size="sm" variant="ghost" onClick={remove} disabled={saving}>{t('common.delete')}</Button>
      </div>
    </div>
  )
}

export default function PhasesManagerModal({ isOpen, onClose, projectNumber, phases, onChange }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)

  const addPhase = async (e) => {
    e.preventDefault()
    if (!newName.trim()) return
    setAdding(true)
    try {
      await createPhase({ project_number: projectNumber, name: newName.trim() })
      setNewName('')
      onChange()
    } catch {
      toast.error(t('common.couldNotSave'))
    } finally {
      setAdding(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('phases.manage')} size="lg">
      <BlueprintReferenceHeader projectNumber={projectNumber} fetchDocuments={listDocuments} />
      <div className="flex flex-col gap-1 -mt-2">
        {phases.length === 0 && <p className="text-sm text-gray-400 py-3">{t('phases.noneYet')}</p>}
        {phases.map((p) => <PhaseRow key={p.id} phase={p} onSaved={onChange} />)}
      </div>
      <form onSubmit={addPhase} className="flex items-end gap-2 pt-4 mt-2 border-t border-gray-100">
        <Input label={t('phases.newPhaseName')} value={newName} onChange={(e) => setNewName(e.target.value)} className="flex-1" />
        <Button type="submit" loading={adding}>{t('phases.addPhase')}</Button>
      </form>
    </Modal>
  )
}
