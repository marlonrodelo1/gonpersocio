import { createClient } from '@supabase/supabase-js'

// Cliente Supabase del lado app. En Capacitor (bundle) la sesion se persiste en
// el localStorage del WebView, que sobrevive entre lanzamientos. Mismo patron
// que Pidoo: createClient con la config por defecto (persistSession,
// autoRefreshToken, detectSessionInUrl).
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)
