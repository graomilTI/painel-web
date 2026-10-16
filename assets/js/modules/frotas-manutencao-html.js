// Frotas · Manutenção: montagem de HTML (lista, ficha em modal e formulários). Sem acesso ao banco.
import { esc, dataBR, dataHoraBR, dinheiro } from '../core/ui.js';
import { cardFiltro } from './frotas-ui-lista.js?v=20261016-frotas-manut15';
import {
  ETAPAS, FILTROS, NATUREZAS, PRIORIDADES, RESPONSAVEIS, ORIGENS, acoesDisponiveis, camposEditaveis, codigoManutencao,
  descreverIntervalo, numeroOS, orcamentoSelecionado, planosDaCategoria, rotuloVeiculo, statusInfo, valorDaManutencao, veiculosUnicos, TIPOS_NOTA, conferenciaNotas, somaNotas,
} from './frotas-manutencao-regras.js?v=20261016-frotas-manut15';

// Data no horário local (o banco guarda timestamptz em UTC; perto da meia-noite o dia mudaria).
const dataLocal = (ts) => (ts ? new Date(ts).toLocaleDateString('pt-BR') : '—');
const TIPOS_ITEM = [{ id: 'servico', label: 'Serviço' }, { id: 'peca', label: 'Peça' }];
const fmtKm = (v) => (v == null || v === '' ? '—' : `${Number(v).toLocaleString('pt-BR')} km`);
const hojeISO = () => new Date().toISOString().slice(0, 10);

export function opcoes(lista, selecionado, { vazio = null, valor = 'id', rotulo = 'label' } = {}) {
  const base = vazio == null ? '' : `<option value="">${esc(vazio)}</option>`;
  return base + lista.map((o) => `<option value="${esc(o[valor])}"${String(o[valor]) === String(selecionado ?? '') ? ' selected' : ''}>${esc(o[rotulo])}</option>`).join('');
}

export function opcoesCategorias(categorias, selecionado, vazio = 'Selecione...') {
  return `<option value="">${esc(vazio)}</option>` + categorias.filter((c) => c.ativo !== false).map((c) =>
    `<option value="${c.codigo}"${Number(selecionado) === Number(c.codigo) ? ' selected' : ''}>${String(c.codigo).padStart(2, '0')} · ${esc(c.nome)}</option>`).join('');
}

export function opcoesPlanos(planos, categoria, selecionado) {
  const lista = categoria ? planosDaCategoria(planos, categoria) : [];
  return '<option value="">— nenhum —</option>' + lista.map((p) =>
    `<option value="${esc(p.id)}"${p.id === selecionado ? ' selected' : ''}>${esc(p.nome)} (${esc(descreverIntervalo(p))})</option>`).join('');
}

export function badgeStatus(status) {
  const s = statusInfo(status);
  return `<span class="fm-badge ${s.tone}">${esc(s.label)}</span>`;
}

// ---------- tela principal ----------
export function htmlCasca() {
  return `<section class="fm-shell">
    <div class="fm-topo"><div class="fm-head-actions"><button class="fm-btn soft" type="button" data-acao="atualizar">↻ Atualizar</button><button class="fm-btn primary" type="button" data-acao="nova">+ Nova manutenção</button></div></div>
    <div class="fm-kpis" data-kpis></div>
    <div class="fm-card"><div class="fm-body">
      <div class="fm-bar"><div class="fm-search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input class="fm-input" placeholder="Buscar por código, placa, serviço, oficina, motorista, categoria..." data-busca></div>
      <select class="fm-select" data-f-natureza style="width:auto"><option value="">Natureza: todas</option>${NATUREZAS.map((n) => `<option value="${n.id}">${n.label}</option>`).join('')}</select>
      <select class="fm-select" data-f-prioridade style="width:auto"><option value="">Prioridade: todas</option>${PRIORIDADES.map((n) => `<option value="${n.id}">${n.label}</option>`).join('')}</select>
      <span data-chip></span><span class="fm-count" data-contagem>0 manutenção(ões)</span></div>
      <div class="fm-table-wrap"><table class="fm-table"><thead><tr><th>Código</th><th>Veículo</th><th>Serviço</th><th>Natureza</th><th>Etapa</th><th>Valor</th><th>Solicitada</th><th></th></tr></thead><tbody data-linhas></tbody></table></div>
      <div class="fm-nota">Clique numa linha para abrir a ficha. A aprovação exige a permissão "pode aprovar" no módulo Manutenção e respeita a alçada de valor de cada aprovador. Veículo marcado como parado deixa de ser sugerido na Programação enquanto a OS estiver em execução.</div>
    </div></div></section>`;
}

export function htmlKpis(contagens, filtro) {
  return FILTROS.map((f) => cardFiltro({ filtro: f.id, tone: f.tone, icone: f.icone, label: f.rotulo, valor: String(contagens[f.id] ?? 0), dica: f.dica, ativo: f.id === filtro })).join('');
}

export function htmlLinhas(rows, { itensPorManut, orcsPorManut, categorias }) {
  if (!rows.length) return '<tr><td colspan="8" class="fm-empty">Nenhuma manutenção neste filtro. Use "+ Nova manutenção" para registrar um pedido.</td></tr>';
  const nomeCat = new Map(categorias.map((c) => [Number(c.codigo), c.nome]));
  return rows.map((m) => {
    const itens = itensPorManut.get(m.id) || [];
    const cats = [...new Set(itens.map((i) => Number(i.categoria_codigo)))].slice(0, 4)
      .map((c) => `<span class="fm-badge blue" title="${esc(nomeCat.get(c) || '')}">${String(c).padStart(2, '0')} · ${esc((nomeCat.get(c) || '').slice(0, 22))}</span>`).join('');
    const valor = valorDaManutencao(m, orcsPorManut.get(m.id) || []);
    const alta = m.prioridade === 'alta' || m.prioridade === 'urgente' ? `<span class="fm-badge ${m.prioridade === 'urgente' ? 'red' : 'amber'}">${m.prioridade === 'urgente' ? 'Urgente' : 'Alta'}</span>` : '';
    const parado = m.veiculo_parado ? '<span class="fm-badge red" title="Veículo parado enquanto a OS estiver em execução">Parado</span>' : '';
    return `<tr class="fm-linha" data-abrir="${esc(m.id)}">
      <td><strong>${esc(codigoManutencao(m))}</strong>${m.os_numero ? `<span class="fm-mm">${esc(m.os_numero)}</span>` : ''}</td>
      <td><strong>${esc(m.__placa || '—')}</strong><span class="fm-mm">${esc(m.__modelo || '')}${m.__coordenacao ? ` · ${esc(m.__coordenacao)}` : ''}</span></td>
      <td>${esc((m.descricao || '').slice(0, 90))}${(m.descricao || '').length > 90 ? '…' : ''}<div class="fm-chips">${cats}</div></td>
      <td>${m.natureza ? `<span class="fm-badge ${m.natureza === 'preventiva' ? 'green' : 'amber'}">${m.natureza === 'preventiva' ? 'Preventiva' : 'Corretiva'}</span>` : '<span class="fm-mm">a definir</span>'}</td>
      <td>${badgeStatus(m.status)} ${alta} ${parado}</td>
      <td>${valor ? `${dinheiro(valor.valor)}<span class="fm-mm">${esc(valor.rotulo)}</span>` : '—'}</td>
      <td>${dataLocal(m.solicitado_em)}<span class="fm-mm">${esc(m.solicitante_nome || '')}</span></td>
      <td><button class="fm-btn ghost fm-mini" type="button" data-abrir="${esc(m.id)}">Abrir</button></td></tr>`;
  }).join('');
}

// ---------- nova solicitação ----------
// Linha de entrada: sempre presente; o "+" confirma o item e ele vai para a lista logo abaixo.
export function htmlEntradaItem(base) {
  return `<div class="fm-item" data-novo-entrada>
    <select class="fm-select" data-n="categoria_codigo">${opcoesCategorias(base.categorias, null)}</select>
    <select class="fm-select" data-n="natureza">${opcoes(NATUREZAS, '', { vazio: '— definir depois —' })}</select>
    <input class="fm-input" data-n="descricao" placeholder="Serviço / peça (opcional)">
    <select class="fm-select" data-n="plano_id">${opcoesPlanos(base.planos, null)}</select>
    <select class="fm-select" data-n="tipo_item" title="Peça ou serviço: define a categoria da nota fiscal no GRM">${opcoes(TIPOS_ITEM, 'servico')}</select>
    <button class="fm-ic" type="button" data-acao="novo-item-add" title="Adicionar item" aria-label="Adicionar item" style="font-size:20px;font-weight:900;color:#86efac;border-color:rgba(34,197,94,.4);background:rgba(34,197,94,.14)">+</button></div>`;
}

// Item já adicionado (lista abaixo da entrada): texto fixo e "x" para remover. Os dados ficam em data-item-json.
export function htmlItemAdicionado(base, item) {
  const cat = base.categorias.find((c) => Number(c.codigo) === Number(item.categoria_codigo));
  const plano = base.planos.find((p) => p.id === item.plano_id);
  const natureza = (NATUREZAS.find((n) => n.id === item.natureza) || {}).label || 'a definir';
  const tipo = (TIPOS_ITEM.find((t) => t.id === (item.tipo_item || 'servico')) || {}).label;
  return `<div class="fm-item fm-item-lista" data-novo-item data-item-json="${esc(JSON.stringify(item))}">
    <div class="fm-ro">${String(item.categoria_codigo).padStart(2, '0')} · ${esc(cat?.nome || '')}</div>
    <div class="fm-ro">${esc(natureza)}</div>
    <div class="fm-ro">${esc(item.descricao || '—')}</div>
    <div class="fm-ro">${esc(plano?.nome || '—')}</div>
    <div class="fm-ro">${esc(tipo)}</div>
    <button class="fm-ic danger" type="button" data-acao="novo-item-remover" title="Remover item" aria-label="Remover item">✕</button></div>`;
}

export function htmlFormNova(base, preset = {}) {
  const veiculo = base.veiculos.find((v) => v.id === preset.veiculo_id);
  const lista = veiculosUnicos(base.veiculos.filter((v) => ['ATIVO', 'MANUTENCAO'].includes(String(v.status || '').toUpperCase()) || v.id === preset.veiculo_id));
  const itens = preset.itens || [];
  return `<div class="fm-mod-head"><div><h3>Nova manutenção</h3><p>Registre o pedido recebido (por exemplo, pelo WhatsApp): veículo, quem pediu e o problema, classificado pelas categorias do guia. O orçamento e a aprovação vêm depois.</p></div><button class="fm-x" type="button" data-acao="fechar" aria-label="Fechar">✕</button></div>
    <div class="fm-form" style="margin-top:14px">
      <div class="fm-field" style="grid-column:span 2"><label>Veículo</label><input class="fm-input" list="fmListaVeiculos" data-n-veiculo placeholder="Digite a placa..." value="${esc(veiculo ? `${veiculo.placa} · ${rotuloVeiculo(veiculo)}` : '')}"><datalist id="fmListaVeiculos">${lista.map((v) => `<option value="${esc(v.placa)} · ${esc(rotuloVeiculo(v))}"></option>`).join('')}</datalist></div>
      <div class="fm-field"><label>Prioridade</label><select class="fm-select" data-n-prioridade>${opcoes(PRIORIDADES, preset.prioridade || 'normal')}</select></div>
      <div class="fm-field"><label>&nbsp;</label><label class="fm-check"><input type="checkbox" data-n-parado${preset.veiculo_parado ? ' checked' : ''}> Veículo parado</label></div>
      <div class="fm-field" style="grid-column:span 2"><label>Quem pediu</label><input class="fm-input" data-n-solicitante data-auto="${preset.solicitante_nome ? '0' : '1'}" list="fmListaColaboradores" autocomplete="off" maxlength="120" placeholder="Condutor do veículo ou outra pessoa (digite para buscar)" value="${esc(preset.solicitante_nome || veiculo?.motorista_atual || '')}"><datalist id="fmListaColaboradores">${(base.colaboradores || []).map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist><small>Vem preenchido com o condutor do veículo; troque se foi outra pessoa. Se ficar vazio, vale o seu nome.</small></div>
      <div class="fm-field full"><label>Problema / serviço solicitado</label><textarea data-n-descricao placeholder="Ex.: barulho ao frear, revisão dos 20.000 km...">${esc(preset.descricao || '')}</textarea></div>
    </div>
    <div class="fm-sec"><h4>Itens (categoria do guia)</h4>
      <div class="fm-item-cab"><span>Categoria</span><span>Natureza</span><span>Descrição</span><span>Plano do guia</span><span>Tipo</span><span></span></div>
      ${htmlEntradaItem(base)}
      <div class="fm-itens" data-novo-itens style="margin-top:10px">${itens.map((it) => htmlItemAdicionado(base, it)).join('')}</div>
      <div class="fm-nota">Escolha a categoria e clique em <strong>+</strong> para adicionar. É preciso ao menos um item; vários itens ficam na lista acima e o <strong>✕</strong> remove. Preventiva = serviço programado por km/tempo; corretiva = reparo após falha ou desgaste (a natureza pode ficar para depois, mas é obrigatória para aprovar).</div></div>
    <div data-erros></div>
    <div class="fm-acoes"><button class="fm-btn ghost" type="button" data-acao="fechar">Cancelar</button><button class="fm-btn primary" type="button" data-acao="novo-salvar">Registrar manutenção</button></div>`;
}

// ---------- ficha ----------
function passoAPasso(m) {
  const idxAtual = ETAPAS.indexOf(m.status);
  const reprovada = m.status === 'reprovada';
  const cancelada = m.status === 'cancelada';
  return `<div class="fm-steps">${ETAPAS.map((e, i) => {
    const info = statusInfo(e);
    let classe = '';
    if (cancelada) classe = i === 0 ? 'feito' : '';
    else if (reprovada) classe = i < 2 ? 'feito' : i === 2 ? 'erro' : '';
    else if (i < idxAtual) classe = 'feito';
    else if (i === idxAtual) classe = e === 'concluida' ? 'feito atual' : 'atual';
    return `<div class="fm-step ${classe}">${i + 1}. ${esc(info.curto)}</div>`;
  }).join('')}</div>${reprovada ? `<div class="fm-aviso" style="border-color:rgba(239,68,68,.4);background:rgba(239,68,68,.1);color:#fecaca">Reprovada: ${esc(m.motivo_status || '')}</div>` : ''}${cancelada ? `<div class="fm-aviso" style="border-color:rgba(239,68,68,.4);background:rgba(239,68,68,.1);color:#fecaca">Cancelada: ${esc(m.motivo_status || '')}</div>` : ''}`;
}

function blocoDados(m, base, ed) {
  const campo = (rotulo, conteudo, extra = '') => `<div class="fm-field ${extra}"><label>${rotulo}</label>${conteudo}</div>`;
  const ro = (valor, sub = '') => `<div class="fm-ro">${valor || '—'}${sub ? `<small>${sub}</small>` : ''}</div>`;
  const edit = ed.cabecalho;
  return `<div class="fm-sec"><h4>Dados da manutenção</h4><div class="fm-grid2">
    ${campo('Veículo', ro(`<strong>${esc(m.__placa || '—')}</strong>`, esc(`${m.__modelo || ''}${m.__coordenacao ? ' · ' + m.__coordenacao : ''}`)))}
    ${campo('Motorista', ro(esc(m.motorista_nome)))}
    ${campo('Solicitante', ro(esc(m.solicitante_nome), esc(dataHoraBR(m.solicitado_em))))}
    ${campo('Origem', ro(esc(ORIGENS[m.origem] || m.origem)))}
    ${campo('Natureza', edit ? `<select class="fm-select" data-campo="natureza">${opcoes(NATUREZAS, m.natureza, { vazio: 'Definir...' })}</select>` : ro(esc(m.natureza === 'preventiva' ? 'Preventiva' : m.natureza === 'corretiva' ? 'Corretiva' : '')))}
    ${campo('Quem paga', edit ? `<select class="fm-select" data-campo="responsavel_pagamento">${opcoes(RESPONSAVEIS, m.responsavel_pagamento, { vazio: 'Definir...' })}</select>` : ro(esc((RESPONSAVEIS.find((r) => r.id === m.responsavel_pagamento) || {}).label)))}
    ${campo('Prioridade', edit ? `<select class="fm-select" data-campo="prioridade">${opcoes(PRIORIDADES, m.prioridade)}</select>` : ro(esc((PRIORIDADES.find((r) => r.id === m.prioridade) || {}).label)))}
    ${campo('Km na solicitação', ro(esc(fmtKm(m.km_solicitacao))))}
    ${campo('Veículo parado', edit ? `<label class="fm-check"><input type="checkbox" data-campo="veiculo_parado"${m.veiculo_parado ? ' checked' : ''}> Parado na oficina</label>` : ro(m.veiculo_parado ? 'Sim' : 'Não'))}
    ${campo('Previsão de entrega', edit ? `<input class="fm-input" type="date" data-campo="previsao_entrega" value="${esc(m.previsao_entrega || '')}">` : ro(esc(m.previsao_entrega ? dataBR(m.previsao_entrega) : '')))}
    ${campo('Entrada na oficina', ro(esc(m.entrada_oficina_em ? dataHoraBR(m.entrada_oficina_em) : '')))}
    ${campo('Ordem de serviço', ro(esc(numeroOS(m) && m.os_emitida_em ? numeroOS(m) : '')))}
    ${campo('Problema / serviço', edit ? `<textarea data-campo="descricao">${esc(m.descricao || '')}</textarea>` : ro(esc(m.descricao)), 'full')}
    ${campo('Diagnóstico da oficina', edit ? `<textarea data-campo="diagnostico" placeholder="O que a oficina encontrou">${esc(m.diagnostico || '')}</textarea>` : ro(esc(m.diagnostico)), 'full')}
  </div></div>`;
}

function blocoItens(m, itens, base, ed) {
  const linhas = itens.map((it) => {
    if (!ed.itens) {
      const cat = base.categorias.find((c) => Number(c.codigo) === Number(it.categoria_codigo));
      const plano = base.planos.find((p) => p.id === it.plano_id);
      return `<div class="fm-item"><div class="fm-ro">${String(it.categoria_codigo).padStart(2, '0')} · ${esc(cat?.nome || '')}</div><div class="fm-ro">${esc(it.natureza || m.natureza || '—')}</div><div class="fm-ro">${esc(it.descricao || '')}</div><div class="fm-ro">${esc(plano?.nome || '—')}</div><div class="fm-ro">${it.tipo_item === 'peca' ? 'Peça' : 'Serviço'}${it.valor != null ? ` · ${dinheiro(it.valor)}` : ''}</div><span></span></div>`;
    }
    return `<div class="fm-item" data-item-id="${esc(it.id)}">
      <select class="fm-select" data-item="categoria_codigo">${opcoesCategorias(base.categorias, it.categoria_codigo)}</select>
      <select class="fm-select" data-item="natureza">${opcoes(NATUREZAS, it.natureza, { vazio: m.natureza ? `Igual à ordem (${m.natureza})` : '— herda da ordem —' })}</select>
      <input class="fm-input" data-item="descricao" value="${esc(it.descricao || '')}">
      <select class="fm-select" data-item="plano_id">${opcoesPlanos(base.planos, it.categoria_codigo, it.plano_id)}</select>
      <select class="fm-select" data-item="tipo_item" title="Peça ou serviço: define a categoria da nota fiscal no GRM">${opcoes(TIPOS_ITEM, it.tipo_item || 'servico')}</select>
      <button class="fm-ic danger" type="button" data-acao="item-remover" data-id="${esc(it.id)}" title="Remover item" aria-label="Remover item">✕</button></div>`;
  }).join('');
  const novo = ed.itens ? `<div class="fm-form" data-item-novo style="grid-template-columns:2fr 1fr 2fr 1.3fr 0.8fr auto"><select class="fm-select" data-nv="categoria_codigo">${opcoesCategorias(base.categorias, null, 'Categoria do guia...')}</select><select class="fm-select" data-nv="natureza">${opcoes(NATUREZAS, '', { vazio: 'Natureza...' })}</select><input class="fm-input" data-nv="descricao" placeholder="Serviço / peça"><select class="fm-select" data-nv="plano_id">${opcoesPlanos(base.planos, null)}</select><select class="fm-select" data-nv="tipo_item" title="Peça ou serviço">${opcoes(TIPOS_ITEM, 'servico')}</select><button class="fm-btn soft" type="button" data-acao="item-adicionar">+ Adicionar</button></div>` : '';
  return `<div class="fm-sec"><h4>Itens do serviço (${itens.length})</h4>
    ${itens.length ? '<div class="fm-item-cab"><span>Categoria</span><span>Natureza</span><span>Descrição</span><span>Plano do guia</span><span>Tipo</span><span></span></div>' : '<div class="fm-mm">Nenhum item ainda. Informe ao menos um para aprovar.</div>'}
    <div class="fm-itens">${linhas}</div>${novo}</div>`;
}

export function htmlFormOrcamento(base, orc = {}) {
  return `<div class="fm-form" data-orc-form data-orc-id="${esc(orc.id || '')}">
    <div class="fm-field"><label>Oficina cadastrada</label><select class="fm-select" data-o="oficina_id">${opcoes(base.oficinas.filter((o) => o.ativo !== false), orc.oficina_id, { vazio: '— outra (digitar) —', rotulo: 'nome' })}</select></div>
    <div class="fm-field" style="grid-column:span 2"><label>Oficina / fornecedor</label><input class="fm-input" data-o="fornecedor" value="${esc(orc.fornecedor || '')}"></div>
    <div class="fm-field"><label>Contato</label><input class="fm-input" data-o="fornecedor_contato" value="${esc(orc.fornecedor_contato || '')}"></div>
    <div class="fm-field"><label>Peças (R$)</label><input class="fm-input" type="number" step="0.01" min="0" data-o="valor_pecas" value="${orc.valor_pecas ?? ''}"></div>
    <div class="fm-field"><label>Mão de obra (R$)</label><input class="fm-input" type="number" step="0.01" min="0" data-o="valor_mao_obra" value="${orc.valor_mao_obra ?? ''}"></div>
    <div class="fm-field"><label>Valor total (R$)</label><input class="fm-input" type="number" step="0.01" min="0" data-o="valor_total" value="${orc.valor_total ?? ''}"><small>Se ficar vazio, soma peças + mão de obra.</small></div>
    <div class="fm-field"><label>Prazo (dias)</label><input class="fm-input" type="number" min="0" data-o="prazo_dias" value="${orc.prazo_dias ?? ''}"></div>
    <div class="fm-field"><label>Validade</label><input class="fm-input" type="date" data-o="validade" value="${esc(orc.validade || '')}"></div>
    <div class="fm-field"><label>Pagamento</label><input class="fm-input" data-o="condicoes_pagamento" value="${esc(orc.condicoes_pagamento || '')}"></div>
    <div class="fm-field"><label>Garantia</label><input class="fm-input" data-o="garantia" value="${esc(orc.garantia || '')}"></div>
    <div class="fm-field"><label>Arquivo do orçamento</label><input class="fm-input" type="file" accept=".pdf,.jpg,.jpeg,.png" data-o-arquivo></div>
    <div class="fm-field full"><label>Observações</label><textarea data-o="observacoes">${esc(orc.observacoes || '')}</textarea></div>
    <div class="fm-field full" style="display:flex;gap:8px"><button class="fm-btn primary" type="button" data-acao="orc-salvar">${orc.id ? 'Salvar orçamento' : 'Adicionar orçamento'}</button><button class="fm-btn ghost" type="button" data-acao="orc-cancelar">Cancelar</button></div></div>`;
}

function blocoOrcamentos(m, orcs, base, ed, formAberto) {
  const sel = orcamentoSelecionado(orcs);
  const cards = orcs.map((o) => `<div class="fm-orc${o.selecionado ? ' sel' : ''}">
      <div><strong>${esc(o.fornecedor)}</strong>${o.selecionado ? ' <span class="fm-badge green">Escolhido</span>' : ''}</div>
      <div class="v">${dinheiro(o.valor_total)}</div>
      <div class="fm-mm">${o.valor_pecas != null ? `Peças ${dinheiro(o.valor_pecas)}` : ''}${o.valor_mao_obra != null ? ` · Mão de obra ${dinheiro(o.valor_mao_obra)}` : ''}</div>
      <div class="fm-mm">${o.prazo_dias != null ? `Prazo ${o.prazo_dias} dia(s)` : ''}${o.validade ? ` · Validade ${dataBR(o.validade)}` : ''}${o.garantia ? ` · Garantia ${esc(o.garantia)}` : ''}</div>
      ${o.condicoes_pagamento ? `<div class="fm-mm">Pagamento: ${esc(o.condicoes_pagamento)}</div>` : ''}
      ${o.anexo_url ? `<a class="fm-badge blue" href="${esc(o.anexo_url)}" target="_blank" rel="noopener">Ver arquivo</a>` : ''}
      ${ed.orcamentos ? `<div class="fm-orc-acoes">${o.selecionado ? '' : `<button class="fm-btn soft fm-mini" type="button" data-acao="orc-escolher" data-id="${esc(o.id)}">Escolher</button>`}<button class="fm-btn ghost fm-mini" type="button" data-acao="orc-editar" data-id="${esc(o.id)}">Editar</button><button class="fm-btn danger fm-mini" type="button" data-acao="orc-remover" data-id="${esc(o.id)}">Remover</button></div>` : ''}</div>`).join('');
  const aviso = m.sem_orcamento ? '<div class="fm-aviso">Aprovada sem orçamento (valor estimado informado pelo aprovador).</div>' : '';
  return `<div class="fm-sec"><h4>Orçamentos (${orcs.length}) ${ed.orcamentos ? '<button class="fm-btn ghost fm-mini" type="button" data-acao="orc-novo">+ Orçamento</button>' : ''}</h4>
    ${orcs.length ? `<div class="fm-orcs">${cards}</div>` : '<div class="fm-mm">Nenhum orçamento cadastrado.</div>'}
    ${orcs.length > 1 && !sel && ed.orcamentos ? '<div class="fm-aviso">Escolha o orçamento que será levado para aprovação.</div>' : ''}${aviso}
    ${formAberto ? htmlFormOrcamento(base, formAberto === true ? {} : formAberto) : ''}</div>`;
}

function blocoExecucao(m) {
  if (!['aprovada', 'em_execucao', 'concluida'].includes(m.status) && !m.aprovado_em) return '';
  const ro = (valor, sub = '') => `<div class="fm-ro">${valor || '—'}${sub ? `<small>${sub}</small>` : ''}</div>`;
  const campo = (rotulo, conteudo) => `<div class="fm-field"><label>${rotulo}</label>${conteudo}</div>`;
  return `<div class="fm-sec"><h4>Aprovação e execução</h4><div class="fm-grid2">
    ${campo('Valor aprovado', ro(m.valor_aprovado != null ? dinheiro(m.valor_aprovado) : '', esc(m.oficina || '')))}
    ${campo('Aprovado por', ro(esc(m.aprovado_por_nome), esc(m.aprovado_em ? dataHoraBR(m.aprovado_em) : '')))}
    ${campo('Concluída em', ro(esc(m.concluida_em ? dataHoraBR(m.concluida_em) : ''), esc(m.concluida_por_nome || '')))}
    ${campo('Serviço feito em', ro(esc(m.data_execucao ? dataBR(m.data_execucao) : ''), esc(fmtKm(m.km_execucao))))}
    ${campo('Custo final', ro(m.custo != null ? dinheiro(m.custo) : ''))}
    ${campo('Nota fiscal', ro(esc(m.nf_numero), m.anexo_url ? `<a href="${esc(m.anexo_url)}" target="_blank" rel="noopener" style="color:#86efac">Ver anexo</a>` : ''))}
  </div></div>`;
}

export function htmlFormSemOrcamento() {
  return `<div class="fm-form" data-form-acao="sem_orcamento"><div class="fm-field" style="grid-column:span 2"><label>Valor estimado aprovado (R$)</label><input class="fm-input" type="number" step="0.01" min="0" data-a="valor_aprovado"><small>Use quando o serviço não precisa de orçamento (ex.: troca de óleo de rotina).</small></div>
    <div class="fm-field full" style="display:flex;gap:8px"><button class="fm-btn primary" type="button" data-acao="confirmar-sem-orcamento">Aprovar sem orçamento</button><button class="fm-btn ghost" type="button" data-acao="cancelar-form">Cancelar</button></div></div>`;
}

export function htmlFormConclusao(m, kmSugerido, notas = []) {
  const soma = somaNotas(notas);
  const pendentes = notas.filter((n) => !n.enviada_em).length;
  const envio = m.responsavel_pagamento !== 'empresa'
    ? `<div class="fm-field full"><div class="fm-aviso">Esta manutenção é paga por ${esc((RESPONSAVEIS.find((r) => r.id === m.responsavel_pagamento) || {}).label || 'outro responsável')}: não vai para NF nem Financeiro.</div></div>`
    : pendentes
      ? `<div class="fm-field full"><label class="fm-check"><input type="checkbox" data-a-enviar checked> Enviar ${pendentes} nota(s) ao GRM e ao Financeiro ao concluir</label><small>Cada nota vira um lançamento no GRM e um pagamento no Financeiro.</small></div>`
      : '<div class="fm-field full"><div class="fm-aviso">Nenhuma nota fiscal cadastrada. Adicione as notas na seção "Notas fiscais" desta ficha para enviar ao GRM e ao Financeiro; dá para fazer depois de concluir.</div></div>';
  return `<div class="fm-form" data-form-acao="conclusao">
    <div class="fm-field"><label>Data do serviço</label><input class="fm-input" type="date" data-a="data_execucao" value="${hojeISO()}"></div>
    <div class="fm-field"><label>Km do veículo</label><input class="fm-input" type="number" min="0" data-a="km_execucao" value="${kmSugerido != null ? Math.round(kmSugerido) : ''}"><small>${kmSugerido != null ? 'Sugerido pela última leitura do rastreador; confira no painel.' : 'Informe o km do painel do veículo.'}</small></div>
    <div class="fm-field"><label>Custo final (R$)</label><input class="fm-input" type="number" step="0.01" min="0" data-a="custo" value="${soma > 0 ? soma : (m.valor_aprovado ?? '')}"><small>${soma > 0 ? `Soma das ${notas.length} nota(s): ${esc(dinheiro(soma))}.` : 'Sem notas cadastradas: usa o valor aprovado.'}</small></div>
    ${envio}
    <div class="fm-field full" style="display:flex;gap:8px"><button class="fm-btn primary" type="button" data-acao="confirmar-conclusao">Concluir manutenção</button><button class="fm-btn ghost" type="button" data-acao="cancelar-form">Cancelar</button></div></div>`;
}

const NF_ROTULO = {
  NOVO: ['Na fila do GRM', 'amber'], PROCESSANDO: ['Sendo lançada no GRM', 'amber'], VALIDADO: ['Validada, aguardando lançar', 'amber'], DRY_RUN_OK: ['Validada', 'amber'],
  LANCADO: ['Lançada no GRM', 'green'], ERRO: ['Erro no GRM', 'red'], AGUARDANDO_DADOS: ['Faltam dados', 'red'], AGUARDANDO_CLASSIFICACAO: ['Falta classificar', 'red'],
  DUPLICADO: ['Duplicada', 'red'], CANCELADO: ['Cancelada', 'red'],
};
const PG_ROTULO = { PENDENTE: ['Aguardando o Financeiro', 'amber'], EM_ANALISE: ['Em análise', 'amber'], APROVADO: ['Aprovado', 'blue'], AGENDADO: ['Agendado', 'blue'], PAGO: ['Pago', 'green'], RECUSADO: ['Recusado', 'red'], CANCELADO: ['Cancelado', 'red'] };

// Notas fiscais (várias por manutenção: peças, serviço, mais de uma de cada). Cada nota vira um lançamento no GRM
// e um pagamento no Financeiro; o status de cada uma volta para cá.
export function htmlEntradaNota(base) {
  return `<div class="fm-nota-linha" data-nota-entrada>
    <select class="fm-select" data-nt="tipo" title="Peças, serviço ou os dois: define a categoria da nota no GRM">${opcoes(TIPOS_NOTA, 'servico')}</select>
    <input class="fm-input" data-nt="fornecedor" list="fmListaFornecedores" placeholder="Quem emitiu (oficina ou loja de peças)" maxlength="120">
    <datalist id="fmListaFornecedores">${base.oficinas.filter((o) => o.ativo !== false).map((o) => `<option value="${esc(o.nome)}"></option>`).join('')}</datalist>
    <input class="fm-input" data-nt="numero" placeholder="Nº da NF" maxlength="60">
    <input class="fm-input" type="number" step="0.01" min="0" data-nt="valor" placeholder="Valor (R$)">
    <input class="fm-input" type="file" accept=".pdf,.xml,.jpg,.jpeg,.png" data-nt-arquivo title="Arquivo da nota fiscal">
    <button class="fm-ic" type="button" data-acao="nota-add" title="Adicionar nota" aria-label="Adicionar nota" style="font-size:20px;font-weight:900;color:#86efac;border-color:rgba(34,197,94,.4);background:rgba(34,197,94,.14)">+</button></div>`;
}

function blocoNotas(m, notas, fin, base) {
  if (!['em_execucao', 'concluida'].includes(m.status)) return '';
  const resp = (RESPONSAVEIS.find((r) => r.id === m.responsavel_pagamento) || {}).label;
  if (m.responsavel_pagamento !== 'empresa') {
    return `<div class="fm-sec"><h4>Notas fiscais</h4><div class="fm-mm">Esta manutenção é paga por ${esc(resp || 'outro responsável')}: não vai para a nota fiscal do GRM nem para o Financeiro.</div></div>`;
  }
  const selo = (mapa, chave) => { const [rotulo, tom] = mapa[chave] || [chave || '—', 'blue']; return `<span class="fm-badge ${tom}">${esc(rotulo)}</span>`; };
  const statusPorNota = new Map(((fin && fin.notas) || []).map((x) => [x.nota_id, x]));
  const linhas = notas.map((n) => {
    const st = statusPorNota.get(n.id);
    const situacao = !n.enviada_em
      ? '<span class="fm-badge">Não enviada</span>'
      : !st ? '<span class="fm-badge amber">Enviada</span>'
        : `${selo(NF_ROTULO, st.nf && st.nf.status)} ${selo(PG_ROTULO, st.pagamento && st.pagamento.status)}${st.nf && st.nf.grm_codigo ? `<span class="fm-mm">GRM ${esc(st.nf.grm_codigo)}${st.nf.categoria ? ` · ${esc(st.nf.categoria)}` : ''}</span>` : ''}${st.nf && st.nf.erro ? `<span class="fm-mm" style="color:#fecaca">${esc(st.nf.erro)}</span>` : ''}${st.pagamento && st.pagamento.comprovante_url ? `<span class="fm-mm"><a href="${esc(st.pagamento.comprovante_url)}" target="_blank" rel="noopener" style="color:#86efac">Ver comprovante</a></span>` : ''}`;
    return `<div class="fm-nota-linha fm-nota-item">
      <div class="fm-ro">${esc((TIPOS_NOTA.find((t) => t.id === n.tipo) || {}).label || n.tipo)}</div>
      <div class="fm-ro">${esc(n.fornecedor || '—')}</div>
      <div class="fm-ro">${esc(n.numero || '—')}</div>
      <div class="fm-ro">${esc(dinheiro(n.valor))}</div>
      <div class="fm-ro">${n.anexo_url ? `<a href="${esc(n.anexo_url)}" target="_blank" rel="noopener" style="color:#86efac">Ver arquivo</a>` : '—'}${situacao ? `<small>${situacao}</small>` : ''}</div>
      ${n.enviada_em ? '<span></span>' : `<button class="fm-ic danger" type="button" data-acao="nota-remover" data-id="${esc(n.id)}" title="Remover nota" aria-label="Remover nota">✕</button>`}</div>`;
  }).join('');
  const conf = conferenciaNotas(notas, m.status === 'concluida' ? m.custo : null);
  const resumo = notas.length
    ? `<div class="fm-mm" style="margin-top:8px">Soma das ${notas.length} nota(s): <strong>${esc(dinheiro(conf.soma))}</strong>${m.status === 'concluida' && m.custo != null ? ` · Custo final: <strong>${esc(dinheiro(m.custo))}</strong>` : ''}</div>${conf.situacao === 'acima' ? '<div class="fm-aviso" style="border-color:rgba(239,68,68,.4);background:rgba(239,68,68,.1);color:#fecaca">A soma das notas passa do custo final: o envio é recusado até acertar.</div>' : conf.situacao === 'abaixo' ? `<div class="fm-mm">O custo final é ${esc(dinheiro(conf.diferenca))} maior que as notas (valor sem nota, por exemplo).</div>` : ''}`
    : '<div class="fm-mm">Nenhuma nota ainda. Adicione cada nota fiscal (peças, serviço, ou várias de cada) com o arquivo e o valor.</div>';
  const pendentes = notas.filter((n) => !n.enviada_em).length;
  const enviar = m.status === 'concluida' && pendentes
    ? `<div class="fm-acoes" style="justify-content:flex-start"><button class="fm-btn primary" type="button" data-acao="notas-enviar">Enviar ${pendentes} nota(s) ao GRM e ao Financeiro</button></div>`
    : (m.status === 'em_execucao' && notas.length ? '<div class="fm-mm" style="margin-top:6px">As notas são enviadas ao GRM e ao Financeiro quando a manutenção for concluída.</div>' : '');
  return `<div class="fm-sec"><h4>Notas fiscais (${notas.length})</h4>
    <div class="fm-nota-cab"><span>Tipo</span><span>Emitida por</span><span>Nº</span><span>Valor</span><span>Arquivo e situação</span><span></span></div>
    ${htmlEntradaNota(base)}
    <div class="fm-itens" style="margin-top:10px">${linhas}</div>${resumo}${enviar}</div>`;
}

// Veículo parado em execução: mostra quem ainda o tem na Programação (o gestor e a Programação já foram avisados).
function blocoProgramacao(m, afetadas) {
  if (m.status !== 'em_execucao' || !m.veiculo_parado) return '';
  const linhas = (afetadas || []).map((a) => `<li><time>${esc(dataBR(a.data))}</time><span><strong>${esc(a.colaborador || '—')}</strong> · ${esc(a.uso)} · Supervisão ${esc(a.supervisao || '—')}</span></li>`).join('');
  return `<div class="fm-sec"><h4>Programação (veículo parado)</h4>${linhas
    ? `<div class="fm-aviso">Estes lançamentos usam ${esc(m.__placa || 'o veículo')} enquanto ele está na oficina. A Programação e os gestores já foram avisados para trocar o veículo.</div><ul class="fm-tl" style="margin-top:10px">${linhas}</ul>`
    : '<div class="fm-mm">Nenhum lançamento da Programação usa este veículo até a previsão de entrega.</div>'}</div>`;
}

function blocoLinhaTempo(m) {
  const eventos = Array.isArray(m.linha_tempo) ? [...m.linha_tempo].reverse() : [];
  if (!eventos.length) return '';
  return `<div class="fm-sec"><h4>Histórico</h4><ul class="fm-tl">${eventos.map((e) => `<li><time>${esc(dataHoraBR(e.em))}</time><span><strong>${esc(statusInfo(e.para).label)}</strong>${e.de ? ` (de ${esc(statusInfo(e.de).label)})` : ''} · ${esc(e.por || '')}${e.nota ? ` — ${esc(e.nota)}` : ''}</span></li>`).join('')}</ul></div>`;
}

export function htmlFicha(m, { itens, orcamentos, base, podeAprovar, orcForm, formAcao, kmSugerido, afetadas = [], financeiro = null, notas = [] }) {
  const ed = camposEditaveis(m.status);
  const acoes = acoesDisponiveis(m, { podeAprovar, itens, orcamentos });
  const botoes = acoes.map((a) => `<button class="fm-btn ${a.tom}" type="button" data-acao="etapa" data-etapa="${a.id}"${a.bloqueio ? ` disabled title="${esc(a.bloqueio)}"` : ''}>${esc(a.rotulo)}</button>`).join('');
  const dica = m.status === 'em_aprovacao' && !podeAprovar ? 'Aguardando decisão de um aprovador.' : (acoes.find((a) => a.bloqueio && a.tom === 'primary')?.bloqueio || '');
  const form = formAcao === 'sem_orcamento' ? htmlFormSemOrcamento() : formAcao === 'conclusao' ? htmlFormConclusao(m, kmSugerido, notas) : '';
  return `<div class="fm-mod-head"><div><h3>${esc(codigoManutencao(m))} · ${esc(m.__placa || '')}</h3><p>${esc(m.__modelo || '')}${m.__coordenacao ? ` · ${esc(m.__coordenacao)}` : ''}</p></div><div style="display:flex;gap:8px;align-items:center">${badgeStatus(m.status)}<button class="fm-x" type="button" data-acao="fechar" aria-label="Fechar">✕</button></div></div>
    ${passoAPasso(m)}
    ${blocoDados(m, base, ed)}${blocoItens(m, itens, base, ed)}${blocoOrcamentos(m, orcamentos, base, ed, orcForm)}${blocoExecucao(m)}${blocoNotas(m, notas, financeiro, base)}${blocoProgramacao(m, afetadas)}${blocoLinhaTempo(m)}
    <div class="fm-acoes">${dica ? `<span class="fm-dica">${esc(dica)}</span>` : ''}${botoes}</div>${form}<div data-erros></div>`;
}

export function htmlErros(erros) {
  return erros.length ? `<ul class="fm-erros">${erros.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : '';
}
