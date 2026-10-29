// Frotas · Manutenção › HTML: ficha da manutenção (dentro do cartão) e a janela de histórico. Reexporta as demais peças de HTML, para
// que quem já importava deste arquivo continue funcionando.
import { dataBR, dataHoraBR, dinheiro, esc } from '../core/ui.js';
import { htmlSeletor } from './frotas-manutencao-seletor.js?v=20261029-frotas-inst86';
import { PRIORIDADES, RESPONSAVEIS, camposEditaveis, codigoManutencao, somaNotas, statusInfo } from './frotas-manutencao-regras.js?v=20261029-frotas-inst86';
import { badgeStatus, hojeISO, opcoes } from './frotas-manutencao-html-base.js?v=20261029-frotas-inst86';
import { blocoNotas, htmlNotaIcones, htmlNotaLeitura } from './frotas-manutencao-html-notas.js?v=20261029-frotas-inst86';
import { blocoOrcamentos } from './frotas-manutencao-html-orcamento.js?v=20261029-frotas-inst86';

// ---------- ficha ----------
function faixaEtapa(m) {
  const aviso = (txt) => `<div class="fm-aviso" style="border-color:rgba(239,68,68,.4);background:rgba(239,68,68,.1);color:#fecaca">${txt}</div>`;
  return `${m.status === 'reprovada' ? aviso(`Reprovada: ${esc(m.motivo_status || '')}`) : ''}${m.status === 'cancelada' ? aviso(`Cancelada: ${esc(m.motivo_status || '')}`) : ''}`;
}

// Só os status que dividem a etapa com outro (em aprovação e reprovada em Cotações; na oficina em Em andamento) ganham selo.
const STATUS_COM_SELO = new Set(['em_aprovacao', 'reprovada', 'em_execucao']);

const ICONE_MAO = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>';

// Previsão, prioridade, quem paga e veículo parado numa linha só (a mão vermelha liga e desliga "veículo parado"); com a nota
// permitida (`comNota`), os ícones de NF/comprovante entram na mesma linha.
function blocoDados(m, ed, selo = '', comNota = false) {
  const campo = (rotulo, conteudo) => `<div class="fm-field"><label>${rotulo}</label>${conteudo}</div>`;
  const ro = (valor) => `<div class="fm-ro">${valor || '—'}</div>`;
  const edit = ed.cabecalho;
  const parado = edit
    ? `<label class="fm-parado" title="Veículo parado na oficina (clique para marcar ou desmarcar)"><input type="checkbox" data-campo="veiculo_parado"${m.veiculo_parado ? ' checked' : ''} aria-label="Veículo parado na oficina">${ICONE_MAO}</label>`
    : `<span class="fm-parado ro${m.veiculo_parado ? ' on' : ''}" title="${m.veiculo_parado ? 'Veículo parado na oficina' : 'Veículo não parado'}">${ICONE_MAO}</span>`;
  return `<div class="fm-sec">${selo ? `<div style="margin-bottom:8px">${selo}</div>` : ''}<div class="fm-dados">
    ${campo('Previsão de entrega', edit ? `<input class="fm-input" type="date" data-campo="previsao_entrega" value="${esc(m.previsao_entrega || '')}">` : ro(esc(m.previsao_entrega ? dataBR(m.previsao_entrega) : '')))}
    ${campo('Prioridade', edit ? `<select class="fm-select" data-campo="prioridade">${opcoes(PRIORIDADES, m.prioridade)}</select>` : ro(esc((PRIORIDADES.find((r) => r.id === m.prioridade) || {}).label)))}
    ${campo('Quem paga', edit ? `<select class="fm-select" data-campo="responsavel_pagamento">${opcoes(RESPONSAVEIS, m.responsavel_pagamento, { vazio: 'Definir...' })}</select>` : ro(esc((RESPONSAVEIS.find((r) => r.id === m.responsavel_pagamento) || {}).label)))}
    ${campo('Parado', parado)}
    ${comNota ? htmlNotaIcones() : ''}
  </div>${comNota ? htmlNotaLeitura() : ''}</div>`;
}

// Adicionar itens: abre o mesmo seletor de grupos da nova manutenção. Os itens existentes aparecem nas linhas de cada cotação
// (não há uma lista à parte).
function blocoAdicionarItens(ed, seletorAberto) {
  if (!ed.itens || !seletorAberto) return '';
  return `<div class="fm-sec fm-add-itens" data-add-itens><h4>Adicionar itens</h4><div data-seletor-corpo>${htmlSeletor()}</div><div class="fm-pick-resumo" data-pick-resumo></div>
    <div class="fm-acoes" style="justify-content:flex-start;margin-top:12px"><button class="fm-btn primary" type="button" data-acao="itens-confirmar">Adicionar itens</button></div></div>`;
}

export function htmlFormConclusao(m, kmSugerido, notas = []) {
  const soma = somaNotas(notas);
  const pendentes = notas.filter((n) => !n.enviada_em).length;
  const envio = m.responsavel_pagamento !== 'empresa'
    ? `<div class="fm-field full"><div class="fm-aviso">Esta manutenção é paga por ${esc((RESPONSAVEIS.find((r) => r.id === m.responsavel_pagamento) || {}).label || 'outro responsável')}: não vai para NF nem Financeiro.</div></div>`
    : pendentes
      ? `<div class="fm-field full"><div class="fm-mm">${pendentes} nota(s) pendente(s): depois de concluir, anexe o que faltar e use "Enviar para lançamento" (NFs) e "Enviar ao Financeiro" (pagar) na seção "Notas fiscais".</div></div>`
      : '<div class="fm-field full"><div class="fm-aviso">Nenhuma nota fiscal cadastrada. Anexe as notas (NF e comprovante) na linha dos campos desta ficha e depois envie para lançamento e ao Financeiro; dá para fazer depois de concluir.</div></div>';
  return `<div class="fm-form" data-form-acao="conclusao">
    <div class="fm-field"><label>Data do serviço</label><input class="fm-input" type="date" data-a="data_execucao" value="${hojeISO()}"></div>
    <div class="fm-field"><label>Km do veículo</label><input class="fm-input" type="number" min="0" data-a="km_execucao" value="${kmSugerido != null ? Math.round(kmSugerido) : ''}"><small>${kmSugerido != null ? 'Sugerido pela última leitura do rastreador; confira no painel.' : 'Informe o km do painel do veículo.'}</small></div>
    <div class="fm-field"><label>Custo final (R$)</label><input class="fm-input" type="number" step="0.01" min="0" data-a="custo" value="${soma > 0 ? soma : (m.valor_aprovado ?? '')}"><small>${soma > 0 ? `Soma das ${notas.length} nota(s): ${esc(dinheiro(soma))}.` : 'Sem notas cadastradas: usa o valor aprovado.'}</small></div>
    ${envio}
    <div class="fm-field full" style="display:flex;gap:8px"><button class="fm-btn primary" type="button" data-acao="confirmar-conclusao">Concluir manutenção</button><button class="fm-btn ghost" type="button" data-acao="cancelar-form">Cancelar</button></div></div>`;
}

// Veículo parado em execução: mostra quem ainda o tem na Programação (o gestor e a Programação já foram avisados).
function blocoProgramacao(m, afetadas) {
  if (m.status !== 'em_execucao' || !m.veiculo_parado) return '';
  const linhas = (afetadas || []).map((a) => `<li><time>${esc(dataBR(a.data))}</time><span><strong>${esc(a.colaborador || '—')}</strong> · ${esc(a.uso)} · Supervisão ${esc(a.supervisao || '—')}</span></li>`).join('');
  return `<div class="fm-sec"><h4>Programação (veículo parado)</h4>${linhas
    ? `<div class="fm-aviso">Estes lançamentos usam ${esc(m.__placa || 'o veículo')} enquanto ele está na oficina. A Programação e os gestores já foram avisados para trocar o veículo.</div><ul class="fm-tl" style="margin-top:10px">${linhas}</ul>`
    : '<div class="fm-mm">Nenhum lançamento da Programação usa este veículo até a previsão de entrega.</div>'}</div>`;
}

// Histórico da manutenção (janela aberta pelo ícone da linha de ações): do evento mais recente para o mais antigo.
export function htmlModalHistorico(m) {
  const eventos = Array.isArray(m.linha_tempo) ? [...m.linha_tempo].reverse() : [];
  const lista = eventos.map((e) => `<li><time>${esc(dataHoraBR(e.em))}</time><span><strong>${esc(statusInfo(e.para).label)}</strong>${e.de ? ` (de ${esc(statusInfo(e.de).label)})` : ''} · ${esc(e.por || '')}${e.nota ? ` — ${esc(e.nota)}` : ''}</span></li>`).join('');
  return `<div class="fm-orc-cab"><div class="fm-mod-head"><div><h3>Histórico (${eventos.length})</h3><p>${esc(codigoManutencao(m))} · ${esc(m.__placa || '')}${m.__modelo ? ` · ${esc(m.__modelo)}` : ''}</p></div><button class="fm-x" type="button" data-acao="hist-fechar" aria-label="Fechar">✕</button></div></div>
    <div class="fm-nova-corpo">${lista ? `<ul class="fm-tl">${lista}</ul>` : '<div class="fm-mm">Sem eventos.</div>'}</div>
    <div class="fm-nova-rodape"><div class="fm-nova-info"></div><div class="fm-nova-acoes"><button class="fm-btn ghost" type="button" data-acao="hist-fechar">Fechar</button></div></div>`;
}

// `semCabecalho`: ficha dentro do cartão da etapa (sem janela e sem botão de voltar): no lugar do cabeçalho, só a situação e o prontuário.
export function htmlFicha(m, { itens, orcamentos, base, podeAprovar, formAcao, kmSugerido, afetadas = [], financeiro = null, notas = [], semCabecalho = false }) {
  const ed = camposEditaveis(m.status);
  const form = formAcao === 'conclusao' ? htmlFormConclusao(m, kmSugerido, notas) : '';
  const cabecalho = semCabecalho
    ? ''
    : `<div class="fm-mod-head"><div><h3>${esc(codigoManutencao(m))} · ${esc(m.__placa || '')}</h3><p>${esc(m.__modelo || '')}${m.__coordenacao ? ` · ${esc(m.__coordenacao)}` : ''}</p></div><div style="display:flex;gap:8px;align-items:center">${badgeStatus(m.status)}<button class="fm-x" type="button" data-acao="fechar" aria-label="Fechar">✕</button></div></div>`;
  const tituloDados = semCabecalho && STATUS_COM_SELO.has(m.status) ? badgeStatus(m.status) : '';
  return `${cabecalho}
    ${faixaEtapa(m)}
    ${blocoAdicionarItens(ed, !itens.length)}${blocoOrcamentos(m, orcamentos, ed)}${blocoDados(m, ed, tituloDados, ['em_execucao', 'concluida'].includes(m.status) && m.responsavel_pagamento === 'empresa')}${blocoNotas(m, notas, financeiro)}${blocoProgramacao(m, afetadas)}
    ${form}<div data-erros></div>`;
}

// Peças de HTML reexportadas.
export * from './frotas-manutencao-html-base.js?v=20261029-frotas-inst86';
export * from './frotas-manutencao-html-nova.js?v=20261029-frotas-inst86';
export * from './frotas-manutencao-html-orcamento.js?v=20261029-frotas-inst86';
export * from './frotas-manutencao-html-notas.js?v=20261029-frotas-inst86';
