// Frotas · Manutenção › HTML: cotação (formulário e janela), comparativo, janela de aprovação e a lista de cotações da ficha.
import { dataBR, dinheiro, esc } from '../core/ui.js';
import { htmlSeletor } from './frotas-manutencao-seletor.js?v=20261030-frotas-manut-v5';
import { codigoManutencao, compraDividida, linhasIniciais, norm, somarLinhas, totalDoOrcamento } from './frotas-manutencao-regras.js?v=20261030-frotas-manut-v5';

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
        <div class="fm-field"><input class="fm-input" list="fmListaOficinas" data-o="fornecedor" autocomplete="off" placeholder="Escolha da lista ou digite qualquer nome" aria-label="Oficina / fornecedor" value="${esc(orc.fornecedor || '')}"><input type="hidden" data-o="oficina_id" value="${esc(orc.oficina_id || '')}"><datalist id="fmListaOficinas">${base.oficinas.filter((o) => o.ativo !== false).map((o) => `<option value="${esc(o.nome)}"></option>`).join('')}</datalist></div>
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

export function blocoOrcamentos(m, orcs, ed) {
  // Uma linha por cotação (os itens de cada uma ficam no comparativo, o olho da linha de ações).
  const cards = orcs.map((o) => {
    const faltam = faltantesDoOrcamento(o);
    const info = [
      o.valor_pecas != null ? `Peças ${dinheiro(o.valor_pecas)}` : '',
      o.valor_mao_obra != null ? `Mão de obra ${dinheiro(o.valor_mao_obra)}` : '',
      o.prazo_dias != null ? `Prazo ${o.prazo_dias} dia(s)` : '',
      o.validade ? `Validade ${dataBR(o.validade)}` : '',
      o.garantia ? `Garantia ${esc(o.garantia)}` : '',
      o.condicoes_pagamento ? `Pagamento ${esc(o.condicoes_pagamento)}` : '',
    ].filter(Boolean).join(' · ');
    return `<div class="fm-orc${o.selecionado ? ' sel' : ''}">
      <strong>${esc(o.fornecedor)}</strong>${o.selecionado ? '<span class="fm-badge green">Escolhida</span>' : ''}
      <span class="v">${dinheiro(o.valor_total)}</span>
      ${info ? `<span class="fm-mm fm-orc-info">${info}</span>` : '<span class="fm-orc-info"></span>'}
      ${faltam.length ? `<span class="fm-badge red" title="O fornecedor não tem estas peças ou serviços">Faltante: ${esc(faltam.join(', '))}</span>` : ''}
      ${o.anexo_url ? `<a class="fm-badge blue" href="${esc(o.anexo_url)}" target="_blank" rel="noopener">Ver arquivo</a>` : ''}
      ${ed.orcamentos ? `<span class="fm-orc-acoes"><button class="fm-btn ghost fm-mini" type="button" data-acao="orc-editar" data-id="${esc(o.id)}">Editar</button><button class="fm-btn danger fm-mini" type="button" data-acao="orc-remover" data-id="${esc(o.id)}">Remover</button></span>` : ''}</div>`;
  }).join('');
  const aviso = m.sem_orcamento ? '<div class="fm-aviso">Aprovada sem cotação (valor estimado informado pelo aprovador).</div>' : '';
  const dividida = compraDividida(orcs, m.escolha_itens);
  const avisoDividida = dividida.trocas.length ? `<div class="fm-aviso">Compra dividida — itens de outros fornecedores: ${resumoTrocas(dividida.trocas)}. Total: <strong>${dinheiro(dividida.total)}</strong>.</div>` : '';
  if (!orcs.length && !aviso) return '';
  return `<div class="fm-sec">
    ${orcs.length ? `<div class="fm-orcs">${cards}</div>` : ''}
    ${avisoDividida}${aviso}</div>`;
}
