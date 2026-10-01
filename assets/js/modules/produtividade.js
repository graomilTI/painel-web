/* assets/js/modules/produtividade.js
 * Módulo Diretoria > Produtividade
 * Relatório por data: Colaborador · Tipo · Produção · Faturado · Custo · Saldo.
 *
 * Fontes:
 *  - Produção e Faturado: public.relatorio_resultado_diario (toneladas; Faturado =
 *    toneladas × valor_ton, definido pela diretoria em 01/10).
 *  - Tipo e remuneração: public.colaboradores (quadro ao vivo do sync GRM). O
 *    historico_colaboradores está sem importação desde setembro, então não é usado.
 *
 * Custo do dia = TODOS os custos aprovados no Caixa Operacional do GRM para o colaborador na data
 * (Café, Almoço, Janta, Pernoite, Serviços Terceirizados dos diaristas e Salário de Intermitente),
 * lidos de grm_despesas_retroativas_auditoria via RPC produtividade_custos_aprovados, mais:
 *  - Efetivo (exceto cargo Administrativo): salário ÷ 30 por dia listado. O efetivo aparece em todo dia útil (seg–sex), com ou
 *    sem produção, porque o custo existe mesmo sem produtividade (faturado 0, saldo negativo);
 *    sábado/domingo só entra se produziu. Dá pra esconder as linhas sem produção pelo filtro.
 */
(function () {
  'use strict';

  const STYLE_ID = 'produtividade-module-style-v1';
  const MAX_DAYS = 31;
  const MAX_RENDER_ROWS = 2000;
  const TIPOS = ['Efetivo', 'Diarista', 'Intermitente'];

  // Atalhos da aba "Produção por período": janela móvel terminando no último dia com produção.
  const PRESETS = [
    { key: '7', label: '7 dias', days: 7 },
    { key: '15', label: '15 dias', days: 15 },
    { key: '30', label: 'Mensal', days: 30 },
    { key: '90', label: 'Trimestral', days: 90 },
    { key: '180', label: 'Semestral', days: 180 },
    { key: '365', label: 'Anual', days: 365 },
    { key: 'custom', label: 'Datas selecionadas', days: 0 }
  ];
  const MAX_PERIODO_DAYS = 366;

  const state = {
    tab: 'diario',
    ultimaData: '',
    colabRows: null,
    periodo: { preset: '7', from: '', to: '', rows: [], sort: { key: 'producao', dir: 'desc' }, loadSeq: 0 },
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
      .prd-table tr.sub td{background:rgba(22,101,52,.35)!important;font-weight:950;color:#dcfce7}.prd-table tr.total td{background:rgba(22,101,52,.55)!important;font-weight:950;color:#dcfce7}.prd-table tr.empty td{background:transparent!important;text-align:center;color:var(--muted)}.prd-pos{color:#86efac}.prd-neg{color:#fca5a5}.prd-table td.prd-inativo{color:#f87171;font-weight:900}.prd-muted{color:#6b7280}.prd-tag{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:900;background:rgba(148,163,184,.14)}.prd-tag.efetivo{background:rgba(59,130,246,.2);color:#bfdbfe}.prd-tag.diarista{background:rgba(250,204,21,.16);color:#fde68a}.prd-tag.intermitente{background:rgba(168,85,247,.2);color:#e9d5ff}
      .prd-tabs{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap}.prd-tab{height:40px;padding:0 18px;border-radius:14px;border:1px solid rgba(255,255,255,0.08);background:#0d0d18;color:#9ca3af;font-weight:900;cursor:pointer}.prd-tab.active{background:linear-gradient(135deg,#166534,#22c55e);color:#052e16;border-color:transparent}
      .prd-chips{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}.prd-chip{height:36px;padding:0 14px;border-radius:999px;border:1px solid rgba(255,255,255,0.12);background:#0d0d18;color:#e2e2f0;font-weight:850;cursor:pointer}.prd-chip.active{background:#166534;color:#dcfce7;border-color:#22c55e}.prd-chip:disabled{opacity:.55;cursor:not-allowed}.prd-range{margin:0 0 12px;color:var(--muted);font-size:12px}.prd-range strong{color:var(--text)}
      .prd-periodo-filters{display:grid;grid-template-columns:repeat(2,minmax(130px,.8fr)) repeat(2,minmax(150px,1fr)) minmax(180px,1.2fr) auto;gap:12px;align-items:end}
      .prd-footer-note{padding:12px 16px;color:var(--muted);border-top:1px solid var(--line);font-size:12px}
      @media(max-width:1180px){.prd-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.prd-filters,.prd-periodo-filters{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:760px){.prd-kpis,.prd-filters,.prd-periodo-filters{grid-template-columns:1fr}.prd-btn{width:100%}}
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

  // Segunda a sexta (a data é AAAA-MM-DD; o dia da semana é calculado em UTC pra não depender do fuso).
  function isDiaUtil(iso) {
    const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
    return dow >= 1 && dow <= 5;
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

  // Administrativo e equipe da coordenação GERAL ficam fora da lista de efetivos sem produção (decisão da diretoria).
  function isAdministrativo(row) {
    return keyText(row?.cargo).includes('ADMINISTRATIV') || keyText(row?.coordenacao) === 'GERAL';
  }

  // Colaborador com cadastro e situação inativa/desligada (as linhas dele saem em vermelho).
  function inativoDe(colab) {
    return Boolean(colab) && !isActive(colab);
  }

  function isActive(row) {
    const s = keyText(row?.situacao);
    return Boolean(s) && !s.includes('INATIVO') && !s.includes('NAOATIVO') && !s.includes('DESLIG');
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
      'data,coordenacao,funcionario,toneladas,valor_ton,valor_embarcado',
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

  // Custos aprovados no Caixa do GRM (função protegida: a tabela de auditoria não é legível pelo front).
  async function loadCustosAprovados(from, to, porDia) {
    const pageSize = 1000;
    const out = [];
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await state.supabase
        .rpc('produtividade_custos_aprovados', { p_inicio: from, p_fim: to, p_por_dia: porDia })
        .range(offset, offset + pageSize - 1);
      if (error) throw new Error(`Não foi possível ler os custos aprovados: ${error.message || error}`);
      const rows = Array.isArray(data) ? data : [];
      out.push(...rows);
      if (rows.length < pageSize) break;
    }
    return out;
  }

  async function ensureCobertura() {
    if (state.custosCobertura !== undefined) return state.custosCobertura;
    const { data, error } = await state.supabase.rpc('produtividade_custos_cobertura');
    if (error) throw new Error(`Não foi possível ler a cobertura dos custos: ${error.message || error}`);
    const row = Array.isArray(data) ? data[0] : data;
    state.custosCobertura = row?.inicio ? { inicio: dateKey(row.inicio), fim: dateKey(row.fim) } : null;
    return state.custosCobertura;
  }

  // Aviso quando o período pedido não está inteiro dentro do intervalo em que há custos aprovados registrados.
  function coberturaAviso(from, to) {
    const c = state.custosCobertura;
    if (c === undefined) return '';
    if (!c) return 'Não há custos aprovados do Caixa registrados; o custo mostra apenas o salário ÷ 30 dos efetivos.';
    if (from >= c.inicio && to <= c.fim) return '';
    return `Custos aprovados do Caixa registrados de ${brDate(c.inicio)} a ${brDate(c.fim)}. Fora dessa faixa o custo mostra apenas o salário ÷ 30 dos efetivos.`;
  }

  // Só o efetivo tem custo "por fora" do Caixa (salário mensal rateado em 30 dias).
  // Diarista e intermitente são pagos pelo próprio Caixa (Serviços Terceirizados / Salário de
  // Intermitente) e entram em "aprovado".
  function custoSalarioDia(tipo, salario) {
    return tipo === 'Efetivo' ? toNumber(salario) / 30 : 0;
  }

  function cpfDigits(value) {
    return String(value ?? '').replace(/\D/g, '');
  }

  function indexColaboradores(colabRows) {
    const byName = new Map();
    const byCpf = new Map();
    for (const c of colabRows) {
      const k = keyText(c.nome);
      if (!k) continue;
      // Homônimo: prefere o cadastro ativo.
      const current = byName.get(k);
      if (!current || (!isActive(current) && isActive(c))) byName.set(k, c);
      const cpf = cpfDigits(c.cpf);
      if (cpf) {
        const currentCpf = byCpf.get(cpf);
        if (!currentCpf || (!isActive(currentCpf) && isActive(c))) byCpf.set(cpf, c);
      }
    }
    return { byName, byCpf };
  }

  // Custos aprovados do Caixa, reindexados pelo nome normalizado do colaborador
  // (mesma chave da produção). Chave: "AAAA-MM-DD|NOME" no relatório diário, "NOME" no período.
  function indexCustos(custoRows, byCpf, porDia) {
    const out = new Map();
    for (const r of custoRows) {
      const colab = byCpf.get(cpfDigits(r.cpf));
      const nome = String(colab?.nome || r.colaborador || '').trim();
      const nameKey = keyText(nome);
      if (!nameKey) continue;
      const key = porDia ? `${dateKey(r.data_referencia)}|${nameKey}` : nameKey;
      const item = out.get(key) || { total: 0, dias: 0, nome, colab };
      item.total += toNumber(r.total_aprovado);
      item.dias += toNumber(r.dias);
      out.set(key, item);
    }
    return out;
  }

  function buildRows(prodRows, colabRows, from, to, custoRows) {
    const { byName, byCpf } = indexColaboradores(colabRows);
    const custos = indexCustos(custoRows, byCpf, true);
    const usados = new Set();
    const aprovadoDe = (data, nameKey) => {
      const key = `${data}|${nameKey}`;
      usados.add(key);
      return custos.get(key)?.total || 0;
    };

    // 1) Produção agregada por (data, colaborador)
    const agg = new Map();
    for (const r of prodRows) {
      const data = dateKey(r.data);
      const nome = String(r.funcionario || '').trim();
      const nameKey = keyText(nome);
      if (!data || !nameKey) continue;
      const ton = toNumber(r.toneladas);
      // Faturado = toneladas × R$/Ton; a linha só conta como produção se tiver toneladas ou valor embarcado.
      const fat = ton * toNumber(r.valor_ton);
      if (ton <= 0 && toNumber(r.valor_embarcado) <= 0) continue;
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
      const custoAprovado = aprovadoDe(item.data, item.nameKey);
      const custoSalario = colab ? custoSalarioDia(tipo, colab.salario) : 0;
      rows.push({
        data: item.data,
        nome: item.nome,
        coordenacao: coordProd || colab?.coordenacao || '',
        tipo: tipo || '—',
        producao: item.producao,
        faturado: item.faturado,
        custoAprovado,
        custoSalario,
        custo: custoAprovado + custoSalario,
        semCadastro: !colab,
        inativo: inativoDe(colab),
        ocioso: false
      });
    }

    // 2) Efetivos sem produção em dia útil (custo sem receita)
    const hoje = todayLocalIso();
    const efetivos = colabRows.filter((c) => tipoCanon(c.tipo) === 'Efetivo' && !isAdministrativo(c) && keyText(c.nome));
    for (const day of daysBetween(from, to)) {
      if (day > hoje) break;
      if (!isDiaUtil(day)) continue;
      for (const c of efetivos) {
        const adm = dateKey(c.admissao);
        const desl = dateKey(c.desligamento);
        if (adm && adm > day) continue;
        if (desl ? desl < day : !isActive(c)) continue;
        if (produziu.has(`${day}|${keyText(c.nome)}`)) continue;
        const custoAprovado = aprovadoDe(day, keyText(c.nome));
        const custoSalario = custoSalarioDia('Efetivo', c.salario);
        rows.push({
          data: day,
          nome: String(c.nome).trim(),
          coordenacao: String(c.coordenacao || '').trim(),
          tipo: 'Efetivo',
          producao: 0,
          faturado: 0,
          custoAprovado,
          custoSalario,
          custo: custoAprovado + custoSalario,
          semCadastro: false,
          inativo: inativoDe(c),
          ocioso: true
        });
      }
    }

    // 3) Custo aprovado de quem não produziu nem é efetivo classificador (ex.: diarista pago sem
    // produção lançada no dia). Fica na lista pra que o total bata com o Caixa.
    for (const [key, item] of custos) {
      if (usados.has(key)) continue;
      const [data] = key.split('|');
      if (data < from || data > to || !item.total) continue;
      const tipo = item.colab ? tipoCanon(item.colab.tipo) : '';
      rows.push({
        data,
        nome: item.nome,
        coordenacao: String(item.colab?.coordenacao || '').trim(),
        tipo: tipo || '—',
        producao: 0,
        faturado: 0,
        custoAprovado: item.total,
        custoSalario: 0,
        custo: item.total,
        semCadastro: !item.colab,
        inativo: inativoDe(item.colab),
        ocioso: true
      });
    }

    return rows;
  }

  function filteredRows(source = state.rows) {
    const busca = keyText(state.busca);
    return source.filter((r) => {
      if (!state.incluirOciosos && r.ocioso) return false;
      if (state.coordenacao && r.coordenacao !== state.coordenacao) return false;
      if (state.tipo && r.tipo !== state.tipo) return false;
      if (busca && !keyText(r.nome).includes(busca)) return false;
      return true;
    });
  }

  function custoTitulo(r) {
    return `Aprovado no Caixa: ${fmtMoney(r.custoAprovado || 0)} · Salário ÷ 30 (efetivo): ${fmtMoney(r.custoSalario || 0)}`;
  }

  function avisoCobertura(periodo) {
    const range = periodo ? state.periodo : state;
    const aviso = range.from && range.to ? coberturaAviso(range.from, range.to) : '';
    return aviso ? `<div class="prd-status"><strong>Atenção:</strong> ${esc(aviso)}</div>` : '';
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

  // ---------- Aba "Produção por período" ----------

  function presetRange(preset) {
    const def = PRESETS.find((p) => p.key === preset);
    const end = state.ultimaData || todayLocalIso();
    return { from: addDays(end, -((def?.days || 1) - 1)), to: end };
  }

  function loadProducaoPeriodo(from, to) {
    const pageSize = 1000;
    return (async () => {
      const out = [];
      for (let offset = 0; ; offset += pageSize) {
        // A RPC já devolve ordenada por colaborador, então a paginação é estável.
        const { data, error } = await state.supabase
          .rpc('produtividade_producao_periodo', { p_inicio: from, p_fim: to })
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        const rows = Array.isArray(data) ? data : [];
        out.push(...rows);
        if (rows.length < pageSize) break;
      }
      return out;
    })();
  }

  // Dias úteis (seg–sex) do período em que o efetivo estava no quadro (admissão/desligamento) e que já passaram.
  function diasNoQuadro(colab, from, to) {
    let ini = from;
    let fim = to < todayLocalIso() ? to : todayLocalIso();
    const adm = dateKey(colab.admissao);
    const desl = dateKey(colab.desligamento);
    if (adm && adm > ini) ini = adm;
    if (desl && desl < fim) fim = desl;
    if (!desl && !isActive(colab)) return 0;
    return ini > fim ? 0 : daysBetween(ini, fim).filter(isDiaUtil).length;
  }

  function buildPeriodoRows(rpcRows, colabRows, from, to, custoRows) {
    const { byName, byCpf } = indexColaboradores(colabRows);
    const custos = indexCustos(custoRows, byCpf, false);
    const usados = new Set();
    const aprovadoDe = (nameKey) => {
      usados.add(nameKey);
      return custos.get(nameKey)?.total || 0;
    };

    const rows = [];
    const produziu = new Set();
    for (const r of rpcRows) {
      const nameKey = keyText(r.funcionario);
      if (!nameKey) continue;
      const colab = byName.get(nameKey);
      const tipo = colab ? tipoCanon(colab.tipo) : '';
      const custoAprovado = aprovadoDe(nameKey);
      const diasQuadro = colab ? diasNoQuadro(colab, from, to) : 0;
      const custoSalario = colab ? custoSalarioDia(tipo, colab.salario) * (diasQuadro + toNumber(r.dias_fim_semana)) : 0;
      // Dias folgados (só efetivo): dias úteis seg–sex no quadro em que não embarcou (produção em fim de semana não abate).
      const diasFolgados = tipo === 'Efetivo' ? Math.max(0, diasQuadro - (toNumber(r.dias) - toNumber(r.dias_fim_semana))) : 0;
      produziu.add(nameKey);
      rows.push({
        nome: String(r.funcionario).trim(),
        coordenacao: String(r.coordenacao || colab?.coordenacao || '').trim(),
        tipo: tipo || '—',
        dias: toNumber(r.dias),
        diasFolgados,
        dsr: toNumber(r.dias_fim_semana),
        producao: toNumber(r.toneladas),
        faturado: toNumber(r.valor_faturado),
        custoAprovado,
        custoSalario,
        custo: custoAprovado + custoSalario,
        semCadastro: !colab,
        inativo: inativoDe(colab),
        ocioso: false
      });
    }

    for (const c of colabRows) {
      if (tipoCanon(c.tipo) !== 'Efetivo' || isAdministrativo(c)) continue;
      const nameKey = keyText(c.nome);
      if (!nameKey || produziu.has(nameKey)) continue;
      const dias = diasNoQuadro(c, from, to);
      if (!dias) continue;
      const custoAprovado = aprovadoDe(nameKey);
      const custoSalario = custoSalarioDia('Efetivo', c.salario) * dias;
      rows.push({
        nome: String(c.nome).trim(),
        coordenacao: String(c.coordenacao || '').trim(),
        tipo: 'Efetivo',
        dias: 0,
        diasFolgados: dias,
        dsr: 0,
        producao: 0,
        faturado: 0,
        custoAprovado,
        custoSalario,
        custo: custoAprovado + custoSalario,
        semCadastro: false,
        inativo: inativoDe(c),
        ocioso: true
      });
    }

    // Custo aprovado de quem não produziu no período e não é efetivo classificador.
    for (const [nameKey, item] of custos) {
      if (usados.has(nameKey) || !item.total) continue;
      const tipo = item.colab ? tipoCanon(item.colab.tipo) : '';
      rows.push({
        nome: item.nome,
        coordenacao: String(item.colab?.coordenacao || '').trim(),
        tipo: tipo || '—',
        dias: 0,
        diasFolgados: 0,
        dsr: 0,
        producao: 0,
        faturado: 0,
        custoAprovado: item.total,
        custoSalario: 0,
        custo: item.total,
        semCadastro: !item.colab,
        inativo: inativoDe(item.colab),
        ocioso: true
      });
    }
    return rows;
  }

  function sortPeriodo(rows) {
    const { key, dir } = state.periodo.sort;
    const signal = dir === 'asc' ? 1 : -1;
    const value = (r) => (key === 'saldo' ? saldo(r) : key === 'media' ? (r.dias ? r.producao / r.dias : 0) : r[key]);
    return [...rows].sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      if (typeof av === 'string') {
        const c = av.localeCompare(String(bv), 'pt-BR');
        return c ? signal * c : a.nome.localeCompare(b.nome, 'pt-BR');
      }
      if (av === bv) return a.nome.localeCompare(b.nome, 'pt-BR');
      return signal * (av - bv);
    });
  }

  function periodoRow(r) {
    const s = saldo(r);
    const media = r.dias ? r.producao / r.dias : 0;
    return `
      <tr>
        <td class="nome${r.inativo ? ' prd-inativo' : ''}"${r.inativo ? ' title="Colaborador inativo"' : ''}>${esc(r.nome)}${r.semCadastro ? ' <span class="prd-muted" title="Colaborador sem cadastro correspondente: custo não calculado">(sem cadastro)</span>' : ''}</td>
        <td>${esc(r.coordenacao || '-')}</td>
        <td style="text-align:center">${tipoTag(r.tipo)}</td>
        <td class="num">${r.dias ? fmtNumber(r.dias, 0) : '<span class="prd-muted">-</span>'}</td>
        <td class="num" title="Dias úteis (seg–sex) no quadro em que o efetivo não embarcou">${r.diasFolgados ? fmtNumber(r.diasFolgados, 0) : '<span class="prd-muted">-</span>'}</td>
        <td class="num" title="Dias trabalhados em sábado ou domingo">${r.dsr ? fmtNumber(r.dsr, 0) : '<span class="prd-muted">-</span>'}</td>
        <td class="num">${r.producao ? fmtNumber(r.producao, 2) : '<span class="prd-muted">-</span>'}</td>
        <td class="num">${media ? fmtNumber(media, 2) : '<span class="prd-muted">-</span>'}</td>
        <td class="num">${r.faturado ? fmtMoney(r.faturado) : '<span class="prd-muted">-</span>'}</td>
        <td class="num" title="${esc(custoTitulo(r))}">${r.custo ? fmtMoney(r.custo) : '<span class="prd-muted">-</span>'}</td>
        <td class="num ${saldoClass(s)}">${fmtMoney(s)}</td>
      </tr>
    `;
  }

  function renderPeriodoTable(rows) {
    const p = state.periodo;
    const sorted = sortPeriodo(rows);
    const shown = sorted.slice(0, MAX_RENDER_ROWS);
    const mark = (key) => (p.sort.key === key ? (p.sort.dir === 'asc' ? ' ▲' : ' ▼') : '');
    const headers = [
      ['nome', 'Colaborador'], ['coordenacao', 'Coordenação'], ['tipo', 'Tipo'], ['dias', 'Produção'],
      ['diasFolgados', 'Folga'], ['dsr', 'DSR'], ['producao', 'Tons'], ['media', 'Média t/dia'], ['faturado', 'Faturado'], ['custo', 'Custo'], ['saldo', 'Saldo']
    ].map(([key, label]) => `<th class="sortable" data-sort-periodo="${key}">${label}${mark(key)}</th>`).join('');

    const t = totalsOf(rows);
    const diasTotal = rows.reduce((n, r) => n + r.dias, 0);
    const folgadosTotal = rows.reduce((n, r) => n + r.diasFolgados, 0);
    const dsrTotal = rows.reduce((n, r) => n + r.dsr, 0);
    const body = shown.length
      ? shown.map(periodoRow).join('') + `
        <tr class="total">
          <td colspan="3">Total do período</td>
          <td class="num">${fmtNumber(diasTotal, 0)}</td>
          <td class="num">${fmtNumber(folgadosTotal, 0)}</td>
          <td class="num">${fmtNumber(dsrTotal, 0)}</td>
          <td class="num">${fmtNumber(t.producao, 2)}</td>
          <td class="num">${diasTotal ? fmtNumber(t.producao / diasTotal, 2) : '-'}</td>
          <td class="num">${fmtMoney(t.faturado)}</td>
          <td class="num">${fmtMoney(t.custo)}</td>
          <td class="num">${fmtMoney(t.faturado - t.custo)}</td>
        </tr>`
      : '<tr class="empty"><td colspan="11">Nenhum registro localizado para os filtros selecionados.</td></tr>';

    const cortado = sorted.length > shown.length
      ? ` Mostrando as primeiras ${fmtNumber(shown.length, 0)} de ${fmtNumber(sorted.length, 0)} linhas — os totais e a exportação consideram todas.`
      : '';

    return `
      <section class="prd-table-card">
        <div class="prd-table-top">
          <div>
            <h2>Produção por colaborador no período</h2>
            <p>${fmtNumber(rows.length, 0)} colaborador(es). Clique nos cabeçalhos para ordenar.</p>
          </div>
          <button class="prd-btn secondary" type="button" data-prd-export ${rows.length ? '' : 'disabled'}>Exportar CSV</button>
        </div>
        <div class="prd-table-wrap">
          <table class="prd-table" style="min-width:1140px">
            <thead><tr>${headers}</tr></thead>
            <tbody>${body}</tbody>
          </table>
        </div>
        <div class="prd-footer-note">Faturado = toneladas × R$/Ton do Resultado Diário. Custo = tudo que foi aprovado no Caixa Operacional do GRM para o colaborador no período (alimentação, pernoite, serviços terceirizados dos diaristas e salário dos intermitentes) + salário ÷ 30 × dias úteis (seg–sex) no quadro, mais os fins de semana em que produziu (efetivo). Folga = dias úteis (seg–sex) no quadro em que o efetivo não embarcou. DSR = dias trabalhados em sábado e domingo. Passe o mouse sobre o custo para ver a composição.${esc(cortado)}</div>
      </section>
    `;
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
        <article class="prd-card"><span>Faturado</span><strong>${fmtMoney(t.faturado)}</strong><small>Toneladas × R$/Ton do Resultado Diário</small></article>
        <article class="prd-card"><span>Custo</span><strong>${fmtMoney(t.custo)}</strong><small>Aprovado no Caixa + salário ÷ 30 dos efetivos</small></article>
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
        <td class="nome${r.inativo ? ' prd-inativo' : ''}"${r.inativo ? ' title="Colaborador inativo"' : ''}>${esc(r.nome)}${r.semCadastro ? ' <span class="prd-muted" title="Colaborador sem cadastro correspondente: custo não calculado">(sem cadastro)</span>' : ''}</td>
        <td>${esc(r.coordenacao || '-')}</td>
        <td style="text-align:center">${tipoTag(r.tipo)}</td>
        <td class="num">${r.producao ? fmtNumber(r.producao, 2) : '<span class="prd-muted">-</span>'}</td>
        <td class="num">${r.faturado ? fmtMoney(r.faturado) : '<span class="prd-muted">-</span>'}</td>
        <td class="num" title="${esc(custoTitulo(r))}">${r.custo ? fmtMoney(r.custo) : '<span class="prd-muted">-</span>'}</td>
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
      ['producao', 'Tons'], ['faturado', 'Faturado'], ['custo', 'Custo'], ['saldo', 'Saldo']
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
        <div class="prd-footer-note">Faturado = toneladas × R$/Ton do Resultado Diário. Custo = tudo que foi aprovado no Caixa Operacional do GRM para o colaborador na data (alimentação, pernoite, serviços terceirizados dos diaristas e salário dos intermitentes) + salário ÷ 30 do efetivo. Passe o mouse sobre o custo para ver a composição. O efetivo (exceto Administrativo) aparece em todo dia útil, com ou sem produção (faturado zero); sábado e domingo só se produziu.${esc(cortado)}</div>
      </section>
    `;
  }

  function renderCommonFilters(coordOptions, tipoOptions) {
    return `
      <div class="prd-field"><label>Coordenação</label><select data-prd-coord>${coordOptions}</select></div>
      <div class="prd-field"><label>Tipo</label><select data-prd-tipo>${tipoOptions}</select></div>
      <div class="prd-field"><label>Colaborador</label><input type="search" data-prd-busca placeholder="Buscar nome" value="${esc(state.busca)}" /></div>
    `;
  }

  function render(container) {
    const periodo = state.tab === 'periodo';
    const source = periodo ? state.periodo.rows : state.rows;
    const rows = filteredRows(source);
    const coordenacoes = [...new Set(source.map((r) => r.coordenacao).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const coordOptions = ['<option value="">Todas</option>', ...coordenacoes.map((c) => `<option value="${esc(c)}" ${state.coordenacao === c ? 'selected' : ''}>${esc(c)}</option>`)].join('');
    const tipoOptions = ['<option value="">Todos</option>', ...TIPOS.map((t) => `<option value="${t}" ${state.tipo === t ? 'selected' : ''}>${t}</option>`)].join('');
    const ociososCheck = `<label class="prd-check"><input type="checkbox" data-prd-ociosos ${state.incluirOciosos ? 'checked' : ''} /> Incluir colaboradores sem produção (efetivos nos dias úteis e custos aprovados sem faturamento)</label>`;
    const tabs = `
      <div class="prd-tabs">
        <button class="prd-tab ${periodo ? '' : 'active'}" type="button" data-prd-tab="diario">Relatório diário</button>
        <button class="prd-tab ${periodo ? 'active' : ''}" type="button" data-prd-tab="periodo">Produção por período</button>
      </div>`;

    let filterCard;
    if (periodo) {
      const p = state.periodo;
      const custom = p.preset === 'custom';
      filterCard = `
        <div class="prd-filter-card">
          <div class="prd-chips">${PRESETS.map((x) => `<button class="prd-chip ${p.preset === x.key ? 'active' : ''}" type="button" data-prd-preset="${x.key}" ${state.loading ? 'disabled' : ''}>${esc(x.label)}</button>`).join('')}</div>
          <p class="prd-range">Período: <strong>${esc(brDate(p.from))}</strong> a <strong>${esc(brDate(p.to))}</strong>${custom ? '' : ' (termina no último dia com produção)'}</p>
          <div class="prd-periodo-filters">
            <div class="prd-field"><label>De</label><input type="date" data-prd-from value="${esc(p.from)}" ${custom ? '' : 'disabled'} /></div>
            <div class="prd-field"><label>Até</label><input type="date" data-prd-to value="${esc(p.to)}" ${custom ? '' : 'disabled'} /></div>
            ${renderCommonFilters(coordOptions, tipoOptions)}
            <button class="prd-btn" type="button" data-prd-apply ${state.loading || !custom ? 'disabled' : ''}>${state.loading ? 'Carregando...' : 'Aplicar'}</button>
          </div>
          ${ociososCheck}
        </div>`;
    } else {
      filterCard = `
        <div class="prd-filter-card">
          <div class="prd-filters">
            <div class="prd-field"><label>De</label><input type="date" data-prd-from value="${esc(state.from)}" /></div>
            <div class="prd-field"><label>Até</label><input type="date" data-prd-to value="${esc(state.to)}" /></div>
            ${renderCommonFilters(coordOptions, tipoOptions)}
            <button class="prd-btn secondary" type="button" data-prd-today ${state.loading ? 'disabled' : ''}>Último dia</button>
            <button class="prd-btn" type="button" data-prd-apply ${state.loading ? 'disabled' : ''}>${state.loading ? 'Carregando...' : 'Aplicar'}</button>
          </div>
          ${ociososCheck}
        </div>`;
    }

    container.innerHTML = `
      <section class="prd-page">
        ${tabs}
        ${filterCard}
        ${state.error ? `<div class="prd-status err"><strong>Erro:</strong> ${esc(state.error)}</div>` : ''}
        ${state.loading ? '<div class="prd-status"><strong>Carregando dados...</strong> Consultando produção, custos aprovados e cadastro de colaboradores.</div>' : ''}
        ${state.loading || state.error ? '' : avisoCobertura(periodo)}
        ${renderKpis(rows)}
        ${periodo ? renderPeriodoTable(rows) : renderTable(rows)}
      </section>
    `;
    bind(container);
  }

  function readFilters(container) {
    const target = state.tab === 'periodo' ? state.periodo : state;
    target.from = dateKey(container.querySelector('[data-prd-from]')?.value) || target.from;
    target.to = dateKey(container.querySelector('[data-prd-to]')?.value) || target.to;
  }

  function csvCell(value) {
    const s = String(value ?? '');
    return /[;"\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  }

  function downloadCsv(lines, name) {
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportCsv() {
    const num = (v) => toNumber(v).toFixed(2).replace('.', ',');
    if (state.tab === 'periodo') {
      const p = state.periodo;
      const lines = [['Colaborador', 'Coordenação', 'Tipo', 'Produção', 'Folga', 'DSR', 'Tons', 'Média t/dia', 'Faturado', 'Custo', 'Saldo'].join(';')];
      for (const r of sortPeriodo(filteredRows(p.rows))) {
        lines.push([r.nome, r.coordenacao, r.tipo, r.dias, r.diasFolgados, r.dsr, num(r.producao), num(r.dias ? r.producao / r.dias : 0), num(r.faturado), num(r.custo), num(saldo(r))].map(csvCell).join(';'));
      }
      downloadCsv(lines, `produtividade_periodo_${p.from}_${p.to}.csv`);
      return;
    }
    const lines = [['Data', 'Colaborador', 'Coordenação', 'Tipo', 'Tons', 'Faturado', 'Custo', 'Saldo'].join(';')];
    for (const r of sortRows(filteredRows())) {
      lines.push([brDate(r.data), r.nome, r.coordenacao, r.tipo, num(r.producao), num(r.faturado), num(r.custo), num(saldo(r))].map(csvCell).join(';'));
    }
    downloadCsv(lines, `produtividade_${state.from}_${state.to}.csv`);
  }

  function bind(container) {
    container.querySelectorAll('[data-prd-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-prd-tab');
        if (tab === state.tab) return;
        state.tab = tab;
        state.coordenacao = '';
        // Cada aba carrega os seus dados na primeira visita; depois só alterna.
        if (tab === 'periodo' && !state.periodo.from) {
          selectPreset(container, state.periodo.preset);
        } else {
          render(container);
        }
      });
    });
    container.querySelectorAll('[data-prd-preset]').forEach((btn) => {
      btn.addEventListener('click', () => selectPreset(container, btn.getAttribute('data-prd-preset')));
    });
    container.querySelector('[data-prd-apply]')?.addEventListener('click', () => {
      readFilters(container);
      if (state.tab === 'periodo') loadPeriodo(container); else load(container);
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
    container.querySelectorAll('[data-sort-periodo]').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.getAttribute('data-sort-periodo') || 'producao';
        const s = state.periodo.sort;
        if (s.key === key) {
          s.dir = s.dir === 'asc' ? 'desc' : 'asc';
        } else {
          s.key = key;
          s.dir = ['nome', 'coordenacao', 'tipo'].includes(key) ? 'asc' : 'desc';
        }
        render(container);
      });
    });
  }

  async function ensureColaboradores(force) {
    if (force || !state.colabRows) state.colabRows = await loadColaboradores();
    return state.colabRows;
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
        throw new Error(`No relatório diário o período máximo é de ${MAX_DAYS} dias. Para intervalos maiores use a aba "Produção por período".`);
      }
      state.loading = true;
      state.error = null;
      render(container);

      const [prodRows, colabRows, custoRows] = await Promise.all([
        loadProducao(state.from, state.to),
        ensureColaboradores(true),
        loadCustosAprovados(state.from, state.to, true),
        ensureCobertura()
      ]);
      if (seq !== state.loadSeq) return;
      state.rows = buildRows(prodRows, colabRows, state.from, state.to, custoRows);
      if (state.coordenacao && !state.rows.some((r) => r.coordenacao === state.coordenacao)) state.coordenacao = '';
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

  function selectPreset(container, preset) {
    const p = state.periodo;
    p.preset = preset;
    if (preset === 'custom') {
      // Parte do intervalo que já estava na tela; o usuário ajusta as datas e clica em Aplicar.
      if (!p.from) Object.assign(p, presetRange('30'));
      render(container);
      return;
    }
    Object.assign(p, presetRange(preset));
    loadPeriodo(container);
  }

  async function loadPeriodo(container) {
    const p = state.periodo;
    const seq = ++p.loadSeq;
    try {
      if (!state.supabase) throw new Error('Cliente Supabase não disponível.');
      if (!p.from || !p.to) throw new Error('Informe o período.');
      if (p.from > p.to) [p.from, p.to] = [p.to, p.from];
      if (daysBetween(p.from, p.to).length > MAX_PERIODO_DAYS) {
        throw new Error(`Período máximo de ${MAX_PERIODO_DAYS} dias. Reduza o intervalo.`);
      }
      state.loading = true;
      state.error = null;
      render(container);

      const [rpcRows, colabRows, custoRows] = await Promise.all([
        loadProducaoPeriodo(p.from, p.to),
        ensureColaboradores(false),
        loadCustosAprovados(p.from, p.to, false),
        ensureCobertura()
      ]);
      if (seq !== p.loadSeq) return;
      p.rows = buildPeriodoRows(rpcRows, colabRows, p.from, p.to, custoRows);
      if (state.coordenacao && !p.rows.some((r) => r.coordenacao === state.coordenacao)) state.coordenacao = '';
    } catch (error) {
      if (seq !== p.loadSeq) return;
      console.error('[PRODUTIVIDADE]', error);
      state.error = error?.message || 'Falha ao carregar produção do período.';
      p.rows = [];
    } finally {
      if (seq === p.loadSeq) {
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
      state.ultimaData = latest || todayLocalIso();
      state.from = state.ultimaData;
      state.to = state.from;
      state.initialized = true;
    }
    render(container);
    if (state.tab === 'periodo') loadPeriodo(container); else load(container);
  }

  window.PRODUTIVIDADE = { openHome };
})();
