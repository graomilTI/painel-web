// supabaseClient.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const SUPABASE_URL = "https://xyzpnuumdqhegxakkyws.supabase.co"
const SUPABASE_ANON_KEY = "sb_publishable_YDjKfceWqANbNVMaHte2Kw_Dy4_i471"

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
