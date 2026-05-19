import { supabase } from '../lib/supabaseClient'

async function authHeader() {
  const { data } = await supabase.auth.getSession().catch(() => ({ data: null }))
  const token = data?.session?.access_token
  if (!token) throw new Error('Not signed in')
  return { Authorization: `Bearer ${token}` }
}

/**
 * @returns {Promise<object>} scan JSON
 */
export async function fetchAdminScan() {
  const headers = await authHeader()
  const res = await fetch('/api/admin/scan', { headers })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `Scan failed (${res.status})`)
  return body
}

export async function postProjectMutate(payload) {
  const headers = { 'Content-Type': 'application/json', ...(await authHeader()) }
  const res = await fetch('/api/admin/project-mutate', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`)
  return body
}

export async function postDeleteR2Keys(keys) {
  const headers = { 'Content-Type': 'application/json', ...(await authHeader()) }
  const res = await fetch('/api/admin/delete-r2', {
    method: 'POST',
    headers,
    body: JSON.stringify({ keys }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `Delete failed (${res.status})`)
  return body
}
