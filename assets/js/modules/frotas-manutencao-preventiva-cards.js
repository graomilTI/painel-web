// Frotas · Manutenção › Preventiva: card de serviço (botão selecionável) usado na janela do veículo e no passo 1 do registro.
// O card mostra o nome (sem o "Troca de" inicial), a estimativa de prazo do guia (x km ou x meses) e o vencimento do veículo.
import { dataBR, esc } from '../core/ui.js';
import { STATUS_VENCIMENTO, descreverIntervalo } from './frotas-manutencao-regras.js?v=20261029-frotas-inst85';
import { nomeCurto, restanteCelula } from './frotas-manutencao-preventiva-regras.js?v=20261029-frotas-inst85';

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

// Histórico de preventivas do veículo: para cada serviço do guia, quando foi feito por último e quando vence a próxima (data e km);
// depois, os registros feitos. Quem tem histórico vem primeiro, pelo vencimento mais próximo.
export function htmlHistoricoPreventiva(v, registros = null) {
  const servicos = [...(v.servicos || [])].sort((a, b) => {
    const ha = a.status === 'sem_historico' ? 1 : 0; const hb = b.status === 'sem_historico' ? 1 : 0;
    if (ha !== hb) return ha - hb;
    return String(a.vencimento_data || '9999').localeCompare(String(b.vencimento_data || '9999')) || String(a.plano_nome).localeCompare(String(b.plano_nome), 'pt-BR');
  });
  const feitos = servicos.filter((s) => s.status !== 'sem_historico').length;
  const linha = (s) => {
    const st = STATUS_VENCIMENTO[s.status] || { label: s.status, tone: 'blue' };
    const ultima = s.status === 'sem_historico' ? '<span class="fm-mm">Sem histórico</span>' : `${esc(s.data_ultima ? dataBR(s.data_ultima) : '—')}<small>${esc(fmtKm(s.km_ultima))}</small>`;
    const proxima = s.status === 'sem_historico' ? '<span class="fm-mm">—</span>' : `${esc(s.vencimento_data ? dataBR(s.vencimento_data) : '—')}<small>${esc(s.vencimento_km != null ? fmtKm(s.vencimento_km) : '—')}</small>`;
    return `<tr><th scope="row">${esc(nomeCurto(s.plano_nome))}${s.tipo === 'verificacao' ? ' <span class="fm-mm">(verificação)</span>' : ''}</th><td>${ultima}</td><td>${proxima}</td><td><span class="fm-badge ${esc(st.tone)}">${esc(st.label)}</span>${s.em_andamento ? ' <span class="fm-badge amber">em andamento</span>' : ''}</td></tr>`;
  };
  const regs = registros === null ? '<div class="fm-mm">Carregando os registros…</div>'
    : registros.length ? `<ul class="fm-tl">${registros.map((r) => `<li><time>${esc(r.data_execucao ? dataBR(r.data_execucao) : '—')}</time><span><strong>${esc(fmtKm(r.km_execucao))}</strong>${r.custo != null && Number(r.custo) > 0 ? ` · ${esc(Number(r.custo).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))}` : ''}</span></li>`).join('')}</ul>`
      : '<div class="fm-mm">Nenhum registro de preventiva feito por aqui ainda.</div>';
  return `<div class="fm-orc-cab"><div class="fm-mod-head"><div><h3>Histórico de preventivas · ${esc(v.placa)}</h3><p>${esc(v.marca_modelo || '')}${v.coordenacao ? ` · ${esc(v.coordenacao)}` : ''} · Km atual ${esc(fmtKm(v.hodometro))} · ${feitos} de ${servicos.length} serviços com histórico</p></div><button class="fm-x" type="button" data-hist-fechar aria-label="Fechar">✕</button></div></div>
    <div class="fm-nova-corpo"><div class="fm-cmp-rolagem"><table class="fm-cmp"><thead><tr><th>Serviço</th><th>Última</th><th>Próxima</th><th>Situação</th></tr></thead><tbody>${servicos.map(linha).join('')}</tbody></table></div>
      <h4 class="fm-hist-titulo">Registros feitos</h4>${regs}</div>
    <div class="fm-nova-rodape"><div class="fm-nova-info"></div><div class="fm-nova-acoes"><button class="fm-btn ghost" type="button" data-hist-fechar>Fechar</button></div></div>`;
}
