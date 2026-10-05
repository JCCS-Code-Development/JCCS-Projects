import { useEffect, useState } from 'react'
import { listQuoteProjects, listQuoteStaff } from '../../api/quoteRequests'
import { listCustomers } from '../../api/customers'

// Loads the pickers the request form needs. Staff list is office-only.
export function useQuotePickers(isAdmin) {
  const [customers, setCustomers] = useState([])
  const [projects, setProjects] = useState([])
  const [staff, setStaff] = useState([])
  useEffect(() => {
    listCustomers().then((d) => setCustomers(d.customers ?? [])).catch(() => {})
    listQuoteProjects().then((d) => setProjects(d.projects ?? [])).catch(() => {})
    if (isAdmin) listQuoteStaff().then((d) => setStaff(d.staff ?? [])).catch(() => {})
  }, [isAdmin])
  return { customers, projects, staff }
}
