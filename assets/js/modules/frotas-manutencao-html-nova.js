// Frotas · Manutenção › HTML: formulário da nova solicitação.
import { esc } from '../core/ui.js';
import { htmlOpcoesCidade, htmlOpcoesUf } from './frotas-manutencao-cidades.js?v=20261030-frotas-colunas';
import { htmlSeletor } from './frotas-manutencao-seletor.js?v=20261030-frotas-colunas';
import { PRIORIDADES, nomeDoGrupoDaCategoria, rotuloVeiculo, veiculosUnicos } from './frotas-manutencao-regras.js?v=20261030-frotas-colunas';
import { TIPOS_ITEM, opcoes } from './frotas-manutencao-html-base.js?v=20261030-frotas-colunas';

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
