import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const SUPABASE_URL = 'https://jbzmcyycanrlnfhedcup.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impiem1jeXljYW5ybG5maGVkY3VwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxMzc4MzMsImV4cCI6MjA5ODcxMzgzM30.jr1eEGYx1hg3jJl6oGcHbGY9Kx2vr8YrXUgW_14WA2E';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
