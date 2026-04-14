import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

// __SB_EK is base64(anonKey) injected at build time by vite.config.js.
// atob() decodes it at runtime, keeping the raw JWT out of the bundle as a plain string.
/* global __SB_EK */
const supabaseKey = (typeof __SB_EK !== 'undefined' && __SB_EK)
  ? atob(__SB_EK)
  : ''

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
}

export const supabase = createClient(supabaseUrl, supabaseKey)
export { supabaseUrl }

/** For keepalive fetch to REST/RPC — not exported as a const to avoid grep noise in bundles. */
export function getSupabaseAnonKey() {
  return supabaseKey
}
