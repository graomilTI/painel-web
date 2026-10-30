// Financeiro — envio do comprovante ao fornecedor pelo BotConversa (Edge Function botconversa-send).
// Extraído de setor-pagamentos.js em 30/10/2026; o código das funções foi movido sem alteração (só saiu de dentro da fábrica).
// Ao editar, troque o token v=20261030-fin19 em TODOS os imports internos (ver tests/financeiro-modulos-versao.test.mjs).
import { supabase } from '../../supabaseClient.js';

export async function sendComprovanteViaBotConversa(phone, comprovanteUrl, fornecedor) {
  const tel = String(phone || '').replace(/\D/g, '');
  if (!tel) return { ok: false, error: 'Telefone inválido.' };
  try {
    const mensagem = `Olá${fornecedor ? `, ${fornecedor}` : ''}! Segue o comprovante de pagamento referente à sua solicitação.`;
    const { data, error } = await supabase.functions.invoke('botconversa-send', {
      body: { phone: tel, message: mensagem, fileUrl: comprovanteUrl, nome: fornecedor || '' }
    });
    if (error) return { ok: false, error: error.message || 'Erro na Edge Function.' };
    return data?.ok ? { ok: true } : { ok: false, error: data?.error || 'Falha ao enviar.' };
  } catch (e) {
    return { ok: false, error: e.message || 'Erro ao conectar.' };
  }
}
