import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Verify environment variables
export const isSupabaseConfigured = () => {
  return !!supabaseUrl && supabaseUrl !== 'your_supabase_project_url' &&
         !!supabaseAnonKey && supabaseAnonKey !== 'your_supabase_anon_public_key';
};

// Public client for client-side components
export const supabase = isSupabaseConfigured()
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Admin client for backend operations (e.g. bypassing RLS if needed, or secure actions)
export const supabaseAdmin = isSupabaseConfigured() && supabaseServiceKey && supabaseServiceKey !== 'your_supabase_service_role_key'
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    })
  : null;
