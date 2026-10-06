import { useEffect, useState } from 'react'
import { listQuoteProjects, listQuoteStaff, listQuoteClients } from '../../api/quoteRequests'

// Loads the pickers the request form needs: client users (estimate
// recipients), active projects (add-ons) and — office only — staff.
export function useQuotePickers(isAdmin) {
  const [clients, setClients] = useState([])
  const [projects, setProjects] = useState([])
  const [staff, setStaff] = useState([])
  useEffect(() => {
    listQuoteClients().then((d) => setClients(d.clients ?? [])).catch(() => {})
    listQuoteProjects().then((d) => setProjects(d.projects ?? [])).catch(() => {})
    if (isAdmin) listQuoteStaff().then((d) => setStaff(d.staff ?? [])).catch(() => {})
  }, [isAdmin])
  return { clients, projects, staff }
}
