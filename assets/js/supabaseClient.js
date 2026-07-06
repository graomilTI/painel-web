import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const SUPABASE_URL = 'https://jbzmcyycanrlnfhedcup.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_IyW6rkgdOfEfQh_kx-Z6QQ_cWpdAMte';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
