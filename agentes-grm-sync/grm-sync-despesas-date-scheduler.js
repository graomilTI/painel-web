#!/usr/bin/env node
'use strict';

require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.SB_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.SUPABASE_SERVICE_KEY
  || process.env.SB_SERVICE_KEY
  || process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

async function main() {
  const { data, error } = await supabase.rpc(
    'ativar_grm_despesas_do_dia',
  );

  if (error) throw error;

  console.log(
    `[GRM-DESPESAS-DATA] ${new Date().toISOString()} ${JSON.stringify(data || {})}`,
  );
}

main().catch((error) => {
  console.error(
    `[GRM-DESPESAS-DATA] ${new Date().toISOString()} ERRO: ${error.message}`,
  );
  process.exitCode = 1;
});
