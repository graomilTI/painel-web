// Frotas · Manutenção › Preventiva: card de serviço (botão selecionável) usado na janela do veículo e no passo 1 do registro.
// O card mostra o nome (sem o "Troca de" inicial), a estimativa de prazo do guia (x km ou x meses) e o vencimento do veículo.
import { dataBR, esc } from '../core/ui.js';
import { STATUS_VENCIMENTO, descreverIntervalo } from './frotas-manutencao-regras.js?v=20261019-frotas-manut38';
import { nomeCurto, restanteCelula } from './frotas-manutencao-preventiva-regras.js?v=20261019-frotas-manut38';

export const fmtKm = (v) => (v == null ? '—' : `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} km`);

export const venceTexto = (l) => [l.vencimento_data ? dataBR(l.vencimento_data) : '', l.vencimento_km != null ? fmtKm(l.vencimento_km) : ''].filter(Boolean).join(' · ') || '—';

// s: linha de frotas_manutencao_vencimentos_v; plano: plano do guia (intervalos); selecionado: marcado para registrar.
export function htmlCardServico(s, plano = {}, selecionado = false) {
  const st = STATUS_VENCIMENTO[s.status] || { label: s.status, tone: 'blue' };
  const intervalo = descreverIntervalo(plano) || '';
  const prazo = s.status === 'sem_historico' ? 'Sem histórico' : `${st.label}${restanteCelula(s) ? ` · ${restanteCelula(s)}` : ''}`;
  const vence = s.status === 'sem_historico' ? '' : `<span class="fm-svc-vence">vence ${esc(venceTexto(s))}</span>`;
  return `<button type="button" class="fm-svc-card fm-svc-card-${esc(s.status)}${selecionado ? ' sel' : ''}" data-card="${esc(s.plano_id)}" aria-pressed="${selecionado ? 'true' : 'false'}" title="${esc(s.plano_nome)}">
    <span class="fm-svc-check" aria-hidden="true">✓</span>
    <strong>${esc(nomeCurto(s.plano_nome))}</strong>
    <span class="fm-svc-intervalo">${esc(intervalo || '—')}${s.tipo === 'verificacao' ? ' · verificação' : ''}</span>
    <span class="fm-svc-prazo">${esc(prazo)}${s.em_andamento ? ' · em andamento' : ''}</span>${vence}</button>`;
}
