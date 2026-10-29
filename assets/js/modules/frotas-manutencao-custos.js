// Frotas · Manutenção › Custos: custo final das manutenções concluídas por veículo, coordenação, supervisão, categoria do
// guia, natureza, oficina e mês, com exportação em CSV. Fonte: frotas_manutencoes (concluída, custo > 0, paga pela empresa).
import { dinheiro, esc, toast } from '../core/ui.js';
import { cardFiltro } from './frotas-ui-lista.js?v=20261029-frotas-inst90';
import { ESTILOS_MANUTENCAO } from './frotas-manutencao-estilos.js?v=20261029-frotas-inst90';
import {
  AGRUPAMENTOS, agrupar, csvDasLinhas, csvDosGrupos, filtrarPeriodo, linhasDeCusto, resumo,
} from './frotas-manutencao-custos-regras.js?v=20261029-frotas-inst90';

(function () {
  const MODULE_NAME = 'FROTAS_MANUT_CUSTOS';
  const state = { supabase: null, root: null, base: null, por: 'placa', inicio: '', fim: '', somenteEmpresa: true, natureza: '', loading: false };

  const hojeIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const mesesAtras = (n) => { const d = new Date(); d.setMonth(d.getMonth() - n); return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); };

  // O PostgREST devolve no máximo 1.000 linhas por chamada: pagina até acabar.
  async function paginar(montar) {
    const out = [];
    for (let de = 0; de < 20000; de += 1000) {
      const { data, error } = await montar().range(de, de + 999);
      if (error) throw error;
      out.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return out;
  }

  async function carregar() {
    state.loading = true; render();
    try {
      const s = state.supabase;
      const manutencoes = await paginar(() => s.from('frotas_manutencoes')
        .select('id,numero,veiculo_id,status,natureza,custo,data_execucao,oficina,responsavel_pagamento')
        .eq('status', 'concluida').gt('custo', 0).order('data_execucao', { ascending: false }));
      const ids = new Set(manutencoes.map((m) => m.id));
      const [itens, veiculos, categorias] = await Promise.all([
        paginar(() => s.from('frotas_manutencao_itens').select('manutencao_id,categoria_codigo').order('created_at', { ascending: true })),
        paginar(() => s.from('frotas_veiculos').select('id,placa,marca_modelo,coordenacao,supervisao').order('placa', { ascending: true })),
        paginar(() => s.from('frotas_manutencao_categorias').select('codigo,nome').order('codigo', { ascending: true })),
      ]);
      state.base = { manutencoes, itens: itens.filter((i) => ids.has(i.manutencao_id)), veiculos, categorias };
    } catch (err) {
      toast(err.message || 'Erro ao carregar os custos.', 'err');
      state.base = { manutencoes: [], itens: [], veiculos: [], categorias: [] };
    }
    state.loading = false; render();
  }

  function linhasAtuais() {
    if (!state.base) return [];
    const todas = linhasDeCusto(state.base.manutencoes, state.base, { somenteEmpresa: state.somenteEmpresa });
    return filtrarPeriodo(todas, { inicio: state.inicio, fim: state.fim }).filter((l) => !state.natureza || l.natureza === state.natureza);
  }

  function baixar(nome, csv) {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function render() {
    const root = state.root; if (!root) return;
    const linhas = linhasAtuais();
    const r = resumo(linhas);
    root.querySelector('[data-kpis]').innerHTML = [
      cardFiltro({ tone: 'green', icone: 'dinheiro', label: 'Custo total', valor: dinheiro(r.total), dica: 'Soma do custo final das manutenções concluídas no período' }),
      cardFiltro({ tone: 'blue', icone: 'ferramenta', label: 'Manutenções', valor: String(r.qtd), dica: 'Concluídas com custo no período' }),
      cardFiltro({ tone: 'amber', icone: 'relogio', label: 'Custo médio', valor: dinheiro(r.medio), dica: 'Custo total dividido pelas manutenções' }),
      cardFiltro({ tone: 'green', icone: 'ok', label: 'Preventiva', valor: `${String(r.pctPreventiva).replace('.', ',')}%`, dica: `${dinheiro(r.preventiva)} em manutenção preventiva` }),
      cardFiltro({ tone: 'red', icone: 'alerta', label: 'Corretiva', valor: `${String(r.pctCorretiva).replace('.', ',')}%`, dica: `${dinheiro(r.corretiva)} em manutenção corretiva` }),
    ].join('');
    const grupos = agrupar(linhas, state.por);
    const maior = Math.max(1, ...grupos.map((g) => g.total));
    root.querySelector('[data-linhas]').innerHTML = state.loading
      ? '<tr><td colspan="6" class="fm-empty">Carregando custos...</td></tr>'
      : grupos.length ? grupos.map((g) => `<tr>
          <td><strong>${esc(g.rotulo)}</strong></td>
          <td>${esc(String(g.qtd).replace('.', ','))}</td>
          <td><strong>${esc(dinheiro(g.total))}</strong><div style="height:5px;border-radius:4px;background:rgba(34,197,94,.7);width:${Math.max(2, Math.round((g.total / maior) * 100))}%;margin-top:4px"></div></td>
          <td>${esc(dinheiro(g.medio))}</td>
          <td>${esc(dinheiro(g.preventiva))}</td>
          <td>${esc(dinheiro(g.corretiva))}</td></tr>`).join('')
        : '<tr><td colspan="6" class="fm-empty">Nenhuma manutenção concluída com custo neste período.</td></tr>';
    root.querySelector('[data-contagem]').textContent = `${grupos.length} grupo(s) · ${linhas.length} manutenção(ões)`;
    root.querySelector('[data-rotulo-grupo]').textContent = (AGRUPAMENTOS.find((a) => a.id === state.por) || {}).rotulo || '';
  }

  async function openHome(container, opts = {}) {
    state.supabase = opts.supabase; state.root = container;
    state.inicio = state.inicio || mesesAtras(12); state.fim = state.fim || hojeIso();
    container.innerHTML = `${ESTILOS_MANUTENCAO}<section class="fm-shell">
      <div class="fm-topo"><div class="fm-head-actions"><button class="fm-btn ghost" type="button" data-csv-grupos>Exportar resumo (CSV)</button><button class="fm-btn soft" type="button" data-csv-linhas>Exportar manutenções (CSV)</button></div></div>
      <div class="fm-kpis" data-kpis></div>
      <div class="fm-card"><div class="fm-body"><div class="fm-bar">
        <select class="fm-select" data-por style="width:auto">${AGRUPAMENTOS.map((a) => `<option value="${a.id}"${a.id === state.por ? ' selected' : ''}>Agrupar por: ${esc(a.rotulo)}</option>`).join('')}</select>
        <label class="fm-check" style="min-height:42px">De <input class="fm-input" type="date" data-inicio style="width:auto;margin-left:6px" value="${esc(state.inicio)}"></label>
        <label class="fm-check" style="min-height:42px">até <input class="fm-input" type="date" data-fim style="width:auto;margin-left:6px" value="${esc(state.fim)}"></label>
        <select class="fm-select" data-natureza style="width:auto"><option value="">Natureza: todas</option><option value="preventiva">Preventiva</option><option value="corretiva">Corretiva</option></select>
        <label class="fm-check"><input type="checkbox" data-empresa checked> Só pagas pela empresa</label>
        <span class="fm-count" data-contagem></span></div>
      <div class="fm-table-wrap"><table class="fm-table" style="min-width:760px"><thead><tr><th data-rotulo-grupo></th><th>Manutenções</th><th>Custo total</th><th>Custo médio</th><th>Preventiva</th><th>Corretiva</th></tr></thead><tbody data-linhas></tbody></table></div>
      <div class="fm-nota">Custo final das manutenções concluídas. Por padrão só entra o que a empresa paga (o que vai para a nota fiscal e o Financeiro); o cartão "Custo de manutenção no mês" do dashboard de Frotas usa a mesma regra. Na visão por categoria, o custo de cada manutenção é dividido igualmente entre as categorias dos seus itens (o custo final é um valor só por manutenção). Manutenções importadas do histórico (sem custo) e as que ainda não foram concluídas não entram.</div></div></div></section>`;
    container.querySelector('[data-por]').addEventListener('change', (e) => { state.por = e.target.value; render(); });
    container.querySelector('[data-inicio]').addEventListener('change', (e) => { state.inicio = e.target.value; render(); });
    container.querySelector('[data-fim]').addEventListener('change', (e) => { state.fim = e.target.value; render(); });
    container.querySelector('[data-natureza]').addEventListener('change', (e) => { state.natureza = e.target.value; render(); });
    container.querySelector('[data-empresa]').addEventListener('change', (e) => { state.somenteEmpresa = e.target.checked; render(); });
    container.querySelector('[data-csv-grupos]').addEventListener('click', () => {
      const rotulo = (AGRUPAMENTOS.find((a) => a.id === state.por) || {}).rotulo || 'Grupo';
      baixar(`custos_manutencao_por_${state.por}.csv`, csvDosGrupos(agrupar(linhasAtuais(), state.por), rotulo));
    });
    container.querySelector('[data-csv-linhas]').addEventListener('click', () => baixar('custos_manutencao_manutencoes.csv', csvDasLinhas(linhasAtuais())));
    await carregar();
  }

  window[MODULE_NAME] = window[MODULE_NAME] || {};
  window[MODULE_NAME].openHome = openHome;
})();
