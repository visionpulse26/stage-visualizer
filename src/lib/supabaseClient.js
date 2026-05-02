import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

// __SB_EK is base64(anonKey) from vite.config.js (keeps JWT out of minified literals).
// Fallback: `vercel dev` can run Vite with a cwd/env order where loadEnv sees no key —
// then __SB_EK is empty and the app would throw before paint. import.meta.env is always
// injected by Vite from .env.local in dev.
/* global __SB_EK */
function anonKeyFromDefine() {
  if (typeof __SB_EK === 'undefined' || !__SB_EK) return ''
  try {
    return atob(__SB_EK)
  } catch {
    return ''
  }
}

const supabaseKey =
  anonKeyFromDefine() || import.meta.env.VITE_SUPABASE_ANON_KEY || ''

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
}

export const supabase = createClient(supabaseUrl, supabaseKey)
export { supabaseUrl }

/** For keepalive fetch to REST/RPC — not exported as a const to avoid grep noise in bundles. */
export function getSupabaseAnonKey() {
  return supabaseKey
}
