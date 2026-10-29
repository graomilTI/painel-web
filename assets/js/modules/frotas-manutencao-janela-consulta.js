// Frotas · Manutenção › Corretiva: janelas só de leitura da manutenção (histórico e comparativo das cotações).
import { closeModal, openModal } from '../core/ui.js';
import { htmlComparativo, htmlModalHistorico } from './frotas-manutencao-html.js?v=20261029-frotas-inst88';

export function criarConsulta(ctx) {
  const { state } = ctx;
  const CMP = 'fmComparativo';
  const HIST = 'fmHistorico';

  // ---------- histórico (janela) ----------
  function abrirHistorico(m) {
    const ov = openModal({ id: HIST, conteudoHtml: htmlModalHistorico(m) });
    ov.classList.add('fm-mod', 'fm-modal-largo', 'fm-modal-orc');
    ov.addEventListener('click', (e) => { if (e.target.closest('[data-acao="hist-fechar"]')) closeModal(HIST); });
  }

  // ---------- comparativo das cotações (janela, lado a lado) ----------
  function abrirComparativo(m) {
    const orcs = state.orcs.filter((o) => o.manutencao_id === m.id);
    const ov = openModal({ id: CMP, conteudoHtml: htmlComparativo(m, orcs) });
    ov.classList.add('fm-mod', 'fm-modal-largo', 'fm-modal-orc');
    ov.addEventListener('click', async (e) => {
      const alvo = e.target.closest('[data-acao]'); if (!alvo) return;
      if (alvo.dataset.acao === 'cmp-fechar') return closeModal(CMP);
    });
  }

  return { abrirHistorico, abrirComparativo };
}
