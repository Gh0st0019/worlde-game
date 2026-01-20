import { createClient } from '@supabase/supabase-js'

const runtimeEnv = typeof window !== 'undefined' ? window.__ENV__ : undefined
const supabaseUrl = runtimeEnv?.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey =
  runtimeEnv?.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseReady = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = supabaseReady ? createClient(supabaseUrl, supabaseAnonKey) : null
