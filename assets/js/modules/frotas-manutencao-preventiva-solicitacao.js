// Frotas · Manutenção › Preventiva: abre a solicitação dos serviços vencidos ou próximos do veículo (e leva para a ficha na Corretiva).
import { closeModal, toast } from '../core/ui.js';
import * as dados from './frotas-manutencao-dados.js?v=20261029-frotas-inst80';
import { pendentesDoVeiculo } from './frotas-manutencao-preventiva-regras.js?v=20261029-frotas-inst80';

export function criarSolicitacao(ctx) {
  const { state, veiculoCompleto, render, renderPainel } = ctx;
  const PAINEL = 'fmPreventivaPainel';

  // ---------- Solicitar ----------
  async function abrirSolicitacao(veiculoId) {
    const v = veiculoCompleto(veiculoId); if (!v || state.ocupado) return;
    const pend = pendentesDoVeiculo({ servicos: v.servicos.filter((s) => s.tipo === 'servico') }, 'servico'); if (!pend.length) return;
    state.ocupado = true; render(); renderPainel();
    try {
      const id = await dados.solicitar(state.supabase, {
        veiculo_id: veiculoId, origem: 'plano', prioridade: pend.some((p) => p.status === 'vencida') ? 'alta' : 'normal',
        descricao: `Manutenção programada: ${pend.map((p) => p.plano_nome).join(', ')} — ${v.placa}`,
        itens: pend.map((p) => ({ categoria_codigo: p.categoria_codigo, natureza: 'preventiva', descricao: p.plano_nome, plano_id: p.plano_id })),
      });
      toast('Solicitação aberta. Abrindo a ficha...');
      closeModal(PAINEL);
      window.FROTAS_MANUTENCAO_ABRIR = id;
      document.querySelector('[data-ds-tab="manutencao"]')?.click();
    } catch (err) {
      toast(err.message || 'Erro ao abrir a solicitação.', 'err', 5500);
    } finally {
      state.ocupado = false; render(); renderPainel();
    }
  }

  return { abrirSolicitacao };
}
