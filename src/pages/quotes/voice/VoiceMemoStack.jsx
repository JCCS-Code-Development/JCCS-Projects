import { useTranslation } from 'react-i18next'
import { useConfirm } from '../../../components/ConfirmProvider'
import { useToast } from '../../../components/ToastProvider'
import VoiceBubble from './VoiceBubble'

// The saved + still-uploading voice memos for one spot (a walk note, the
// general notes, or a whole request), newest last like a chat.
export default function VoiceMemoStack({ memos = [], voice, noteId, all = false, editable, labelFor }) {
  const { t } = useTranslation()
  const confirmDialog = useConfirm()
  const toast = useToast()
  const mine = all ? memos : memos.filter((m) => (m.note_id ?? null) === (noteId ?? null))
  const pending = (voice?.pending ?? []).filter((p) => all || (p.note_id ?? null) === (noteId ?? null))
  if (!mine.length && !pending.length) return null

  const remove = async (m) => {
    if (!await confirmDialog(t('quotes.voice.deleteConfirm'), { danger: true, confirmLabel: t('common.delete') })) return
    try { await voice.remove(m.id) } catch (err) { toast.error(err?.response?.data?.error ?? t('common.couldNotSave')) }
  }
  return (
    <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
      {mine.map((m) => (
        <VoiceBubble key={m.id} memo={m} label={labelFor?.(m)} onDelete={editable && voice ? () => remove(m) : undefined} />
      ))}
      {pending.map((p) => (
        <VoiceBubble key={p.key} memo={p} pending error={p.error} onRetry={() => voice.retry(p.key)} label={labelFor?.(p)} />
      ))}
    </div>
  )
}
