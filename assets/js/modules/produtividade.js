/* assets/js/modules/produtividade.js
 * Módulo Diretoria > Produtividade
 * Relatório por data: Colaborador · Tipo · Produção · Faturado · Custo · Saldo.
 *
 * Fontes:
 *  - Produção e Faturado: public.relatorio_resultado_diario (toneladas e valor_embarcado
 *    = embarcado × valor/ton, já com a cadência mínima aplicada pelo GRM).
 *  - Tipo e remuneração: public.colaboradores (quadro ao vivo do sync GRM). O
 *    historico_colaboradores está sem importação desde setembro, então não é usado.
 *
 * Custo do dia (só remuneração — o GRM não traz despesas por pessoa):
 *  - Diarista/Intermitente: valor da diária (campo `salario` do cadastro), só nos dias com produção.
 *  - Efetivo: salário ÷ 30, todos os dias. Efetivos classificadores sem produção também
 *    entram na lista (faturado 0, saldo negativo) — dá pra esconder pelo filtro.
 */
(function () {
  'use strict';

  const STYLE_ID = 'produtividade-module-style-v1';
  const MAX_DAYS = 31;
  const MAX_RENDER_ROWS = 2000;
  const TIPOS = ['Efetivo', 'Diarista', 'Intermitente'];

  const state = {
    loading: false,
    from: '',
    to: '',
    coordenacao: '',
    tipo: '',
    busca: '',
    incluirOciosos: true,
    sort: { key: 'data', dir: 'asc' },
    rows: [],
    coordenacoes: [],
    error: null,
    loadSeq: 0,
    supabase: null,
    initialized: false
  };

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .prd-page{--panel:#0d0d18;--line:rgba(148,163,184,.18);--text:#e2e2f0;--muted:#6b7280;--green:#22c55e;--red:#ef4444;color:var(--text);width:100%}
      .prd-page *{box-sizing:border-box}.prd-btn,.prd-field select,.prd-field input{height:42px;border-radius:14px;border:1px solid rgba(255,255,255,0.08);background:#0d0d18;color:#e2e2f0;padding:0 12px;font-weight:850;color-scheme:dark}.prd-btn{cursor:pointer;background:linear-gradient(135deg,#166534,#22c55e);color:#052e16;border:0}.prd-btn.secondary{background:#0d0d18;color:#e2e2f0;border:1px solid rgba(255,255,255,0.08)}.prd-btn:disabled{opacity:.55;cursor:not-allowed}.prd-field select option{background:#0d0d18;color:#e2e2f0}
      .prd-filter-card,.prd-card,.prd-table-card{background:linear-gradient(180deg,rgba(15,23,42,.96),rgba(2,6,23,.88));border:1px solid var(--line);border-radius:22px;box-shadow:0 18px 40px rgba(0,0,0,.26)}.prd-filter-card{padding:16px;margin-bottom:16px}.prd-filters{display:grid;grid-template-columns:repeat(2,minmax(130px,.8fr)) repeat(2,minmax(150px,1fr)) minmax(180px,1.2fr) auto auto;gap:12px;align-items:end}.prd-field label{display:block;font-size:11px;color:var(--muted);margin:0 0 6px;text-transform:uppercase;letter-spacing:.08em}.prd-field select,.prd-field input[type=date],.prd-field input[type=search]{width:100%}
      .prd-check{display:flex;align-items:center;gap:8px;margin-top:12px;font-size:12px;color:var(--muted);cursor:pointer;user-select:none}.prd-check input{width:16px;height:16px;accent-color:#22c55e}
      .prd-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}.prd-card{padding:16px}.prd-card span{display:block;color:var(--muted);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.04em}.prd-card strong{display:block;margin-top:8px;font-size:24px;letter-spacing:-.035em}.prd-card small{display:block;margin-top:4px;color:#6b7280}.prd-card.pos strong{color:#86efac}.prd-card.neg strong{color:#fca5a5}
      .prd-status{margin-bottom:14px;padding:12px 14px;border-radius:16px;border:1px solid var(--line);background:rgba(15,23,42,.72);color:var(--muted)}.prd-status strong{color:var(--text)}.prd-status.err{border-color:rgba(239,68,68,.45);color:#fecaca;background:rgba(127,29,29,.22)}
      .prd-table-card{overflow:hidden}.prd-table-top{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:16px 18px;border-bottom:1px solid var(--line);flex-wrap:wrap}.prd-table-top h2{margin:0;font-size:18px}.prd-table-top p{margin:4px 0 0;color:var(--muted);font-size:12px}.prd-table-wrap{overflow:auto;max-height:70vh}.prd-table{width:100%;border-collapse:collapse;font-size:12px;min-width:880px;color:var(--text)}.prd-table th{position:sticky;top:0;z-index:1;background:#0d0d18;color:#bbf7d0;text-align:center;font-weight:900;padding:8px;border:1px solid rgba(255,255,255,0.1);white-space:nowrap}.prd-table th.sortable{cursor:pointer;user-select:none}.prd-table th.sortable:hover{background:#166534}.prd-table td{padding:7px 8px;border:1px solid rgba(255,255,255,0.08);white-space:nowrap;background:rgba(15,23,42,.55)}.prd-table td.num{text-align:right;font-variant-numeric:tabular-nums}.prd-table td.nome{font-weight:900;min-width:240px}
      .prd-table tr.sub td{background:rgba(22,101,52,.35)!important;font-weight:950;color:#dcfce7}.prd-table tr.total td{background:rgba(22,101,52,.55)!important;font-weight:950;color:#dcfce7}.prd-table tr.empty td{background:transparent!important;text-align:center;color:var(--muted)}.prd-pos{color:#86efac}.prd-neg{color:#fca5a5}.prd-muted{color:#6b7280}.prd-tag{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:900;background:rgba(148,163,184,.14)}.prd-tag.efetivo{background:rgba(59,130,246,.2);color:#bfdbfe}.prd-tag.diarista{background:rgba(250,204,21,.16);color:#fde68a}.prd-tag.intermitente{background:rgba(168,85,247,.2);color:#e9d5ff}
      .prd-footer-note{padding:12px 16px;color:var(--muted);border-top:1px solid var(--line);font-size:12px}
      @media(max-width:1180px){.prd-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.prd-filters{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:760px){.prd-kpis,.prd-filters{grid-template-columns:1fr}.prd-btn{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function esc(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function keyText(value) {
    return String(value ?? '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Z0-9]/g, '');
  }

  function toNumber(value) {
    if (value == null || value === '') return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const raw = String(value).replace(/R\$\s*/gi, '').replace(/[^\d,.-]/g, '');
    const parsed = raw.includes(',') && raw.includes('.') ? Number(raw.replace(/\./g, '').replace(',', '.')) : Number(raw.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function fmtNumber(value, digits = 2) {
    return toNumber(value).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  function fmtMoney(value) {
    return toNumber(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function dateKey(value) {
    const s = String(value ?? '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
  }

  function brDate(iso) {
    const [y, m, d] = String(iso || '').split('-');
    return y && m && d ? `${d}/${m}/${y}` : iso;
  }

  // Datas sempre como string AAAA-MM-DD; a aritmética passa por UTC só pra não sofrer com fuso/horário de verão.
  function addDays(iso, days) {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().slice(0, 10);
  }

  function daysBetween(from, to) {
    const out = [];
    for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
    return out;
  }

  function todayLocalIso() {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  }

  function tipoCanon(value) {
    const k = keyText(value);
    if (k.includes('EFETIVO')) return 'Efetivo';
    if (k.includes('DIARISTA') || k.includes('SAFRISTA')) return 'Diarista';
    if (k.includes('INTERMITENTE')) return 'Intermitente';
    return String(value || '').trim();
  }

  function isActive(row) {
    const s = keyText(row?.situacao);
    return Boolean(s) && !s.includes('INATIVO') && !s.includes('NAOATIVO') && !s.includes('DESLIG');
  }

  function isClassificador(row) {
    return keyText(row?.cargo).includes('CLASSIFICADOR');
  }

  async function fetchAllRows(table, select, applyQuery, pageSize = 1000) {
    const out = [];
    let from = 0;
    while (true) {
      let query = state.supabase.from(table).select(select).range(from, from + pageSize - 1);
      if (typeof applyQuery === 'function') query = applyQuery(query);
      // desempate: sem chave única a paginação repete/pula linhas (ver dre.js)
      query = query.order('id', { ascending: true });
      const { data, error } = await query;
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      out.push(...rows);
      if (rows.length < pageSize) break;
      from += pageSize;
    }
    return out;
  }

  async function fetchLatestProductionDate() {
    const { data, error } = await state.supabase
      .from('relatorio_resultado_diario')
      .select('data')
      .order('data', { ascending: false })
      .limit(1);
    if (error) throw error;
    return dateKey(data?.[0]?.data) || null;
  }

  function loadProducao(from, to) {
    return fetchAllRows(
      'relatorio_resultado_diario',
      'data,coordenacao,funcionario,toneladas,valor_embarcado',
      (q) => q.gte('data', from).lte('data', to)
    );
  }

  function loadColaboradores() {
    return fetchAllRows(
      'colaboradores',
      'cpf,nome,situacao,admissao,desligamento,coordenacao,tipo,cargo,salario',
      (q) => q
    );
  }

  function custoDoDia(tipo, salario) {
    const valor = toNumber(salario);
    if (tipo === 'Efetivo') return valor / 30;
    if (tipo === 'Diarista' || tipo === 'Intermitente') return valor;
    return 0;
  }

  function buildRows(prodRows, colabRows, from, to) {
    const byName = new Map();
    for (const c of colabRows) {
      const k = keyText(c.nome);
      if (!k) continue;
      // Homônimo: prefere o cadastro ativo.
      const current = byName.get(k);
      if (!current || (!isActive(current) && isActive(c))) byName.set(k, c);
    }

    // 1) Produção agregada por (data, colaborador)
    const agg = new Map();
    for (const r of prodRows) {
      const data = dateKey(r.data);
      const nome = String(r.funcionario || '').trim();
      const nameKey = keyText(nome);
      if (!data || !nameKey) continue;
      const ton = toNumber(r.toneladas);
      const fat = toNumber(r.valor_embarcado);
      if (ton <= 0 && fat <= 0) continue;
      const key = `${data}|${nameKey}`;
      let item = agg.get(key);
      if (!item) {
        item = { data, nome, nameKey, producao: 0, faturado: 0, coords: new Map() };
        agg.set(key, item);
      }
      item.producao += ton;
      item.faturado += fat;
      const coord = String(r.coordenacao || '').trim();
      if (coord) item.coords.set(coord, (item.coords.get(coord) || 0) + ton);
    }

    const rows = [];
    const produziu = new Set();
    for (const item of agg.values()) {
      const colab = byName.get(item.nameKey);
      const tipo = colab ? tipoCanon(colab.tipo) : '';
      const coordProd = [...item.coords.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
      produziu.add(`${item.data}|${item.nameKey}`);
      rows.push({
        data: item.data,
        nome: item.nome,
        coordenacao: coordProd || colab?.coordenacao || '',
        tipo: tipo || '—',
        producao: item.producao,
        faturado: item.faturado,
        custo: colab ? custoDoDia(tipo, colab.salario) : 0,
        semCadastro: !colab,
        ocioso: false
      });
    }

    // 2) Efetivos classificadores sem produção no dia (custo sem receita)
    const hoje = todayLocalIso();
    const efetivos = colabRows.filter((c) => tipoCanon(c.tipo) === 'Efetivo' && isClassificador(c) && keyText(c.nome));
    for (const day of daysBetween(from, to)) {
      if (day > hoje) break;
      for (const c of efetivos) {
        const adm = dateKey(c.admissao);
        const desl = dateKey(c.desligamento);
        if (adm && adm > day) continue;
        if (desl ? desl < day : !isActive(c)) continue;
        if (produziu.has(`${day}|${keyText(c.nome)}`)) continue;
        rows.push({
          data: day,
          nome: String(c.nome).trim(),
          coordenacao: String(c.coordenacao || '').trim(),
          tipo: 'Efetivo',
          producao: 0,
          faturado: 0,
          custo: custoDoDia('Efetivo', c.salario),
          semCadastro: false,
          ocioso: true
        });
      }
    }

    return rows;
  }

  function filteredRows() {
    const busca = keyText(state.busca);
    return state.rows.filter((r) => {
      if (!state.incluirOciosos && r.ocioso) return false;
      if (state.coordenacao && r.coordenacao !== state.coordenacao) return false;
      if (state.tipo && r.tipo !== state.tipo) return false;
      if (busca && !keyText(r.nome).includes(busca)) return false;
      return true;
    });
  }

  function saldo(r) {
    return r.faturado - r.custo;
  }

  function sortRows(rows) {
    const { key, dir } = state.sort;
    const signal = dir === 'asc' ? 1 : -1;
    const textKeys = new Set(['nome', 'coordenacao', 'tipo']);
    return [...rows].sort((a, b) => {
      if (key === 'data') {
        if (a.data !== b.data) return signal * a.data.localeCompare(b.data);
        return b.producao - a.producao || a.nome.localeCompare(b.nome, 'pt-BR');
      }
      if (textKeys.has(key)) {
        const c = String(a[key]).localeCompare(String(b[key]), 'pt-BR');
        return c ? signal * c : a.data.localeCompare(b.data);
      }
      const av = key === 'saldo' ? saldo(a) : a[key];
      const bv = key === 'saldo' ? saldo(b) : b[key];
      if (av === bv) return a.data.localeCompare(b.data) || a.nome.localeCompare(b.nome, 'pt-BR');
      return signal * (av - bv);
    });
  }

  function totalsOf(rows) {
    return rows.reduce((t, r) => {
      t.producao += r.producao;
      t.faturado += r.faturado;
      t.custo += r.custo;
      return t;
    }, { producao: 0, faturado: 0, custo: 0 });
  }

  function saldoClass(value) {
    return value < 0 ? 'prd-neg' : value > 0 ? 'prd-pos' : '';
  }

  function sortMark(key) {
    return state.sort.key === key ? (state.sort.dir === 'asc' ? ' ▲' : ' ▼') : '';
  }

  function renderKpis(rows) {
    const t = totalsOf(rows);
    const s = t.faturado - t.custo;
    const margem = t.faturado > 0 ? (s / t.faturado) * 100 : 0;
    const colabs = new Set(rows.filter((r) => !r.ocioso).map((r) => keyText(r.nome))).size;
    return `
      <div class="prd-kpis">
        <article class="prd-card"><span>Produção</span><strong>${fmtNumber(t.producao, 2)} t</strong><small>${fmtNumber(colabs, 0)} colaboradores com produção</small></article>
        <article class="prd-card"><span>Faturado</span><strong>${fmtMoney(t.faturado)}</strong><small>Valor embarcado no Resultado Diário</small></article>
        <article class="prd-card"><span>Custo</span><strong>${fmtMoney(t.custo)}</strong><small>Diárias + salário ÷ 30 dos efetivos</small></article>
        <article class="prd-card ${s < 0 ? 'neg' : 'pos'}"><span>Saldo</span><strong>${fmtMoney(s)}</strong><small>Margem ${fmtNumber(margem, 1)}%</small></article>
      </div>
    `;
  }

  function tipoTag(tipo) {
    const cls = keyText(tipo).toLowerCase();
    return `<span class="prd-tag ${TIPOS.map(keyText).includes(keyText(tipo)) ? esc(cls) : ''}">${esc(tipo)}</span>`;
  }

  function dataRow(r) {
    const s = saldo(r);
    return `
      <tr>
        <td>${esc(brDate(r.data))}</td>
        <td class="nome">${esc(r.nome)}${r.semCadastro ? ' <span class="prd-muted" title="Colaborador sem cadastro correspondente: custo não calculado">(sem cadastro)</span>' : ''}</td>
        <td>${esc(r.coordenacao || '-')}</td>
        <td style="text-align:center">${tipoTag(r.tipo)}</td>
        <td class="num">${r.producao ? fmtNumber(r.producao, 2) : '<span class="prd-muted">-</span>'}</td>
        <td class="num">${r.faturado ? fmtMoney(r.faturado) : '<span class="prd-muted">-</span>'}</td>
        <td class="num">${r.custo ? fmtMoney(r.custo) : '<span class="prd-muted">-</span>'}</td>
        <td class="num ${saldoClass(s)}">${fmtMoney(s)}</td>
      </tr>
    `;
  }

  function totalRow(label, cls, t) {
    const s = t.faturado - t.custo;
    return `
      <tr class="${cls}">
        <td colspan="4">${esc(label)}</td>
        <td class="num">${fmtNumber(t.producao, 2)}</td>
        <td class="num">${fmtMoney(t.faturado)}</td>
        <td class="num">${fmtMoney(t.custo)}</td>
        <td class="num">${fmtMoney(s)}</td>
      </tr>
    `;
  }

  function renderTable(rows) {
    const sorted = sortRows(rows);
    const shown = sorted.slice(0, MAX_RENDER_ROWS);
    const porData = state.sort.key === 'data';

    const headers = [
      ['data', 'Data'], ['nome', 'Colaborador'], ['coordenacao', 'Coordenação'], ['tipo', 'Tipo'],
      ['producao', 'Produção (t)'], ['faturado', 'Faturado'], ['custo', 'Custo'], ['saldo', 'Saldo']
    ].map(([key, label]) => `<th class="sortable" data-sort="${key}">${label}${sortMark(key)}</th>`).join('');

    let body = '';
    if (!shown.length) {
      body = '<tr class="empty"><td colspan="8">Nenhum registro localizado para os filtros selecionados.</td></tr>';
    } else if (porData) {
      // Subtotal por data (as linhas já vêm agrupadas pela ordenação por data).
      let i = 0;
      while (i < shown.length) {
        const day = shown[i].data;
        const group = [];
        while (i < shown.length && shown[i].data === day) group.push(shown[i++]);
        body += group.map(dataRow).join('');
        body += totalRow(`Total ${brDate(day)} · ${group.length} linha(s)`, 'sub', totalsOf(group));
      }
    } else {
      body = shown.map(dataRow).join('');
    }
    if (shown.length) body += totalRow('Total do período', 'total', totalsOf(rows));

    const cortado = sorted.length > shown.length
      ? ` Mostrando as primeiras ${fmtNumber(shown.length, 0)} de ${fmtNumber(sorted.length, 0)} linhas — os totais e a exportação consideram todas.`
      : '';

    return `
      <section class="prd-table-card">
        <div class="prd-table-top">
          <div>
            <h2>Produtividade por colaborador e data</h2>
            <p>${fmtNumber(rows.length, 0)} linha(s). Clique nos cabeçalhos para ordenar.</p>
          </div>
          <button class="prd-btn secondary" type="button" data-prd-export ${rows.length ? '' : 'disabled'}>Exportar CSV</button>
        </div>
        <div class="prd-table-wrap">
          <table class="prd-table">
            <thead><tr>${headers}</tr></thead>
            <tbody>${body}</tbody>
          </table>
        </div>
        <div class="prd-footer-note">Faturado = valor embarcado do Resultado Diário. Custo = diária (diarista/intermitente, só nos dias com produção) ou salário ÷ 30 (efetivo, todos os dias). Efetivos classificadores sem produção aparecem com faturado zero. Despesas de viagem/hospedagem não entram — o GRM só as informa por coordenação.${esc(cortado)}</div>
      </section>
    `;
  }

  function render(container) {
    const rows = filteredRows();
    const coordOptions = ['<option value="">Todas</option>', ...state.coordenacoes.map((c) => `<option value="${esc(c)}" ${state.coordenacao === c ? 'selected' : ''}>${esc(c)}</option>`)].join('');
    const tipoOptions = ['<option value="">Todos</option>', ...TIPOS.map((t) => `<option value="${t}" ${state.tipo === t ? 'selected' : ''}>${t}</option>`)].join('');

    container.innerHTML = `
      <section class="prd-page">
        <div class="prd-filter-card">
          <div class="prd-filters">
            <div class="prd-field"><label>De</label><input type="date" data-prd-from value="${esc(state.from)}" /></div>
            <div class="prd-field"><label>Até</label><input type="date" data-prd-to value="${esc(state.to)}" /></div>
            <div class="prd-field"><label>Coordenação</label><select data-prd-coord>${coordOptions}</select></div>
            <div class="prd-field"><label>Tipo</label><select data-prd-tipo>${tipoOptions}</select></div>
            <div class="prd-field"><label>Colaborador</label><input type="search" data-prd-busca placeholder="Buscar nome" value="${esc(state.busca)}" /></div>
            <button class="prd-btn secondary" type="button" data-prd-today ${state.loading ? 'disabled' : ''}>Último dia</button>
            <button class="prd-btn" type="button" data-prd-apply ${state.loading ? 'disabled' : ''}>${state.loading ? 'Carregando...' : 'Aplicar'}</button>
          </div>
          <label class="prd-check"><input type="checkbox" data-prd-ociosos ${state.incluirOciosos ? 'checked' : ''} /> Incluir efetivos classificadores sem produção (custo sem faturamento)</label>
        </div>

        ${state.error ? `<div class="prd-status err"><strong>Erro:</strong> ${esc(state.error)}</div>` : ''}
        ${state.loading ? '<div class="prd-status"><strong>Carregando dados...</strong> Consultando produção e cadastro de colaboradores.</div>' : ''}
        ${renderKpis(rows)}
        ${renderTable(rows)}
      </section>
    `;
    bind(container);
  }

  function readFilters(container) {
    state.from = dateKey(container.querySelector('[data-prd-from]')?.value) || state.from;
    state.to = dateKey(container.querySelector('[data-prd-to]')?.value) || state.to;
  }

  function csvCell(value) {
    const s = String(value ?? '');
    return /[;"\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  }

  function exportCsv() {
    const rows = sortRows(filteredRows());
    const num = (v) => toNumber(v).toFixed(2).replace('.', ',');
    const lines = [['Data', 'Colaborador', 'Coordenação', 'Tipo', 'Produção (t)', 'Faturado', 'Custo', 'Saldo'].join(';')];
    for (const r of rows) {
      lines.push([brDate(r.data), r.nome, r.coordenacao, r.tipo, num(r.producao), num(r.faturado), num(r.custo), num(saldo(r))].map(csvCell).join(';'));
    }
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `produtividade_${state.from}_${state.to}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function bind(container) {
    container.querySelector('[data-prd-apply]')?.addEventListener('click', () => {
      readFilters(container);
      load(container);
    });
    container.querySelector('[data-prd-today]')?.addEventListener('click', async () => {
      try {
        const latest = await fetchLatestProductionDate();
        if (latest) { state.from = latest; state.to = latest; }
      } catch (error) {
        console.warn('[PRODUTIVIDADE] Falha ao buscar a última data com produção.', error);
      }
      load(container);
    });
    // Filtros locais: só re-renderizam, sem nova consulta.
    container.querySelector('[data-prd-coord]')?.addEventListener('change', (e) => { state.coordenacao = e.target.value; render(container); });
    container.querySelector('[data-prd-tipo]')?.addEventListener('change', (e) => { state.tipo = e.target.value; render(container); });
    container.querySelector('[data-prd-ociosos]')?.addEventListener('change', (e) => { state.incluirOciosos = e.target.checked; render(container); });
    const busca = container.querySelector('[data-prd-busca]');
    busca?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      state.busca = busca.value;
      render(container);
      const next = container.querySelector('[data-prd-busca]');
      next?.focus();
      next?.setSelectionRange(next.value.length, next.value.length);
    });
    busca?.addEventListener('change', () => { state.busca = busca.value; render(container); });
    container.querySelector('[data-prd-export]')?.addEventListener('click', exportCsv);
    container.querySelectorAll('[data-sort]').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.getAttribute('data-sort') || 'data';
        if (state.sort.key === key) {
          state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
        } else {
          state.sort.key = key;
          state.sort.dir = ['data', 'nome', 'coordenacao', 'tipo'].includes(key) ? 'asc' : 'desc';
        }
        render(container);
      });
    });
  }

  async function load(container) {
    // Consultas em sequência (ex.: Aplicar logo após abrir) podem terminar fora de ordem;
    // só a última pode gravar o resultado.
    const seq = ++state.loadSeq;
    try {
      if (!state.supabase) throw new Error('Cliente Supabase não disponível.');
      if (!state.from || !state.to) throw new Error('Informe o período.');
      if (state.from > state.to) [state.from, state.to] = [state.to, state.from];
      if (daysBetween(state.from, state.to).length > MAX_DAYS) {
        throw new Error(`Período máximo de ${MAX_DAYS} dias. Reduza o intervalo.`);
      }
      state.loading = true;
      state.error = null;
      render(container);

      const [prodRows, colabRows] = await Promise.all([
        loadProducao(state.from, state.to),
        loadColaboradores()
      ]);
      if (seq !== state.loadSeq) return;
      state.rows = buildRows(prodRows, colabRows, state.from, state.to);
      state.coordenacoes = [...new Set(state.rows.map((r) => r.coordenacao).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
      if (state.coordenacao && !state.coordenacoes.includes(state.coordenacao)) state.coordenacao = '';
    } catch (error) {
      if (seq !== state.loadSeq) return;
      console.error('[PRODUTIVIDADE]', error);
      state.error = error?.message || 'Falha ao carregar produtividade.';
      state.rows = [];
    } finally {
      if (seq === state.loadSeq) {
        state.loading = false;
        render(container);
      }
    }
  }

  async function openHome(container, opts = {}) {
    injectStyle();
    state.supabase = opts.supabase || opts.api?.supabase;
    if (!state.initialized) {
      // Abre no último dia com produção (o Resultado Diário do dia corrente pode ainda não ter entrado).
      let latest = null;
      try { latest = await fetchLatestProductionDate(); } catch (error) {
        console.warn('[PRODUTIVIDADE] Falha ao buscar a última data com produção.', error);
      }
      state.from = latest || todayLocalIso();
      state.to = state.from;
      state.initialized = true;
    }
    render(container);
    load(container);
  }

  window.PRODUTIVIDADE = { openHome };
})();
