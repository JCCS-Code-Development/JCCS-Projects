import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Card from '../components/ui/Card'
import PageHeader from '../components/ui/PageHeader'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input from '../components/ui/Input'
import Badge from '../components/ui/Badge'
import Spinner from '../components/ui/Spinner'
import { useToast } from '../components/ToastProvider'
import { useConfirm } from '../components/ConfirmProvider'
import { useAuthStore } from '../store/authStore'
import {
  listUsers, createUser, updateUser, deactivateUser,
  listClientAccounts, createClientAccount, updateClientAccount, deactivateClientAccount, deleteClientAccount,
} from '../api/users'
import { listEmployees } from '../api/fieldclockAuth'
import { listProjects } from '../api/projects'

const EMPTY_STAFF  = { fieldclock_user_id: '', name: '', role: 'pm', email: '', phone: '' }
const EMPTY_CLIENT = { email: '', name: '', phone: '', password: '' }

// Shared by both sections — a checkbox list scoped to whatever projects
// exist, used to edit pm_project_access / client_project_access. Admins
// don't need this (unrestricted already), so it's only shown for PM rows.
function ProjectAccessPicker({ projects, selected, onToggle }) {
  const { t } = useTranslation()
  if (projects.length === 0) return <p className="text-xs text-gray-400">{t('common.noProjectsYet')}</p>
  return (
    <div className="flex flex-col gap-1 max-h-40 overflow-y-auto rounded-xl border border-gray-100 p-2">
      {projects.map((p) => (
        <label key={p.project_number} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
          <input type="checkbox" checked={selected.includes(p.project_number)} onChange={() => onToggle(p.project_number)}
            className="rounded border-gray-300 text-brand-500 focus:ring-brand-400" />
          <span className="text-sm text-gray-700 truncate">{p.name} <span className="text-gray-400">#{p.project_number}</span></span>
        </label>
      ))}
    </div>
  )
}

// Section header: stacked + centered with a full-width button on phones,
// side by side from `md` up.
function SectionHeader({ title, subtitle, action }) {
  return (
    <div className="flex flex-col items-center text-center gap-3 md:flex-row md:items-center md:justify-between md:text-left">
      <div className="min-w-0">
        <h2 className="text-base font-bold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-500">{subtitle}</p>
      </div>
      <div className="w-full max-w-md md:w-auto [&>button]:w-full md:[&>button]:w-auto shrink-0">{action}</div>
    </div>
  )
}

// One person as a card (phones) — the table doesn't fit a 390px screen.
function PersonCard({ name, you, lines, badges, onEdit, onRemove, editLabel, removeLabel }) {
  return (
    <div className="px-4 py-4 flex flex-col gap-3">
      <div className="min-w-0">
        <p className="text-base font-semibold text-gray-900 break-words">
          {name}{you && <span className="text-xs font-normal text-gray-400 ml-1.5">{you}</span>}
        </p>
        {lines.filter(Boolean).map((l, i) => <p key={i} className="text-sm text-gray-500 break-all">{l}</p>)}
      </div>
      <div className="flex flex-wrap gap-1.5">{badges}</div>
      <div className={`grid gap-2 ${onRemove ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <button onClick={onEdit} className="rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-800 active:bg-gray-50">{editLabel}</button>
        {onRemove && <button onClick={onRemove} className="rounded-xl border border-red-100 bg-red-50 py-2.5 text-sm font-semibold text-red-600 active:bg-red-100">{removeLabel}</button>}
      </div>
    </div>
  )
}

// ── Staff — same "search FieldClock instead of typing a raw ID" method as
// jccs-inventory's Users page (src/api/fieldclockAuth.js's listEmployees()
// hits FieldClock directly from the browser with the signed-in admin's own
// token). ──────────────────────────────────────────────────────────────
function StaffSection({ projects }) {
  const { t } = useTranslation()
  const confirmDialog = useConfirm()
  const toast = useToast()
  const myId = useAuthStore((s) => s.user?.id)

  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // 'create' | the user object being edited | null
  const [form, setForm] = useState(EMPTY_STAFF)
  const [accessProjects, setAccessProjects] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [employees, setEmployees] = useState(null) // null = not loaded yet
  const [employeesError, setEmployeesError] = useState(false)
  const [employeeSearch, setEmployeeSearch] = useState('')
  const [pickedEmployee, setPickedEmployee] = useState(null)
  const [manualEntry, setManualEntry] = useState(false)

  const load = () => {
    setLoading(true)
    listUsers().then((d) => setUsers(d.users ?? [])).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const openCreate = () => {
    setForm(EMPTY_STAFF); setAccessProjects([]); setError(''); setModal('create')
    setEmployeeSearch(''); setPickedEmployee(null); setManualEntry(false)
    setEmployees(null); setEmployeesError(false)
    listEmployees()
      .then((d) => setEmployees(d.employees ?? []))
      .catch(() => { setEmployeesError(true); setManualEntry(true) })
  }
  const openEdit = (u) => {
    setForm({ fieldclock_user_id: String(u.fieldclock_user_id), name: u.name, role: u.role, email: u.email ?? '', phone: u.phone ?? '' })
    setAccessProjects(u.project_numbers ?? [])
    setError(''); setModal(u)
  }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const toggleAccess = (pn) => setAccessProjects((prev) => prev.includes(pn) ? prev.filter((p) => p !== pn) : [...prev, pn])

  const provisionedIds = new Set(users.map((u) => String(u.fieldclock_user_id)))
  const employeeMatches = !employeeSearch.trim() ? [] : (employees ?? []).filter((emp) => {
    if (provisionedIds.has(String(emp.id))) return false
    const q = employeeSearch.trim().toLowerCase()
    // FieldClock crew can be phone-only (no email), so every field may be null.
    return [emp.name, emp.email, emp.phone].some((v) => (v ?? '').toString().toLowerCase().includes(q))
  })

  const pickEmployee = (emp) => {
    setPickedEmployee(emp)
    setForm((f) => ({
      ...f,
      fieldclock_user_id: String(emp.id),
      name: emp.name ?? '',
      email: f.email || emp.email || '',
      phone: f.phone || emp.phone || '',
    }))
    setEmployeeSearch('')
  }
  const clearPickedEmployee = () => {
    setPickedEmployee(null)
    setForm((f) => ({ ...f, fieldclock_user_id: '', name: '' }))
  }

  const handleSave = async () => {
    if (modal === 'create' && !form.fieldclock_user_id) { setError(t('users.fieldclockIdRequired')); return }
    if (!form.name.trim()) { setError(t('users.nameRequired')); return }
    setSaving(true); setError('')
    try {
      const payload = { name: form.name.trim(), role: form.role, email: form.email.trim(), phone: form.phone.trim() }
      if (form.role === 'pm') payload.project_numbers = accessProjects
      if (modal === 'create') {
        await createUser({ ...payload, fieldclock_user_id: form.fieldclock_user_id })
      } else {
        await updateUser(modal.fieldclock_user_id, payload)
      }
      setModal(null); load()
    } catch (err) {
      setError(err?.response?.data?.error ?? t('common.couldNotSave'))
    } finally { setSaving(false) }
  }

  const handleDeactivate = async (u) => {
    if (!await confirmDialog(t('users.removeAccessConfirm', { name: u.name }), { danger: true, confirmLabel: t('users.removeAccess') })) return
    try { await deactivateUser(u.fieldclock_user_id); load() }
    catch (err) { toast.error(err?.response?.data?.error ?? t('common.couldNotSave')) }
  }

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader title={t('users.staffTitle')} subtitle={t('users.staffSubtitle')}
        action={<Button size="lg" onClick={openCreate}>{t('users.addUser')}</Button>} />

      {loading ? <Card><Spinner /></Card> : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {users.length === 0 ? (
            <p className="text-center text-gray-400 py-10 text-sm">{t('users.noUsersYet')}</p>
          ) : (
            <>
            <div className="md:hidden divide-y divide-gray-100">
              {users.map((u) => (
                <PersonCard key={u.fieldclock_user_id} name={u.name} you={u.fieldclock_user_id === myId ? t('users.you') : null}
                  lines={[u.email || u.phone, u.role === 'pm' ? `${t('users.projects')}: ${u.project_numbers.length ? u.project_numbers.join(', ') : '—'}` : null]}
                  badges={<>
                    <Badge variant={u.role === 'admin' ? 'active' : u.role === 'field' ? 'pending' : 'inactive'}>{t(`role.${u.role}`)}</Badge>
                    {!u.is_active && <Badge variant="inactive">{t('users.inactive')}</Badge>}
                  </>}
                  editLabel={t('common.edit')} onEdit={() => openEdit(u)}
                  removeLabel={t('users.removeAccess')}
                  onRemove={u.fieldclock_user_id !== myId && u.is_active === 1 ? () => handleDeactivate(u) : null} />
              ))}
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {[t('common.name'), t('users.role'), t('users.projects'), t('users.status'), ''].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map((u) => (
                    <tr key={u.fieldclock_user_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {u.name}{u.fieldclock_user_id === myId && <span className="text-xs text-gray-400 ml-1.5">{t('users.you')}</span>}
                        <p className="text-xs text-gray-400 font-normal">{u.email || '—'}</p>
                      </td>
                      <td className="px-4 py-3"><Badge variant={u.role === 'admin' ? 'active' : u.role === 'field' ? 'pending' : 'inactive'}>{t(`role.${u.role}`)}</Badge></td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {u.role === 'admin' ? t('users.allProjects') : u.role === 'field' ? t('nav.siteWalks') : (u.project_numbers.length ? u.project_numbers.join(', ') : '—')}
                      </td>
                      <td className="px-4 py-3"><Badge variant={u.is_active ? 'active' : 'inactive'}>{u.is_active ? t('users.active') : t('users.inactive')}</Badge></td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => openEdit(u)} className="text-xs font-semibold text-brand-700 hover:underline">{t('common.edit')}</button>
                          {u.fieldclock_user_id !== myId && u.is_active === 1 && (
                            <button onClick={() => handleDeactivate(u)} className="text-xs font-semibold text-red-500 hover:underline">{t('users.removeAccess')}</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>
      )}

      <Modal isOpen={!!modal} onClose={() => setModal(null)} title={modal === 'create' ? t('users.addUser') : t('users.editUser')}>
        <div className="flex flex-col gap-4">
          {modal === 'create' && (
            manualEntry ? (
              <div className="flex flex-col gap-1">
                <Input label={t('users.fieldclockUserId')} type="number" value={form.fieldclock_user_id} onChange={set('fieldclock_user_id')} />
                <p className="text-xs text-gray-400">{t('users.fieldclockIdHelper')}</p>
                {!employeesError && (
                  <button type="button" onClick={() => setManualEntry(false)} className="text-xs font-semibold text-brand-500 hover:underline w-fit">
                    {t('users.searchInstead')}
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">{t('users.findPerson')}</label>
                {pickedEmployee ? (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-brand-400 bg-brand-100/40 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{pickedEmployee.name}</p>
                      <p className="text-xs text-gray-500 truncate">{pickedEmployee.email}{pickedEmployee.phone ? ` · ${pickedEmployee.phone}` : ''}</p>
                    </div>
                    <button type="button" onClick={clearPickedEmployee} className="text-xs font-semibold text-gray-400 hover:text-gray-600 shrink-0">
                      {t('common.change')}
                    </button>
                  </div>
                ) : (
                  <>
                    <input type="text" placeholder={t('users.searchPlaceholder')} value={employeeSearch}
                      onChange={(e) => setEmployeeSearch(e.target.value)} disabled={employees === null}
                      className="rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-gray-50 disabled:text-gray-400" />
                    {employees === null ? (
                      <p className="text-xs text-gray-400">{t('users.loadingDirectory')}</p>
                    ) : employeeSearch.trim() && (
                      employeeMatches.length === 0 ? (
                        <p className="text-xs text-gray-400 py-2">{t('users.noMatches')}</p>
                      ) : (
                        <div className="flex flex-col gap-1 max-h-48 overflow-y-auto rounded-xl border border-gray-100 p-1.5">
                          {employeeMatches.map((emp) => (
                            <button key={emp.id} type="button" onClick={() => pickEmployee(emp)}
                              className="text-left rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors">
                              <p className="text-sm font-medium text-gray-900">{emp.name}</p>
                              <p className="text-xs text-gray-400">{emp.email || emp.phone || '—'}</p>
                            </button>
                          ))}
                        </div>
                      )
                    )}
                    <button type="button" onClick={() => setManualEntry(true)} className="text-xs font-semibold text-gray-400 hover:text-gray-600 w-fit">
                      {t('users.enterIdManually')}
                    </button>
                  </>
                )}
              </div>
            )
          )}
          <Input label={t('common.name')} value={form.name} onChange={set('name')} />
          <Input label={`${t('users.email')} (${t('common.optional')})`} value={form.email} onChange={set('email')} />
          <Input label={`${t('users.phone')} (${t('common.optional')})`} value={form.phone} onChange={set('phone')} />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">{t('users.role')}</label>
            <select value={form.role} onChange={set('role')} disabled={modal !== 'create' && modal?.fieldclock_user_id === myId}
              className="rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-gray-50 disabled:text-gray-400">
              <option value="pm">{t('role.pm')}</option>
              <option value="field">{t('role.field')}</option>
              <option value="admin">{t('role.admin')}</option>
            </select>
          </div>
          {form.role === 'pm' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">{t('users.projectAccess')}</label>
              <ProjectAccessPicker projects={projects} selected={accessProjects} onToggle={toggleAccess} />
            </div>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
          <Button onClick={handleSave} loading={saving} fullWidth>{t('users.saveUser')}</Button>
        </div>
      </Modal>
    </div>
  )
}

// ── Clients — same shape as StaffSection, but the "directory" being
// searched is local (this app's own `clients` table, loaded once and
// filtered client-side) instead of FieldClock's. No match → create a new
// client right there instead of falling back to a raw ID field, since
// there's no external ID to type in the first place. ───────────────────
function ClientsSection({ projects }) {
  const { t } = useTranslation()
  const confirmDialog = useConfirm()
  const toast = useToast()

  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY_CLIENT)
  const [accessProjects, setAccessProjects] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState(null)
  const [creatingNew, setCreatingNew] = useState(false)

  const load = () => {
    setLoading(true)
    listClientAccounts().then((d) => setClients(d.clients ?? [])).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const openCreate = () => {
    setForm(EMPTY_CLIENT); setAccessProjects([]); setError(''); setModal('create')
    setSearch(''); setPicked(null); setCreatingNew(false)
  }
  const openEdit = (c) => {
    setForm({ email: c.email, name: c.name, phone: c.phone ?? '', password: '' })
    setAccessProjects(c.project_numbers ?? [])
    setError(''); setModal(c)
  }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const toggleAccess = (pn) => setAccessProjects((prev) => prev.includes(pn) ? prev.filter((p) => p !== pn) : [...prev, pn])

  const matches = !search.trim() ? [] : clients.filter((c) => {
    const q = search.trim().toLowerCase()
    return [c.name, c.email, c.phone].some((v) => (v ?? '').toString().toLowerCase().includes(q))
  })

  const pickExisting = (c) => {
    setPicked(c)
    setAccessProjects(c.project_numbers ?? [])
    setSearch('')
  }
  const clearPicked = () => { setPicked(null); setAccessProjects([]) }

  const handleSaveExistingAccess = async () => {
    setSaving(true); setError('')
    try {
      await updateClientAccount(picked.id, { project_numbers: accessProjects })
      setModal(null); load()
    } catch (err) {
      setError(err?.response?.data?.error ?? t('common.couldNotSave'))
    } finally { setSaving(false) }
  }

  const handleCreateNew = async () => {
    if (!form.name.trim()) { setError(t('users.nameRequired')); return }
    if (!form.email.trim()) { setError(t('users.emailRequired')); return }
    // Password is optional — blank means "email them an invite to set it".
    if (form.password && form.password.length < 8) { setError(t('users.passwordTooShort')); return }
    setSaving(true); setError('')
    try {
      const payload = { email: form.email.trim(), name: form.name.trim(), phone: form.phone.trim(), project_numbers: accessProjects }
      if (form.password) payload.password = form.password
      await createClientAccount(payload)
      setModal(null); load()
    } catch (err) {
      setError(err?.response?.data?.error ?? t('common.couldNotSave'))
    } finally { setSaving(false) }
  }

  const handleEditSave = async () => {
    if (!form.name.trim()) { setError(t('users.nameRequired')); return }
    if (form.password && form.password.length < 8) { setError(t('users.passwordTooShort')); return }
    setSaving(true); setError('')
    try {
      const payload = { name: form.name.trim(), phone: form.phone.trim(), project_numbers: accessProjects }
      if (form.password) payload.password = form.password
      await updateClientAccount(modal.id, payload)
      setModal(null); load()
    } catch (err) {
      setError(err?.response?.data?.error ?? t('common.couldNotSave'))
    } finally { setSaving(false) }
  }

  const handleDeactivate = async (c) => {
    if (!await confirmDialog(t('users.removeAccessConfirm', { name: c.name }), { danger: true, confirmLabel: t('users.removeAccess') })) return
    try { await deactivateClientAccount(c.id); load() }
    catch (err) { toast.error(err?.response?.data?.error ?? t('common.couldNotSave')) }
  }

  const handlePermanentDelete = async () => {
    if (!await confirmDialog(t('users.deleteClientConfirm', { name: modal.name }), { danger: true, title: t('users.deleteClientTitle'), confirmLabel: t('users.deleteClientConfirmBtn') })) return
    setSaving(true); setError('')
    try {
      await deleteClientAccount(modal.id)
      setModal(null); load()
    } catch (err) {
      setError(err?.response?.data?.error ?? t('common.couldNotSave'))
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader title={t('users.clientsTitle')} subtitle={t('users.clientsSubtitle')}
        action={<Button size="lg" onClick={openCreate}>{t('users.addClient')}</Button>} />

      {loading ? <Card><Spinner /></Card> : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {clients.length === 0 ? (
            <p className="text-center text-gray-400 py-10 text-sm">{t('users.noClientsYet')}</p>
          ) : (
            <>
            <div className="md:hidden divide-y divide-gray-100">
              {clients.map((c) => (
                <PersonCard key={c.id} name={c.name}
                  lines={[c.email, `${t('users.projects')}: ${c.project_numbers.length ? c.project_numbers.join(', ') : '—'}`]}
                  badges={<Badge variant={c.is_active ? 'active' : 'inactive'}>{c.is_active ? t('users.active') : t('users.inactive')}</Badge>}
                  editLabel={t('common.edit')} onEdit={() => openEdit(c)}
                  removeLabel={t('users.removeAccess')}
                  onRemove={c.is_active === 1 ? () => handleDeactivate(c) : null} />
              ))}
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {[t('common.name'), t('users.email'), t('users.projects'), t('users.status'), ''].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {clients.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{c.email}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{c.project_numbers.length ? c.project_numbers.join(', ') : '—'}</td>
                      <td className="px-4 py-3"><Badge variant={c.is_active ? 'active' : 'inactive'}>{c.is_active ? t('users.active') : t('users.inactive')}</Badge></td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => openEdit(c)} className="text-xs font-semibold text-brand-700 hover:underline">{t('common.edit')}</button>
                          {c.is_active === 1 && (
                            <button onClick={() => handleDeactivate(c)} className="text-xs font-semibold text-red-500 hover:underline">{t('users.removeAccess')}</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>
      )}

      <Modal isOpen={!!modal} onClose={() => setModal(null)} title={modal === 'create' ? t('users.addClient') : t('users.editClient')}>
        <div className="flex flex-col gap-4">
          {modal === 'create' && !picked && !creatingNew && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">{t('users.findClient')}</label>
              <input type="text" placeholder={t('users.searchClientPlaceholder')} value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
              {search.trim() && (
                matches.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2">{t('users.noClientMatches')}</p>
                ) : (
                  <div className="flex flex-col gap-1 max-h-48 overflow-y-auto rounded-xl border border-gray-100 p-1.5">
                    {matches.map((c) => (
                      <button key={c.id} type="button" onClick={() => pickExisting(c)}
                        className="text-left rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors">
                        <p className="text-sm font-medium text-gray-900">{c.name}</p>
                        <p className="text-xs text-gray-400">{c.email}</p>
                      </button>
                    ))}
                  </div>
                )
              )}
              <button type="button" onClick={() => setCreatingNew(true)} className="text-xs font-semibold text-brand-500 hover:underline w-fit mt-1">
                {t('users.notRegisteredCreate')}
              </button>
            </div>
          )}

          {modal === 'create' && picked && (
            <>
              <div className="flex items-center justify-between gap-2 rounded-xl border border-brand-400 bg-brand-100/40 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{picked.name}</p>
                  <p className="text-xs text-gray-500 truncate">{picked.email}</p>
                </div>
                <button type="button" onClick={clearPicked} className="text-xs font-semibold text-gray-400 hover:text-gray-600 shrink-0">
                  {t('common.change')}
                </button>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">{t('users.projectAccess')}</label>
                <ProjectAccessPicker projects={projects} selected={accessProjects} onToggle={toggleAccess} />
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
              <Button onClick={handleSaveExistingAccess} loading={saving} fullWidth>{t('users.grantAccess')}</Button>
            </>
          )}

          {modal === 'create' && creatingNew && (
            <>
              <button type="button" onClick={() => setCreatingNew(false)} className="text-xs font-semibold text-gray-400 hover:text-gray-600 w-fit">
                {t('users.searchInstead')}
              </button>
              <Input label={t('common.name')} value={form.name} onChange={set('name')} />
              <Input label={t('users.email')} value={form.email} onChange={set('email')} />
              <Input label={`${t('users.phone')} (${t('common.optional')})`} value={form.phone} onChange={set('phone')} />
              <Input label={`${t('users.initialPassword')} (${t('common.optional')})`} type="text" value={form.password} onChange={set('password')}
                helperText={t('users.inviteHelper')} />
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">{t('users.projectAccess')}</label>
                <ProjectAccessPicker projects={projects} selected={accessProjects} onToggle={toggleAccess} />
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
              <Button onClick={handleCreateNew} loading={saving} fullWidth>
                {form.password ? t('users.addClient') : t('users.addClientInvite')}
              </Button>
            </>
          )}

          {modal && modal !== 'create' && (
            <>
              <Input label={t('common.name')} value={form.name} onChange={set('name')} />
              <Input label={t('users.email')} value={form.email} disabled />
              <Input label={`${t('users.phone')} (${t('common.optional')})`} value={form.phone} onChange={set('phone')} />
              <Input label={`${t('users.resetPassword')} (${t('common.optional')})`} type="text" value={form.password} onChange={set('password')}
                helperText={t('users.passwordHelper')} />
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">{t('users.projectAccess')}</label>
                <ProjectAccessPicker projects={projects} selected={accessProjects} onToggle={toggleAccess} />
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
              <Button onClick={handleEditSave} loading={saving} fullWidth>{t('users.saveUser')}</Button>
              <button type="button" onClick={handlePermanentDelete}
                className="text-xs font-semibold text-red-600 hover:text-red-700 mt-1 self-center">
                {t('users.deleteClientPermanently')}
              </button>
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}

export default function Users() {
  const { t } = useTranslation()
  const [projects, setProjects] = useState([])

  useEffect(() => {
    listProjects().then((d) => setProjects(d.projects ?? [])).catch(() => {})
  }, [])

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t('users.title')} subtitle={t('users.subtitle')} />
      <StaffSection projects={projects} />
      <ClientsSection projects={projects} />
    </div>
  )
}
