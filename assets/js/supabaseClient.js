import { createClient } from '../vendor/supabase-js/supabase-js-2.117.3.js';

export const SUPABASE_URL = 'https://jbzmcyycanrlnfhedcup.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_IyW6rkgdOfEfQh_kx-Z6QQ_cWpdAMte';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
