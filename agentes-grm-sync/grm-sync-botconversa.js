#!/usr/bin/env node

require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL || process.env.SB_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

if (!url || !key) throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const iniciadoEm = new Date().toISOString();
  const { error: invokeError } = await supabase.functions.invoke('botconversa-sync', {
    body: { action: 'start_sync' },
  });
  if (invokeError) throw new Error(`Falha ao iniciar BotConversa: ${invokeError.message}`);

  for (let tentativa = 0; tentativa < 120; tentativa += 1) {
    const { data, error } = await supabase
      .from('botconversa_jobs')
      .select('id,status,total_processado,total_sucesso,total_erro,erro,created_at,finished_at')
      .eq('tipo', 'sync_subscribers')
      .gte('created_at', iniciadoEm)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) { await wait(1000); continue; }

    if (data.status === 'concluido') {
      console.log(`[SUCCESS] BotConversa concluído: ${data.total_sucesso || 0} sucesso(s), ${data.total_erro || 0} erro(s).`);
      return;
    }
    if (['erro', 'falha', 'cancelado'].includes(data.status)) {
      throw new Error(data.erro || `BotConversa terminou com status ${data.status}.`);
    }
    await wait(1000);
  }
  throw new Error('Timeout aguardando a conclusão do BotConversa.');
}

main().catch((error) => {
  console.error('[ERROR]', error.message || error);
  process.exit(1);
});
