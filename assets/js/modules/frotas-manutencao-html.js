// Frotas · Manutenção: montagem de HTML (lista, ficha em modal e formulários). Sem acesso ao banco.
import { esc, dataBR, dataHoraBR, dinheiro } from '../core/ui.js';
import { htmlOpcoesUf, htmlOpcoesCidade } from './frotas-manutencao-cidades.js?v=20261029-frotas-manut63';
import { htmlSeletor } from './frotas-manutencao-seletor.js?v=20261029-frotas-manut63';
import {
  itensDoGrupo, tipoDoComponente, grupoDaCategoria, nomeDoGrupoDaCategoria, NATUREZAS, PRIORIDADES, RESPONSAVEIS, ORIGENS, camposEditaveis, codigoManutencao,
  descreverIntervalo, linhasIniciais, norm, numeroOS, somarLinhas, totalDoOrcamento, compraDividida, planosDaCategoria, proximoPasso, rotuloVeiculo, statusInfo, veiculosUnicos, TIPOS_NOTA, conferenciaNotas, somaNotas,
} from './frotas-manutencao-regras.js?v=20261029-frotas-manut63';

// Data no horário local (o banco guarda timestamptz em UTC; perto da meia-noite o dia mudaria).
const TIPOS_ITEM = [{ id: 'servico', label: 'Serviço' }, { id: 'peca', label: 'Peça' }];
const fmtKm = (v) => (v == null || v === '' ? '—' : `${Number(v).toLocaleString('pt-BR')} km`);
const hojeISO = () => new Date().toISOString().slice(0, 10);

export function opcoes(lista, selecionado, { vazio = null, valor = 'id', rotulo = 'label' } = {}) {
  const base = vazio == null ? '' : `<option value="">${esc(vazio)}</option>`;
  return base + lista.map((o) => `<option value="${esc(o[valor])}"${String(o[valor]) === String(selecionado ?? '') ? ' selected' : ''}>${esc(o[rotulo])}</option>`).join('');
}

// Grupos do guia (Suspensão, Freios, Motor...). Sem grupos cadastrados, cai nas categorias (sistemas) como antes.
export function opcoesGrupos(base, selecionado, vazio = 'Selecione...') {
  const lista = (base.grupos || []).length
    ? base.grupos.map((g) => ({ valor: g.codigo, rotulo: g.nome }))
    : base.categorias.filter((c) => c.ativo !== false).map((c) => ({ valor: c.codigo, rotulo: `${String(c.codigo).padStart(2, '0')} · ${c.nome}` }));
  return `<option value="">${esc(vazio)}</option>` + lista.map((o) => `<option value="${o.valor}"${Number(selecionado) === Number(o.valor) ? ' selected' : ''}>${esc(o.rotulo)}</option>`).join('');
}

// Valor do seletor de um item: o grupo da categoria gravada (ou ela mesma, se não há grupos).
export const grupoDoItem = (base, categoria) => ((base.grupos || []).length ? grupoDaCategoria(base.categorias, categoria) : categoria);

export function opcoesPlanos(planos, categoria, selecionado) {
  const lista = categoria ? planosDaCategoria(planos, categoria) : [];
  return '<option value="">— nenhum —</option>' + lista.map((p) =>
    `<option value="${esc(p.id)}"${p.id === selecionado ? ' selected' : ''}>${esc(p.nome)} (${esc(descreverIntervalo(p))})</option>`).join('');
}

// Itens do guia dentro do serviço: uma caixa por componente/peça da categoria (marcados = nomes já escolhidos).
export function htmlComponentes(nomes, marcados = [], { titulo = 'Itens do guia', servicos = new Set() } = {}) {
  if (!nomes.length) return '';
  return `<div class="fm-comps"><span class="fm-comps-t">${esc(titulo)}</span>${nomes.map((n) => `<label class="fm-comp${servicos.has(n) ? ' servico' : ''}"><input type="checkbox" data-comp value="${esc(n)}"${marcados.includes(n) ? ' checked' : ''}> ${esc(n)}${servicos.has(n) ? ' <em class="fm-pick-tag">serviço</em>' : ''}</label>`).join('')}</div>`;
}

// Itens do grupo para marcar na ficha: peças do guia, serviços do guia e Mão de obra (com a etiqueta "serviço" onde for o caso).
export function htmlItensDoGrupo(base, grupo, marcados = []) {
  const nomes = itensDoGrupo(base.componentes, grupo, marcados);
  const servicos = new Set(nomes.filter((n) => tipoDoComponente(base.componentes, grupo, n) === 'servico'));
  return htmlComponentes(nomes, marcados, { servicos });
}

export function badgeStatus(status) {
  const s = statusInfo(status);
  return `<span class="fm-badge ${s.tone}">${esc(s.label)}</span>`;
}

// ---------- nova solicitação ----------
// Item já adicionado (lista abaixo da entrada): texto fixo e "x" para remover. Os dados ficam em data-item-json.
export function htmlItemAdicionado(base, item) {
  const plano = base.planos.find((p) => p.id === item.plano_id);
  const tipo = (TIPOS_ITEM.find((t) => t.id === (item.tipo_item || 'servico')) || {}).label;
  return `<div class="fm-item fm-item-lista" data-novo-item data-item-json="${esc(JSON.stringify(item))}">
    <div class="fm-ro">${esc(nomeDoGrupoDaCategoria(base, item.categoria_codigo))}</div>
    <div class="fm-ro">${esc(item.descricao || '—')}${plano ? `<small>Plano do guia: ${esc(plano.nome)}</small>` : ''}${(item.componentes || []).length && item.descricao !== item.componentes.join(', ') ? `<small>Itens: ${esc(item.componentes.join(', '))}</small>` : ''}</div>
    <div class="fm-ro">${esc(tipo)}</div>
    <button class="fm-ic danger" type="button" data-acao="novo-item-remover" title="Remover item" aria-label="Remover item">✕</button></div>`;
}

export function htmlFormNova(base, preset = {}) {
  const veiculo = base.veiculos.find((v) => v.id === preset.veiculo_id);
  const lista = veiculosUnicos(base.veiculos.filter((v) => ['ATIVO', 'MANUTENCAO'].includes(String(v.status || '').toUpperCase()) || v.id === preset.veiculo_id));
  const itens = preset.itens || [];
  // Sem cabeçalho nem resumo: o pedido em faixa, os grupos do guia abrindo e fechando e, no fim, só Cancelar e Registrar.
  return `<div class="fm-nova-corpo">
    <div class="fm-nova" data-nova-grade>
      <section class="fm-sec fm-nova-pedido" aria-label="Pedido">
        <div class="fm-nova-campos">
          <div class="fm-field"><label>Veículo</label><input class="fm-input" list="fmListaVeiculos" data-n-veiculo placeholder="Digite a placa..." value="${esc(veiculo ? `${veiculo.placa} · ${rotuloVeiculo(veiculo)}` : '')}"><datalist id="fmListaVeiculos">${lista.map((v) => `<option value="${esc(v.placa)} · ${esc(rotuloVeiculo(v))}"></option>`).join('')}</datalist></div>
          <div class="fm-field"><label>Quem pediu</label><input class="fm-input" data-n-solicitante data-auto="${preset.solicitante_nome ? '0' : '1'}" list="fmListaColaboradores" autocomplete="off" maxlength="120" placeholder="Condutor ou outra pessoa" value="${esc(preset.solicitante_nome || veiculo?.motorista_atual || '')}"><datalist id="fmListaColaboradores">${(base.colaboradores || []).map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist></div>
          <div class="fm-field"><label>Prioridade</label><select class="fm-select" data-n-prioridade>${opcoes(PRIORIDADES, preset.prioridade || 'normal')}</select></div>
          <div class="fm-field fm-nova-parado"><label>Situação</label><label class="fm-check fm-check-caixa"><input type="checkbox" data-n-parado${preset.veiculo_parado ? ' checked' : ''}> Veículo parado</label></div>
          <div class="fm-field"><label>UF *</label><select class="fm-select" data-n-uf>${htmlOpcoesUf(preset.uf || '')}</select></div>
          <div class="fm-field"><label>Cidade *</label><select class="fm-select" data-n-cidade${preset.uf ? '' : ' disabled'}>${htmlOpcoesCidade(preset.uf || '', preset.cidade || '')}</select></div>
          <div class="fm-field fm-nova-problema"><label>Problema / serviço solicitado</label><textarea data-n-descricao placeholder="Ex.: barulho ao frear, revisão dos 20.000 km...">${esc(preset.descricao || '')}</textarea></div>
        </div></section>
      <section class="fm-sec fm-nova-itens" data-seletor-sec><h4>O que será feito <span class="fm-obrig">obrigatório</span></h4>
        ${itens.length ? `<div class="fm-nova-prontos"><span class="fm-comps-t">Já informado (checklist ou plano)</span><div class="fm-itens" data-novo-itens>${itens.map((it) => htmlItemAdicionado(base, it)).join('')}</div></div>` : ''}
        <div class="fm-sug" data-sugestoes hidden></div>
        <div data-seletor-corpo>${htmlSeletor()}</div>
        <div class="fm-nota">Abra o grupo e marque os itens, ou use a caixa "Grupo todo"; clique no ícone de outro grupo para ir direto a ele, ou no mesmo para fechar. O tipo (peça ou serviço) define a categoria da nota fiscal no GRM e o grupo entra no relatório de custos.</div>
        <div class="fm-pick-resumo" data-pick-resumo hidden></div></section>
    </div></div>
    <div class="fm-nova-rodape">
      <div class="fm-nova-info"><div data-erros></div><ul class="fm-pend fm-pend-linha" data-nova-pendencias></ul></div>
      <div class="fm-nova-acoes"><button class="fm-btn ghost" type="button" data-acao="fechar">Cancelar</button><button class="fm-btn primary" type="button" data-acao="novo-salvar">Registrar manutenção</button></div>
    </div>`;
}

// ---------- ficha ----------
function faixaEtapa(m) {
  const aviso = (txt) => `<div class="fm-aviso" style="border-color:rgba(239,68,68,.4);background:rgba(239,68,68,.1);color:#fecaca">${txt}</div>`;
  return `${m.status === 'reprovada' ? aviso(`Reprovada: ${esc(m.motivo_status || '')}`) : ''}${m.status === 'cancelada' ? aviso(`Cancelada: ${esc(m.motivo_status || '')}`) : ''}`;
}

// Só os status que dividem a etapa com outro (em aprovação e reprovada em Cotações; na oficina em Em andamento) ganham selo.
const STATUS_COM_SELO = new Set(['em_aprovacao', 'reprovada', 'em_execucao']);

function blocoDados(m, ed, selo = '') {
  const campo = (rotulo, conteudo) => `<div class="fm-field"><label>${rotulo}</label>${conteudo}</div>`;
  const ro = (valor) => `<div class="fm-ro">${valor || '—'}</div>`;
  const edit = ed.cabecalho;
  // Só o que se decide na manutenção: previsão de entrega, prioridade, quem paga e veículo parado (o veículo, o solicitante e o
  // motivo já estão na linha do cartão).
  return `<div class="fm-sec">${selo ? `<div style="margin-bottom:8px">${selo}</div>` : ''}<div class="fm-grid2">
    ${campo('Previsão de entrega', edit ? `<input class="fm-input" type="date" data-campo="previsao_entrega" value="${esc(m.previsao_entrega || '')}">` : ro(esc(m.previsao_entrega ? dataBR(m.previsao_entrega) : '')))}
    ${campo('Prioridade', edit ? `<select class="fm-select" data-campo="prioridade">${opcoes(PRIORIDADES, m.prioridade)}</select>` : ro(esc((PRIORIDADES.find((r) => r.id === m.prioridade) || {}).label)))}
    ${campo('Quem paga', edit ? `<select class="fm-select" data-campo="responsavel_pagamento">${opcoes(RESPONSAVEIS, m.responsavel_pagamento, { vazio: 'Definir...' })}</select>` : ro(esc((RESPONSAVEIS.find((r) => r.id === m.responsavel_pagamento) || {}).label)))}
    ${campo('Veículo parado', edit ? `<label class="fm-check"><input type="checkbox" data-campo="veiculo_parado"${m.veiculo_parado ? ' checked' : ''}> Parado na oficina</label>` : ro(m.veiculo_parado ? 'Sim' : 'Não'))}
  </div></div>`;
}

// Adicionar itens: abre o mesmo seletor de grupos da nova manutenção. Os itens existentes aparecem nas linhas de cada cotação
// (não há uma lista à parte).
function blocoAdicionarItens(ed, seletorAberto) {
  if (!ed.itens || !seletorAberto) return '';
  return `<div class="fm-sec fm-add-itens" data-add-itens><h4>Adicionar itens</h4><div data-seletor-corpo>${htmlSeletor()}</div><div class="fm-pick-resumo" data-pick-resumo></div>
    <div class="fm-acoes" style="justify-content:flex-start;margin-top:12px"><button class="fm-btn primary" type="button" data-acao="itens-confirmar">Adicionar itens</button></div></div>`;
}

// Uma linha da cotação: peça/serviço, marca ou observação e valor. A linha vinda dos itens tem o nome fixo; a "outro item" é digitada.
// "Peça faltante": o fornecedor não tem a peça ou o serviço (a linha fica sem valor e a aprovação enxerga o que falta).
export function htmlLinhaOrcamento(l = {}, { fixa = true } = {}) {
  const servico = l.tipo === 'servico';
  const falta = !!l.faltante;
  return `<div class="fm-ol${falta ? ' faltante' : ''}" data-orc-linha data-tipo="${servico ? 'servico' : 'peca'}"><input type="hidden" data-ol="tipo" value="${servico ? 'servico' : 'peca'}">
    ${fixa
    ? `<div class="fm-ro">${esc(l.nome)}${servico ? ' <em class="fm-pick-tag">serviço</em>' : ''}</div><input type="hidden" data-ol="nome" value="${esc(l.nome)}">`
    : `<input class="fm-input" data-ol="nome" maxlength="120" placeholder="${servico ? 'Outro serviço' : 'Outro item'}" value="${esc(l.nome || '')}">`}
    <input class="fm-input" data-ol="detalhe" maxlength="160" placeholder="Marca / observação" value="${esc(l.detalhe || '')}">
    <input class="fm-input" type="number" step="0.01" min="0" data-ol="valor" placeholder="0,00" value="${falta ? '' : (l.valor ?? '')}"${falta ? ' disabled' : ''}>
    <label class="fm-ol-falta" title="O fornecedor não tem esta peça ou serviço"><input type="checkbox" data-ol="faltante"${falta ? ' checked' : ''}> Peça faltante</label>
    <button class="fm-ic danger" type="button" data-acao="orc-linha-rem" title="Remover linha" aria-label="Remover linha">✕</button></div>`;
}

// Cotação: o essencial é o fornecedor e o valor total; o detalhe por item (valor de cada peça, mão de obra, peça faltante) é opcional.
export function htmlFormOrcamento(base, orc = {}, itens = []) {
  const linhas = linhasIniciais(itens, orc.linhas);
  const nomesDosItens = new Set(itens.flatMap((it) => ((it.componentes || []).length ? it.componentes : [it.descricao])).map((n) => norm(n)));
  const somaPecas = somarLinhas(linhas, 'peca'); const somaServico = somarLinhas(linhas, 'servico');
  // "Peças", "Mão de obra" e "Valor total" acompanham as linhas enquanto a pessoa não digitar um valor próprio neles.
  const pecasAuto = orc.valor_pecas == null || (somaPecas != null && Number(orc.valor_pecas) === somaPecas);
  const maoAuto = orc.valor_mao_obra == null || (somaServico != null && Number(orc.valor_mao_obra) === somaServico);
  const totalAuto = orc.valor_total == null || Number(orc.valor_total) === totalDoOrcamento({ pecas: orc.valor_pecas, maoObra: orc.valor_mao_obra });
  const detalhado = linhas.some((l) => l.faltante || l.valor != null || l.detalhe) || orc.valor_pecas != null || orc.valor_mao_obra != null;
  return `<div class="fm-form fm-orc-form" data-orc-form data-orc-id="${esc(orc.id || '')}">
    <details class="fm-mais fm-field full" open><summary>Oficina / fornecedor</summary>
      <div class="fm-orc-linha">
        <div class="fm-field"><input class="fm-input" list="fmListaOficinas" data-o="fornecedor" autocomplete="off" placeholder="Digite para buscar a oficina cadastrada (ou escreva outra)" aria-label="Oficina / fornecedor" value="${esc(orc.fornecedor || '')}"><input type="hidden" data-o="oficina_id" value="${esc(orc.oficina_id || '')}"><datalist id="fmListaOficinas">${base.oficinas.filter((o) => o.ativo !== false).map((o) => `<option value="${esc(o.nome)}"></option>`).join('')}</datalist></div>
        <div class="fm-field"><label>Valor total (R$)</label><input class="fm-input" type="number" step="0.01" min="0" data-o="valor_total" data-auto="${totalAuto ? '1' : '0'}" value="${orc.valor_total ?? ''}" title="Digite o valor, ou detalhe por item abaixo."></div>
        <div class="fm-field"><label>Prazo (dias)</label><input class="fm-input" type="number" min="0" data-o="prazo_dias" value="${orc.prazo_dias ?? ''}"></div>
        <div class="fm-field"><label>Arquivo da cotação</label><input class="fm-input" type="file" accept=".pdf,.jpg,.jpeg,.png" data-o-arquivo></div>
      </div></details>
    <details class="fm-mais fm-field full" data-orc-itens${detalhado ? ' open' : ''}><summary>Detalhar por item (valor de cada peça, mão de obra e peça faltante)</summary>
      <div class="fm-field full">
        <div class="fm-ol-cab" data-ol-cab${linhas.length ? '' : ' hidden'}><span>Peça / serviço</span><span>Marca / observação</span><span>Valor (R$)</span><span></span><span></span></div>
        <div class="fm-ols" data-orc-linhas>${linhas.map((l) => htmlLinhaOrcamento(l, { fixa: nomesDosItens.has(norm(l.nome)) })).join('')}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button class="fm-btn ghost fm-mini" type="button" data-acao="orc-linha-add" data-tipo="peca">+ Outra peça</button><button class="fm-btn ghost fm-mini" type="button" data-acao="orc-linha-add" data-tipo="servico">+ Mão de obra / serviço</button><button class="fm-btn soft fm-mini" type="button" data-acao="orc-itens-abrir">+ Adicionar itens</button></div>
        <div class="fm-sec fm-add-itens" data-orc-add-itens hidden><h4>Adicionar itens ao pedido</h4><div data-seletor-corpo>${htmlSeletor()}</div><div class="fm-pick-resumo" data-pick-resumo></div>
          <div class="fm-acoes" style="justify-content:flex-start;margin-top:12px"><button class="fm-btn primary" type="button" data-acao="orc-itens-confirmar">Adicionar itens</button><button class="fm-btn ghost" type="button" data-acao="orc-itens-cancelar">Cancelar</button></div></div></div>
      <div class="fm-grid2 tres" style="margin-top:10px">
        <div class="fm-field"><label>Peças (R$)</label><input class="fm-input" type="number" step="0.01" min="0" data-o="valor_pecas" data-auto="${pecasAuto ? '1' : '0'}" value="${orc.valor_pecas ?? ''}"><small>Soma das peças acima.</small></div>
        <div class="fm-field"><label>Mão de obra (R$)</label><input class="fm-input" type="number" step="0.01" min="0" data-o="valor_mao_obra" data-auto="${maoAuto ? '1' : '0'}" value="${orc.valor_mao_obra ?? ''}"><small>Soma dos serviços acima.</small></div>
      </div></details>
    <details class="fm-mais fm-field full" open><summary>Mais detalhes</summary><div class="fm-grid2">
      <div class="fm-field"><label>Contato</label><input class="fm-input" data-o="fornecedor_contato" value="${esc(orc.fornecedor_contato || '')}"></div>
      <div class="fm-field"><label>Validade</label><input class="fm-input" type="date" data-o="validade" value="${esc(orc.validade || '')}"></div>
      <div class="fm-field"><label>Pagamento</label><input class="fm-input" data-o="condicoes_pagamento" value="${esc(orc.condicoes_pagamento || '')}"></div>
      <div class="fm-field"><label>Garantia</label><input class="fm-input" data-o="garantia" value="${esc(orc.garantia || '')}"></div>
      <div class="fm-field full"><label>Observações</label><textarea data-o="observacoes">${esc(orc.observacoes || '')}</textarea></div></div></details>
</div>`;
}

// Janela da cotação (adicionar ou editar): cabeçalho com a manutenção, campos organizados em blocos e rodapé com Cancelar e Salvar.
export function htmlModalOrcamento(m, base, orc = {}, itens = []) {
  return `<div class="fm-orc-cab"><div class="fm-mod-head"><div><h3>${orc.id ? 'Editar cotação' : 'Adicionar cotação'}</h3><p>${esc(codigoManutencao(m))} · ${esc(m.__placa || '')}${m.__modelo ? ` · ${esc(m.__modelo)}` : ''}</p></div><button class="fm-x" type="button" data-acao="orc-cancelar" aria-label="Fechar">✕</button></div></div>
    <div class="fm-nova-corpo">${htmlFormOrcamento(base, orc, itens)}</div>
    <div class="fm-nova-rodape"><div class="fm-nova-info"><div data-erros></div></div><div class="fm-nova-acoes"><button class="fm-btn ghost" type="button" data-acao="orc-cancelar">Cancelar</button><button class="fm-btn primary" type="button" data-acao="orc-salvar">${orc.id ? 'Salvar cotação' : 'Adicionar cotação'}</button></div></div>`;
}

// Texto da compra dividida: "Pastilha de freio → Loja B (R$ 350,00)" para cada item comprado de outro fornecedor.
function resumoTrocas(trocas) {
  return trocas.map((t) => `${esc(t.nome)} → ${esc(t.orcamento?.fornecedor || 'cotação removida')}${t.valido ? ` (${dinheiro(t.valor)})` : ' <span class="fm-badge red">sem valor</span>'}`).join('; ');
}

// Comparativo das cotações lado a lado (só leitura): totais (o menor em destaque), condições e o valor de cada item por fornecedor.
// Quem escolhe a cotação (ou os fornecedores por item) é a janela de aprovação.
export function htmlComparativo(m, orcs = []) {
  const cd = compraDividida(orcs, m.escolha_itens);
  const principal = cd.principal;
  const totais = orcs.map((o) => Number(o.valor_total)).filter((v) => Number.isFinite(v));
  const menor = totais.length > 1 ? Math.min(...totais) : null;
  const nomes = [];
  for (const o of orcs) for (const l of (o.linhas || [])) if (!nomes.some((n) => norm(n) === norm(l.nome))) nomes.push(l.nome);
  const celulas = (fn) => orcs.map((o) => `<td>${fn(o)}</td>`).join('');
  const linhaTab = (rotulo, fn, cls = '') => `<tr${cls ? ` class="${cls}"` : ''}><th scope="row">${rotulo}</th>${celulas(fn)}</tr>`;
  const linhaDe = (o, nome) => (o.linhas || []).find((x) => norm(x.nome) === norm(nome));
  const valorLinha = (o, nome) => {
    const l = linhaDe(o, nome);
    if (!l) return '<span class="fm-mm">—</span>';
    if (l.faltante) return '<span class="fm-badge red">Faltante</span>';
    return `${l.valor != null ? dinheiro(l.valor) : '—'}${l.detalhe ? `<small>${esc(l.detalhe)}</small>` : ''}`;
  };
  const cab = orcs.map((o) => `<th scope="col"><strong>${esc(o.fornecedor)}</strong>${o.selecionado ? '<span class="fm-badge green">Escolhida</span>' : ''}</th>`).join('');
  const dim = (v, f = (x) => x) => (v == null || v === '' ? '<span class="fm-mm">—</span>' : f(v));
  const eMenor = (o) => menor != null && Number(o.valor_total) === menor;
  const corpo = [
    linhaTab('Valor total', (o) => `<b class="fm-cmp-total${eMenor(o) ? ' menor' : ''}">${dinheiro(o.valor_total)}</b>${eMenor(o) ? '<span class="fm-badge green">Menor</span>' : ''}`, 'fm-cmp-destaque'),
    linhaTab('Peças', (o) => dim(o.valor_pecas, dinheiro)),
    linhaTab('Mão de obra', (o) => dim(o.valor_mao_obra, dinheiro)),
    linhaTab('Prazo', (o) => dim(o.prazo_dias, (v) => `${v} dia(s)`)),
    linhaTab('Validade', (o) => dim(o.validade, dataBR)),
    linhaTab('Garantia', (o) => dim(o.garantia, esc)),
    linhaTab('Pagamento', (o) => dim(o.condicoes_pagamento, esc)),
    linhaTab('Arquivo', (o) => (o.anexo_url ? `<a class="fm-badge blue" href="${esc(o.anexo_url)}" target="_blank" rel="noopener">Ver arquivo</a>` : '<span class="fm-mm">—</span>')),
    nomes.length ? `<tr class="fm-cmp-sec"><th colspan="${orcs.length + 1}">Itens da cotação</th></tr>` : '',
    ...nomes.map((n) => linhaTab(esc(n), (o) => valorLinha(o, n))),
  ].join('');
  const resumo = principal && cd.trocas.length
    ? `<div class="fm-cmp-resumo"><span>Cotação principal: <strong>${esc(principal.fornecedor)}</strong> (${dinheiro(principal.valor_total)})</span><span>Itens de outros fornecedores: ${resumoTrocas(cd.trocas)}</span><span>Total: <strong>${dinheiro(cd.total)}</strong></span></div>`
    : '';
  return `<div class="fm-orc-cab"><div class="fm-mod-head"><div><h3>Comparativo de cotações</h3><p>${esc(codigoManutencao(m))} · ${esc(m.__placa || '')}${m.__modelo ? ` · ${esc(m.__modelo)}` : ''}</p></div><button class="fm-x" type="button" data-acao="cmp-fechar" aria-label="Fechar">✕</button></div></div>
    <div class="fm-nova-corpo"><div class="fm-cmp-rolagem"><table class="fm-cmp"><thead><tr><th></th>${cab}</tr></thead><tbody>${corpo}</tbody></table></div>${resumo}</div>
    <div class="fm-nova-rodape"><div class="fm-nova-info"><div data-erros></div></div><div class="fm-nova-acoes"><button class="fm-btn ghost" type="button" data-acao="cmp-fechar">Fechar</button></div></div>`;
}

// Janela de aprovação: escolher qual cotação foi aprovada ou, com "Vários fornecedores", de qual fornecedor sai cada item.
// A escolha inicial e o total são montados pelo controlador (lê os campos marcados).
export function htmlModalAprovacao(m, orcs = []) {
  const nomes = [];
  for (const o of orcs) for (const l of (o.linhas || [])) if (!nomes.some((n) => n === l.nome)) nomes.push(l.nome);
  const temValor = (l) => l && !l.faltante && l.valor != null && l.valor !== '' && Number.isFinite(Number(l.valor));
  const comItens = orcs.filter((o) => (o.linhas || []).some(temValor));
  const variosPossivel = comItens.length >= 2 && nomes.length > 0;
  const totais = orcs.map((o) => Number(o.valor_total)).filter((v) => Number.isFinite(v));
  const menor = totais.length > 1 ? Math.min(...totais) : null;
  const unica = orcs.map((o) => {
    const faltam = faltantesDoOrcamento(o);
    return `<label class="fm-apr-orc"><input type="radio" name="apr-uma" value="${esc(o.id)}"><span class="fm-apr-orc-t"><strong>${esc(o.fornecedor)}</strong>${menor != null && Number(o.valor_total) === menor ? ' <span class="fm-badge green">Menor</span>' : ''}<small>${[o.prazo_dias != null ? `Prazo ${o.prazo_dias} dia(s)` : '', o.garantia ? `Garantia ${esc(o.garantia)}` : '', o.condicoes_pagamento ? `Pagamento ${esc(o.condicoes_pagamento)}` : ''].filter(Boolean).join(' · ')}</small>${faltam.length ? `<span class="fm-badge red" style="white-space:normal">Não tem: ${esc(faltam.join(', '))}</span>` : ''}</span><b>${dinheiro(o.valor_total)}</b></label>`;
  }).join('');
  const cabecalho = orcs.map((o) => `<th scope="col">${esc(o.fornecedor)}</th>`).join('');
  const linhas = nomes.map((nome, i) => `<tr><th scope="row">${esc(nome)}</th>${orcs.map((o) => {
    const l = (o.linhas || []).find((x) => x.nome === nome);
    if (!l) return '<td><span class="fm-mm">—</span></td>';
    if (l.faltante) return '<td><span class="fm-badge red">Faltante</span></td>';
    if (!temValor(l)) return '<td><span class="fm-mm">sem valor</span></td>';
    return `<td><label class="fm-apr-cel"><input type="radio" name="apr-item-${i}" data-nome="${esc(nome)}" data-valor="${Number(l.valor)}" value="${esc(o.id)}"><span>${dinheiro(l.valor)}</span></label></td>`;
  }).join('')}</tr>`).join('');
  const aviso = m.veiculo_parado ? '' : '<div class="fm-aviso">O veículo não está marcado como parado: a Programação e os alertas continuarão considerando-o disponível.</div>';
  return `<div class="fm-orc-cab"><div class="fm-mod-head"><div><h3>Aprovar manutenção</h3><p>${esc(codigoManutencao(m))} · ${esc(m.__placa || '')}${m.__modelo ? ` · ${esc(m.__modelo)}` : ''}</p></div><button class="fm-x" type="button" data-acao="apr-cancelar" aria-label="Fechar">✕</button></div></div>
    <div class="fm-nova-corpo">
      <div class="fm-apr-modo" role="radiogroup" aria-label="Como aprovar">
        <label><input type="radio" name="apr-modo" value="uma" checked> Uma cotação</label>
        <label${variosPossivel ? '' : ' title="Precisa de ao menos duas cotações com valor por item"'}><input type="radio" name="apr-modo" value="varios"${variosPossivel ? '' : ' disabled'}> Vários fornecedores (escolher por item)</label>
      </div>
      <div data-apr-painel="uma"><p class="fm-mm">Escolha a cotação aprovada.</p><div class="fm-apr-lista">${unica}</div></div>
      <div data-apr-painel="varios" hidden><p class="fm-mm">Escolha, para cada item, de qual fornecedor a compra foi aprovada.</p>
        <div class="fm-cmp-rolagem"><table class="fm-cmp fm-apr-itens"><thead><tr><th>Item</th>${cabecalho}</tr></thead><tbody>${linhas}</tbody></table></div></div>
      <div class="fm-cmp-resumo" data-apr-resumo></div>
      ${aviso}
    </div>
    <div class="fm-nova-rodape"><div class="fm-nova-info"><div data-erros></div></div><div class="fm-nova-acoes"><button class="fm-btn ghost" type="button" data-acao="apr-cancelar">Cancelar</button><button class="fm-btn primary" type="button" data-acao="apr-confirmar" disabled>Aprovar e emitir OS</button></div></div>`;
}

// Peças e serviços que o fornecedor não tem, como as linhas da cotação guardam.
export const faltantesDoOrcamento = (o) => (Array.isArray(o?.linhas) ? o.linhas : []).filter((l) => l.faltante).map((l) => l.nome);

function blocoOrcamentos(m, orcs, ed) {
  const cards = orcs.map((o) => {
    const faltam = faltantesDoOrcamento(o);
    return `<div class="fm-orc${o.selecionado ? ' sel' : ''}">
      <div><strong>${esc(o.fornecedor)}</strong>${o.selecionado ? ' <span class="fm-badge green">Escolhida</span>' : ''}</div>
      <div class="v">${dinheiro(o.valor_total)}</div>
      ${faltam.length ? `<div class="fm-badge red" title="O fornecedor não tem estas peças ou serviços" style="white-space:normal">Peça faltante: ${esc(faltam.join(', '))}</div>` : ''}
      ${(o.linhas || []).length ? `<ul class="fm-ol-lista">${o.linhas.map((l) => `<li><span>${esc(l.nome)}${l.faltante ? ' <span class="fm-badge red">Faltante</span>' : ''}${l.detalhe ? `<small>${esc(l.detalhe)}</small>` : ''}</span><b>${l.valor != null ? dinheiro(l.valor) : '—'}</b></li>`).join('')}</ul>` : ''}
      <div class="fm-mm">${o.valor_pecas != null ? `Peças ${dinheiro(o.valor_pecas)}` : ''}${o.valor_mao_obra != null ? ` · Mão de obra ${dinheiro(o.valor_mao_obra)}` : ''}</div>
      <div class="fm-mm">${o.prazo_dias != null ? `Prazo ${o.prazo_dias} dia(s)` : ''}${o.validade ? ` · Validade ${dataBR(o.validade)}` : ''}${o.garantia ? ` · Garantia ${esc(o.garantia)}` : ''}</div>
      ${o.condicoes_pagamento ? `<div class="fm-mm">Pagamento: ${esc(o.condicoes_pagamento)}</div>` : ''}
      ${o.anexo_url ? `<a class="fm-badge blue" href="${esc(o.anexo_url)}" target="_blank" rel="noopener">Ver arquivo</a>` : ''}
      ${ed.orcamentos ? `<div class="fm-orc-acoes"><button class="fm-btn ghost fm-mini" type="button" data-acao="orc-editar" data-id="${esc(o.id)}">Editar</button><button class="fm-btn danger fm-mini" type="button" data-acao="orc-remover" data-id="${esc(o.id)}">Remover</button></div>` : ''}</div>`;
  }).join('');
  const aviso = m.sem_orcamento ? '<div class="fm-aviso">Aprovada sem cotação (valor estimado informado pelo aprovador).</div>' : '';
  const dividida = compraDividida(orcs, m.escolha_itens);
  const avisoDividida = dividida.trocas.length ? `<div class="fm-aviso">Compra dividida — itens de outros fornecedores: ${resumoTrocas(dividida.trocas)}. Total: <strong>${dinheiro(dividida.total)}</strong>.</div>` : '';
  if (!orcs.length && !aviso) return '';
  return `<div class="fm-sec">
    ${orcs.length ? `<div class="fm-orcs">${cards}</div>` : ''}
    ${avisoDividida}${aviso}</div>`;
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
// Serviço já pago: comprovante de pagamento (opcional) junto da nota. Com comprovante, o pagamento entra no Financeiro já como pago.
export function htmlCampoPagamento() {
  return `<div class="fm-nota-pago"><span>Já foi pago? Comprovante de pagamento (opcional):</span>
    <input class="fm-input" type="file" accept=".pdf,.jpg,.jpeg,.png" data-nt-comprovante title="Comprovante de pagamento (PIX, recibo, extrato)">
    <label>Pago em <input class="fm-input" type="date" data-nt="pago_em" title="Data do pagamento"></label></div>`;
}

export function htmlEntradaNota(base) {
  return `<div class="fm-nota-linha" data-nota-entrada>
    <select class="fm-select" data-nt="tipo" title="Peças, serviço ou os dois: define a categoria da nota no GRM">${opcoes(TIPOS_NOTA, 'servico')}</select>
    <input class="fm-input" data-nt="fornecedor" list="fmListaFornecedores" placeholder="Quem emitiu (oficina ou loja de peças)" maxlength="120">
    <datalist id="fmListaFornecedores">${base.oficinas.filter((o) => o.ativo !== false).map((o) => `<option value="${esc(o.nome)}"></option>`).join('')}</datalist>
    <input class="fm-input" data-nt="numero" placeholder="Nº da NF" maxlength="60">
    <input class="fm-input" type="number" step="0.01" min="0" data-nt="valor" placeholder="Valor (R$)">
    <input class="fm-input" type="file" accept=".pdf,.xml,.jpg,.jpeg,.png" data-nt-arquivo title="Arquivo da nota fiscal (NF ou NFS-e)">
    <button class="fm-ic" type="button" data-acao="nota-add" title="Adicionar nota" aria-label="Adicionar nota" style="font-size:20px;font-weight:900;color:#86efac;border-color:rgba(34,197,94,.4);background:rgba(34,197,94,.14)">+</button>
    ${htmlCampoPagamento()}</div>`;
}

// Pagou antes de a nota chegar (ou o contrário): o que falta pode ser anexado depois, na própria nota.
const hojeBrasil = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
function htmlCompletarNota(n) {
  const nf = !n.anexo_url
    ? `<span class="fm-badge amber">Falta a NF/NFS-e</span><label class="fm-anexar">Anexar NF<input class="fm-input" type="file" accept=".pdf,.xml,.jpg,.jpeg,.png" data-anexar-nf="${esc(n.id)}"></label>` : '';
  const comp = (!n.comprovante_url && !n.pago_em)
    ? `<span class="fm-badge amber">Falta o comprovante</span><label class="fm-anexar">Pago em <input class="fm-input" type="date" data-anexar-data="${esc(n.id)}" value="${hojeBrasil()}" max="${hojeBrasil()}"></label><label class="fm-anexar">Anexar comprovante<input class="fm-input" type="file" accept=".pdf,.jpg,.jpeg,.png" data-anexar-comp="${esc(n.id)}"></label>` : '';
  return `<div class="fm-nota-pago">${nf}${comp}</div>`;
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
      <div class="fm-ro">${n.anexo_url ? `<a href="${esc(n.anexo_url)}" target="_blank" rel="noopener" style="color:#86efac">Ver arquivo</a>` : '—'}${n.comprovante_url ? ` · <a href="${esc(n.comprovante_url)}" target="_blank" rel="noopener" style="color:#86efac" title="Comprovante de pagamento anexado à nota">Comprovante anexado</a>${n.pago_em ? ` (${esc(dataBR(n.pago_em))})` : ''}` : ''}${situacao ? `<small>${situacao}</small>` : ''}</div>
      ${n.enviada_em ? '<span></span>' : `<button class="fm-ic danger" type="button" data-acao="nota-remover" data-id="${esc(n.id)}" title="Remover nota" aria-label="Remover nota">✕</button>`}
      ${(!n.anexo_url || (!n.comprovante_url && !n.pago_em)) ? htmlCompletarNota(n) : ''}</div>`;
  }).join('');
  const conf = conferenciaNotas(notas, m.status === 'concluida' ? m.custo : null);
  const resumo = notas.length
    ? `<div class="fm-mm" style="margin-top:8px">Soma das ${notas.length} nota(s): <strong>${esc(dinheiro(conf.soma))}</strong>${m.status === 'concluida' && m.custo != null ? ` · Custo final: <strong>${esc(dinheiro(m.custo))}</strong>` : ''}</div>${conf.situacao === 'acima' ? '<div class="fm-aviso" style="border-color:rgba(239,68,68,.4);background:rgba(239,68,68,.1);color:#fecaca">A soma das notas passa do custo final: o envio é recusado até acertar.</div>' : conf.situacao === 'abaixo' ? `<div class="fm-mm">O custo final é ${esc(dinheiro(conf.diferenca))} maior que as notas (valor sem nota, por exemplo).</div>` : ''}`
    : '<div class="fm-mm">Nenhuma nota ainda. Adicione cada nota (peças, serviço, ou várias de cada) com o valor e a NF e/ou o comprovante de pagamento: o que faltar pode ser anexado depois, na própria nota.</div>';
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
    ${blocoAdicionarItens(ed, !itens.length)}${blocoOrcamentos(m, orcamentos, ed)}${blocoDados(m, ed, tituloDados)}${blocoExecucao(m)}${blocoNotas(m, notas, financeiro, base)}${blocoProgramacao(m, afetadas)}
    ${form}<div data-erros></div>`;
}

export function htmlErros(erros) {
  return erros.length ? `<ul class="fm-erros">${erros.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : '';
}
