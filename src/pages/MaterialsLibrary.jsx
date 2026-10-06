import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Card from '../components/ui/Card'
import PageHeader from '../components/ui/PageHeader'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input from '../components/ui/Input'
import Spinner from '../components/ui/Spinner'
import { useToast } from '../components/ToastProvider'
import { useConfirm } from '../components/ConfirmProvider'
import { Select } from './quotes/QuoteParts'
import { listLibrary, createLibraryItem, updateLibraryItem, removeLibraryItem } from '../api/quoteLibrary'

const EMPTY = { kind: 'paint_color', label: '', manufacturer: '', product_code: '', notes: '' }
const errMsg = (err, t) => err?.response?.data?.error ?? t('common.couldNotSave')

// The finishes/colors/products the site-walk form offers as one-tap picks,
// kept here so JCCS can add a new laminate or paint color without a code change.
export default function MaterialsLibrary() {
  const { t } = useTranslation()
  const toast = useToast()
  const confirmDialog = useConfirm()
  const [items, setItems] = useState([])
  const [kinds, setKinds] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    listLibrary().then((d) => { setItems(d.items ?? []); setKinds(d.kinds ?? []) }).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const openCreate = (kind = 'paint_color') => { setForm({ ...EMPTY, kind }); setError(''); setModal('create') }
  const openEdit = (it) => {
    setForm({ kind: it.kind, label: it.label, manufacturer: it.manufacturer ?? '', product_code: it.product_code ?? '', notes: it.notes ?? '' })
    setError(''); setModal(it)
  }
  const save = async () => {
    if (!form.label.trim()) { setError(t('users.nameRequired')); return }
    setSaving(true); setError('')
    try {
      if (modal === 'create') await createLibraryItem(form)
      else await updateLibraryItem(modal.id, form)
      setModal(null); load()
    } catch (err) { setError(errMsg(err, t)) }
    finally { setSaving(false) }
  }
  const remove = async (it) => {
    if (!await confirmDialog(t('library.removeConfirm', { name: it.label }), { danger: true, confirmLabel: t('library.remove') })) return
    try { await removeLibraryItem(it.id); load() } catch (err) { toast.error(errMsg(err, t)) }
  }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <div className="flex flex-col gap-5">
      <Link to="/quotes" className="text-sm font-semibold text-brand-500 hover:underline w-fit py-1">← {t('nav.quotes')}</Link>
      <PageHeader title={t('library.title')} subtitle={t('library.subtitle')}
        actionLabel={t('library.add')} onAction={() => openCreate()} />

      {loading ? <Card><Spinner /></Card> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {kinds.map((kind) => {
            const list = items.filter((i) => i.kind === kind)
            return (
              <Card key={kind} title={t(`library.kinds.${kind}`)}
                action={<button onClick={() => openCreate(kind)} className="text-sm font-semibold text-brand-700 px-2 py-1.5 rounded-lg active:bg-brand-100 hover:underline">+ {t('library.add')}</button>}>
                {list.length === 0 ? <p className="text-sm text-gray-400">{t('library.empty')}</p> : (
                  <ul className="divide-y divide-gray-50">
                    {list.map((it) => (
                      <li key={it.id} className="flex items-center justify-between gap-2 py-1.5">
                        <span className="min-w-0">
                          <span className="block text-sm text-gray-800 truncate">{it.label}</span>
                          <span className="block text-xs text-gray-400 truncate">
                            {[it.manufacturer, it.product_code, it.use_count ? t('library.used', { count: it.use_count }) : null].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        <span className="flex gap-1 shrink-0 -mr-2">
                          <button onClick={() => openEdit(it)} className="text-sm font-semibold text-brand-700 px-2 py-1.5 rounded-lg active:bg-brand-100 hover:underline">{t('common.edit')}</button>
                          <button onClick={() => remove(it)} className="text-sm font-semibold text-red-500 px-2 py-1.5 rounded-lg active:bg-red-50 hover:underline">{t('library.remove')}</button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <Modal isOpen={!!modal} onClose={() => setModal(null)} title={modal === 'create' ? t('library.add') : t('library.edit')}>
        <div className="flex flex-col gap-4">
          <Select label={t('library.kind')} value={form.kind} onChange={(v) => setForm((f) => ({ ...f, kind: v }))}>
            {kinds.map((k) => <option key={k} value={k}>{t(`library.kinds.${k}`)}</option>)}
          </Select>
          <Input label={t('library.label')} value={form.label} onChange={set('label')} />
          <Input label={t('library.manufacturer')} value={form.manufacturer} onChange={set('manufacturer')} />
          <Input label={t('library.productCode')} value={form.product_code} onChange={set('product_code')} />
          <Input label={t('library.notes')} value={form.notes} onChange={set('notes')} />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <Button onClick={save} loading={saving} fullWidth>{t('common.save')}</Button>
        </div>
      </Modal>
    </div>
  )
}
