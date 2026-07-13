import { supabase } from './supabaseClient.js';

// Refeições são pagas por arquivo de carga (Conferência, Flash e iFood).
// A Edge Function financeiro-pagar-beneficios era acionada como se o painel
// fizesse pagamento direto nas plataformas e retornava HTTP 400. Para o fluxo
// de Refeições, confirmamos localmente a preparação do lote e deixamos a rotina
// principal registrar as linhas, gerar os arquivos e mover os itens ao histórico.

if (!globalThis.__financeiroRefeicoesModoArquivo) {
  globalThis.__financeiroRefeicoesModoArquivo = true;

  const functionsClient = supabase.functions;
  const originalInvoke = functionsClient.invoke.bind(functionsClient);

  functionsClient.invoke = async (functionName, options = {}) => {
    const tipo = String(options?.body?.tipo || '').trim().toLowerCase();
    const isRefeicoes = tipo.includes('refei') || tipo.includes('cafe') || tipo.includes('almoço') || tipo.includes('almoco') || tipo.includes('janta');

    if (functionName === 'financeiro-pagar-beneficios' && isRefeicoes) {
      const flash = Array.isArray(options?.body?.flash) ? options.body.flash : [];
      const ifood = Array.isArray(options?.body?.ifood) ? options.body.ifood : [];
      const linhas = Array.isArray(options?.body?.linhas) ? options.body.linhas : [];

      console.info('[Financeiro] Refeições processadas em modo arquivo.', {
        execucao_id: options?.body?.execucao_id || null,
        flash: flash.length,
        ifood: ifood.length,
        linhas: linhas.length
      });

      return {
        data: {
          ok: true,
          modo: 'ARQUIVO',
          mensagem: 'Lote preparado para exportação de planilhas.',
          flash_linhas: flash.length,
          ifood_linhas: ifood.length,
          total_linhas: linhas.length,
          processado_em: new Date().toISOString()
        },
        error: null
      };
    }

    return originalInvoke(functionName, options);
  };
}
