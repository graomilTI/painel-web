// Frotas · Manutenção › Preventiva: janela de histórico do veículo (última e próxima manutenção de cada serviço e os registros feitos).
import { closeModal, openModal } from '../core/ui.js';
import * as dados from './frotas-manutencao-dados.js?v=20261029-frotas-inst85';
import { htmlHistoricoPreventiva } from './frotas-manutencao-preventiva-cards.js?v=20261029-frotas-inst85';

export function criarHistoricoPreventiva(ctx) {
  const { state, veiculoCompleto } = ctx;
  const HIST = 'fmPreventivaHistorico';

  // Histórico de preventivas do veículo (janela): última e próxima manutenção de cada serviço e os registros feitos.
  async function abrirHistoricoPreventiva(veiculoId) {
    const v = veiculoCompleto(veiculoId); if (!v) return;
    const ov = openModal({ id: HIST, conteudoHtml: htmlHistoricoPreventiva(v, null) });
    ov.classList.add('fm-mod', 'fm-modal-largo', 'fm-modal-orc');
    ov.addEventListener('click', (e) => { if (e.target.closest('[data-hist-fechar]')) closeModal(HIST); });
    let regs = [];
    try { regs = await dados.carregarRegistrosPreventivos(state.supabase, veiculoId); } catch { regs = []; }
    const atual = document.getElementById(HIST); if (!atual) return;
    atual.querySelector('.ds-modal-card').innerHTML = htmlHistoricoPreventiva(v, regs);
  }

  return { abrirHistoricoPreventiva };
}
