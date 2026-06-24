/*
 * Dashboard do Sócio — visão executiva geral + resumo financeiro/DRE
 * Padrão do projeto: IIFE + window.DASHBOARD_SOCIO.openHome(container, { auth, api, onBack })
 */
(function () {
  const STYLE_ID = 'dashboard-socio-style-v1';

  const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const state = {
    loading: true,
    erro: null,
    ano: null,
    mes: null,
    producao: null,
    metasMes: null,
    despesas: null,
    bonus: null,
    regionais: [],
    mesesDisponiveis: [],
    mesSelecionado: null
  };

  const charts = { meta: null, financeiro: null };
  const _attached = new WeakSet();

  function n(v) {
    if (v == null || v === '') return 0;
    const num = Number(v);
    return Number.isFinite(num) ? num : 0;
  }

  function fmtNum(v, casas = 0) {
    return n(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  }

  function fmtTons(v) {
    return `${fmtNum(v, 0)} t`;
  }

  function fmtMoney(v) {
    return n(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  }

  function fmtPct(v) {
    return `${n(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  }

  function safe(s) {
    return String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  }

  function normKey(value) {
    return String(value ?? '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
      .replace(/\s+/g, ' ');
  }

  function pctClass(pct) {
    const v = n(pct);
    if (v >= 100) return 'good';
    if (v >= 80) return 'warn';
    return 'bad';
  }

  function numberBr(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const text = String(value ?? '').trim();
    if (!text) return 0;
    const normalized = text.includes(',')
      ? text.replace(/\./g, '').replace(',', '.')
      : text;
    const parsed = Number(normalized.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function rawValue(row, aliases) {
    const source = row?.dados_json || row?.raw || row || {};
    const keys = Object.keys(source);
    for (const alias of aliases) {
      const expected = normKey(alias);
      const key = keys.find((candidate) => normKey(candidate) === expected);
      if (key && source[key] != null && String(source[key]).trim() !== '') return source[key];
    }
    return null;
  }

  function rangeOverlaps(rowStart, rowEnd, inicio, fim) {
    if (!rowStart && !rowEnd) return true;
    const start = String(rowStart || inicio).slice(0, 10);
    const end = String(rowEnd || fim).slice(0, 10);
    return start < fim && end >= inicio;
  }

  async function carregarLoteMaisRecenteAgente(supabase, table, select) {
    const { data: latest, error: latestError } = await supabase
      .from(table)
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1);

    if (latestError) throw latestError;
    const createdAt = latest?.[0]?.created_at;
    if (!createdAt) return [];

    const threshold = new Date(new Date(createdAt).getTime() - 5 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .gte('created_at', threshold)
      .limit(10000);

    if (error) throw error;
    return data || [];
  }

  async function carregarDespesasAgente(supabase, inicio, fim) {
    try {
      const rows = await carregarLoteMaisRecenteAgente(
        supabase,
        'grm_despesas_importacoes',
        'coordenacao,valor,data_conta_de,data_conta_ate,dados_json,created_at'
      );
      const filtradas = rows.filter((r) => rangeOverlaps(r.data_conta_de, r.data_conta_ate, inicio, fim));
      if (!filtradas.length) return [];

      const porRegional = new Map();
      filtradas.forEach((r) => {
        const coordenacao = String(r.coordenacao || rawValue(r, ['Coordenação', 'Coordenacao', 'Regional']) || '').trim();
        if (!coordenacao) return;
        const valor = numberBr(r.valor || rawValue(r, ['Total', 'Valor']));
        porRegional.set(coordenacao, (porRegional.get(coordenacao) || 0) + valor);
      });

      const totalTodasRegionais = Array.from(porRegional.values()).reduce((sum, value) => sum + value, 0);
      return Array.from(porRegional.entries()).map(([coordenacao, total]) => ({
        coordenacao,
        total_coordenacao: total,
        total_geral: 0,
        total_todas_regionais: totalTodasRegionais,
        rateio: 0,
        total_com_rateio: total
      }));
    } catch (e) {
      console.warn('[dashboard socio] fallback de despesas dos agentes indisponível', e);
      return [];
    }
  }

  const REGIONAIS_EXCLUIDAS = new Set(['GERAL', 'AGROTRADER', 'LOG1000', 'PARAGUAI']);
  function isRegionalExcluida(nome) {
    return REGIONAIS_EXCLUIDAS.has(normKey(nome));
  }

  async function carregarProducaoMes(supabase, inicio, fim) {
    const pageSize = 1000;
    let from = 0;
    const all = [];
    while (true) {
      const { data, error } = await supabase
        .from('relatorio_resultado_diario')
        .select('toneladas, valor_embarcado, total_embarcado_mais_teste, coordenacao, funcionario')
        .gte('data', inicio).lt('data', fim)
        .range(from, from + pageSize - 1);
      if (error) throw error;
      const rows = data || [];
      all.push(...rows);
      if (rows.length < pageSize) break;
      from += pageSize;
    }
    return all;
  }

  function dataRealDaNota(r) {
    const json = r?.dados_json || {};
    const raw = json['Data N.F.'] ?? json['Data da NF'] ?? json['Data NF'] ?? json['Data Nota'] ?? json['Data'];
    const m = String(raw ?? '').match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    return m ? `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}` : null;
  }

  async function carregarFaturamentoNotasAgente(supabase, inicio, fim) {
    try {
      // data_nota_de/data_fatura_de na tabela sao a JANELA de busca usada pelo robo
      // (~35 dias), nao a data real da nota - e o lote "mais recente" (ultimos 5min)
      // so cobre uma fracao da sincronizacao, que leva bem mais que isso. A tabela
      // agora tem upsert deduplicado por numero_nf, entao basta ler tudo e filtrar
      // pela data real dentro do dados_json.
      const pageSize = 1000;
      let from = 0;
      const rows = [];
      while (true) {
        const { data, error } = await supabase
          .from('grm_notas_fiscais_importacoes')
          .select('dados_json')
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const batch = data || [];
        rows.push(...batch);
        if (batch.length < pageSize) break;
        from += pageSize;
      }

      return rows.reduce((sum, r) => {
        const data = dataRealDaNota(r);
        if (!data || data < inicio || data >= fim) return sum;
        const raw = rawValue(r, ['Valor Bruto', 'Valor da N.F.', 'Valor Total', 'Valor']);
        return sum + numberBr(raw);
      }, 0);
    } catch (e) {
      console.warn('[dashboard socio] fallback de notas fiscais dos agentes indisponível', e);
      return 0;
    }
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .socio-page{
        --socio-bg:#020617; --socio-card:rgba(15,23,42,.86); --socio-border:rgba(148,163,184,.18);
        --socio-text:#e2e2f0; --socio-muted:#8b94a7; --socio-green:#22c55e; --socio-green-2:#166534;
        --socio-gold:#facc15; --socio-red:#f87171;
        color:var(--socio-text);
      }
      .socio-hero{
        position:relative; overflow:hidden; padding:24px 26px; margin-bottom:18px;
        border:1px solid rgba(250,204,21,.28); border-radius:26px;
        background:radial-gradient(circle at 8% 0%, rgba(250,204,21,.16), transparent 32%),
                   radial-gradient(circle at 96% 110%, rgba(34,197,94,.18), transparent 38%),
                   linear-gradient(150deg, rgba(15,23,42,.97), rgba(2,6,23,.88));
        box-shadow:0 24px 70px rgba(0,0,0,.32);
      }
      .socio-kicker{font-size:11px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:#fde68a;}
      .socio-hero h2{margin:8px 0 6px;font-size:28px;letter-spacing:-.04em;}
      .socio-hero p{margin:0;color:var(--socio-muted);max-width:680px;line-height:1.55;font-size:13px;}
      .socio-period{
        display:inline-flex; align-items:center; gap:8px; margin-top:14px; padding:8px 14px;
        border-radius:999px; border:1px solid rgba(250,204,21,.3); background:rgba(250,204,21,.08);
        font-size:12px; font-weight:800; color:#fde68a; text-transform:uppercase; letter-spacing:.04em;
      }

      .socio-section-title{display:flex;align-items:baseline;gap:10px;margin:26px 0 12px;}
      .socio-section-title h3{margin:0;font-size:18px;letter-spacing:-.02em;}
      .socio-section-title span{font-size:12px;color:var(--socio-muted);}

      .socio-cards{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;}
      .socio-card{
        padding:16px;border-radius:20px;border:1px solid var(--socio-border);
        background:linear-gradient(180deg, rgba(15,23,42,.9), rgba(2,6,23,.66));
        display:flex;flex-direction:column;gap:6px;min-height:108px;
      }
      .socio-card .lbl{font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.05em;color:var(--socio-muted);}
      .socio-card .val{font-size:22px;font-weight:900;letter-spacing:-.03em;}
      .socio-card .sub{font-size:11.5px;color:var(--socio-muted);}
      .socio-card.gold .val{color:#fde68a;}
      .socio-card.green .val{color:#86efac;}
      .socio-card.red .val{color:#fca5a5;}

      .socio-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:14px;}
      .socio-panel{
        border:1px solid var(--socio-border);border-radius:22px;background:var(--socio-card);
        padding:18px;
      }
      .socio-panel h4{margin:0 0 4px;font-size:15px;}
      .socio-panel p.hint{margin:0 0 14px;color:var(--socio-muted);font-size:12px;}

      .socio-meta-row{display:flex;align-items:center;gap:14px;margin-bottom:14px;}
      .socio-meta-row .nums{flex:1;}
      .socio-meta-row .nums strong{display:block;font-size:20px;letter-spacing:-.02em;}
      .socio-meta-row .nums span{font-size:12px;color:var(--socio-muted);}
      .socio-track{height:16px;border-radius:999px;background:#020617;overflow:hidden;border:1px solid rgba(148,163,184,.22);}
      .socio-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,#166534,#22c55e);transition:width .4s ease;}
      .socio-fill.warn{background:linear-gradient(90deg,#a16207,#facc15);}
      .socio-fill.bad{background:linear-gradient(90deg,#7f1d1d,#f87171);}
      .socio-pct-badge{
        display:inline-flex;align-items:center;justify-content:center;min-width:64px;padding:6px 12px;
        border-radius:999px;font-size:14px;font-weight:900;
      }
      .socio-pct-badge.good{background:rgba(34,197,94,.18);color:#86efac;border:1px solid rgba(34,197,94,.4);}
      .socio-pct-badge.warn{background:rgba(250,204,21,.16);color:#fde68a;border:1px solid rgba(250,204,21,.4);}
      .socio-pct-badge.bad{background:rgba(248,113,113,.16);color:#fca5a5;border:1px solid rgba(248,113,113,.4);}

      .socio-fin-list{display:flex;flex-direction:column;gap:10px;}
      .socio-fin-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-radius:14px;background:rgba(2,6,23,.45);border:1px solid var(--socio-border);}
      .socio-fin-row .name{font-size:12.5px;font-weight:800;color:var(--socio-text);}
      .socio-fin-row .amt{font-size:13px;font-weight:900;}
      .socio-fin-row .amt.green{color:#86efac;}
      .socio-fin-row .amt.red{color:#fca5a5;}
      .socio-fin-row .amt.gold{color:#fde68a;}

      .socio-rank{display:flex;flex-direction:column;gap:8px;margin-top:6px;}
      .socio-rank-row{display:grid;grid-template-columns:140px 1fr 90px;align-items:center;gap:10px;}
      .socio-rank-row .reg{font-size:11.5px;font-weight:800;color:var(--socio-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .socio-rank-row .bar-wrap{height:10px;border-radius:999px;background:#020617;overflow:hidden;border:1px solid rgba(148,163,184,.18);}
      .socio-rank-row .bar{height:100%;border-radius:999px;background:linear-gradient(90deg,#7f1d1d,#f87171);}
      .socio-rank-row .amt{font-size:11.5px;font-weight:900;color:#fca5a5;text-align:right;}

      .socio-charts{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;}
      .socio-chart-box{border:1px solid var(--socio-border);border-radius:22px;background:var(--socio-card);padding:18px;}
      .socio-chart-box h4{margin:0 0 4px;font-size:15px;}
      .socio-chart-box p.hint{margin:0 0 14px;color:var(--socio-muted);font-size:12px;}
      .socio-chart-canvas-wrap{position:relative;width:100%;}

      .socio-table-wrap{border:1px solid var(--socio-border);border-radius:22px;overflow:hidden;background:var(--socio-card);}
      .socio-table{width:100%;border-collapse:collapse;font-size:12.5px;}
      .socio-table thead th{
        background:rgba(250,204,21,.1);color:#fde68a;text-transform:uppercase;letter-spacing:.04em;
        font-size:10.5px;font-weight:900;padding:12px 14px;text-align:right;border-bottom:1px solid var(--socio-border);
      }
      .socio-table thead th:first-child{text-align:left;}
      .socio-table tbody td{padding:11px 14px;text-align:right;border-bottom:1px solid rgba(148,163,184,.1);color:var(--socio-text);}
      .socio-table tbody td:first-child{text-align:left;font-weight:800;}
      .socio-table tbody tr:hover td{background:rgba(250,204,21,.05);}
      .socio-table tbody tr:last-child td{border-bottom:0;}
      .socio-table .uf{font-size:10px;font-weight:800;color:var(--socio-muted);border:1px solid var(--socio-border);border-radius:6px;padding:1px 5px;margin-left:6px;}
      .socio-table td.pos{color:#86efac;font-weight:900;}
      .socio-table td.neg{color:#fca5a5;font-weight:900;}

      .socio-status{margin:0 0 16px;padding:14px 16px;border-radius:16px;border:1px solid var(--socio-border);background:rgba(15,23,42,.7);color:var(--socio-muted);font-size:13px;}
      .socio-status.error{border-color:rgba(248,113,113,.4);color:#fca5a5;}

      @media(max-width:1180px){
        .socio-cards{grid-template-columns:repeat(3,minmax(0,1fr));}
        .socio-grid{grid-template-columns:1fr;}
        .socio-charts{grid-template-columns:1fr;}
      }
      @media(max-width:640px){
        .socio-cards{grid-template-columns:repeat(2,minmax(0,1fr));}
        .socio-rank-row{grid-template-columns:96px 1fr 76px;}
        .socio-table{font-size:11px;}
        .socio-table thead th,.socio-table tbody td{padding:8px 10px;}
      }

      .socio-mes-selector{display:flex;gap:8px;overflow-x:auto;padding-bottom:6px;margin-bottom:20px;scrollbar-width:none;}
      .socio-mes-selector::-webkit-scrollbar{display:none;}
      .socio-mes-btn{flex-shrink:0;padding:7px 16px;border-radius:999px;border:1px solid var(--socio-border);background:rgba(15,23,42,.7);color:var(--socio-muted);font-size:12px;font-weight:800;cursor:pointer;transition:border-color .18s,color .18s,background .18s;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;}
      .socio-mes-btn:hover{border-color:rgba(250,204,21,.4);color:#fde68a;}
      .socio-mes-btn.ativo{background:rgba(250,204,21,.12);border-color:rgba(250,204,21,.5);color:#fde68a;}
      .socio-mes-btn:disabled{opacity:.35;cursor:default;}
    `;
    document.head.appendChild(style);
  }

  async function carregarMesesDisponiveis(supabase) {
    const { data } = await supabase
      .from('vw_metas_producao_mensal')
      .select('ano, mes')
      .order('ano', { ascending: false })
      .order('mes', { ascending: false })
      .limit(24);
    return (data || []).map((r) => ({ ano: Number(r.ano), mes: Number(r.mes) }));
  }

  async function carregarDados(supabase, anoForcado, mesForcado) {
    let ano = anoForcado || null;
    let mes = mesForcado || null;

    // Auto-detecta o mês mais recente quando não especificado
    if (!ano || !mes) {
      const { data: ultimaLinha } = await supabase
        .from('relatorio_resultado_diario')
        .select('data')
        .order('data', { ascending: false })
        .limit(1)
        .maybeSingle();
      ano = new Date().getFullYear();
      mes = new Date().getMonth() + 1;
      if (ultimaLinha?.data) {
        const [y, m] = String(ultimaLinha.data).split('-').map(Number);
        if (y && m) { ano = y; mes = m; }
      }
    }

    const inicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
    const fimMesObj = new Date(ano, mes, 1);
    const fim = `${fimMesObj.getFullYear()}-${String(fimMesObj.getMonth() + 1).padStart(2, '0')}-01`;

    const [
      producaoRows,
      { data: metasMensalRows },
      { data: despesasDreRows },
      { data: metasRegionaisRows },
      { data: contasReceberRows },
      despesasAgenteRows,
      faturamentoNotasAgente
    ] = await Promise.all([
      carregarProducaoMes(supabase, inicio, fim),
      supabase
        .from('vw_metas_producao_mensal')
        .select('ano, mes, meta_total_tons, produzido_total_tons, percentual_atingido')
        .eq('ano', ano).eq('mes', mes)
        .maybeSingle(),
      supabase
        .from('dre_despesas_mensal')
        .select('coordenacao, total_coordenacao, total_geral, total_todas_regionais, rateio, total_com_rateio')
        .eq('ano', ano).eq('mes', mes),
      supabase
        .from('metas_producao')
        .select('regional, estado, qualifica_bonus')
        .eq('ano', ano).eq('mes', mes),
      supabase
        .from('financeiro_contas_receber')
        .select('valor_pago')
        .gte('recebimento', inicio)
        .lt('recebimento', fim)
        .not('recebimento', 'is', null),
      carregarDespesasAgente(supabase, inicio, fim),
      carregarFaturamentoNotasAgente(supabase, inicio, fim)
    ]);

    const despesasRows = despesasAgenteRows?.length ? despesasAgenteRows : (despesasDreRows || []);

    const metasMes = metasMensalRows || null;
    const anoRefMetas = ano;
    const mesRefMetas = mes;

    const { data: metasRegionalView } = await supabase
      .from('vw_metas_producao_regional')
      .select('regional, estado, meta_tons, produzido_tons, percentual_atingido')
      .eq('ano', anoRefMetas).eq('mes', mesRefMetas);

    // Produção / faturamento agregados (consolidado + por regional)
    const porRegional = new Map();
    const ensureRegional = (nome) => {
      const key = normKey(nome);
      if (!key) return null;
      if (!porRegional.has(key)) {
        porRegional.set(key, {
          nome: String(nome).trim(),
          estado: '',
          tons: 0,
          receita: 0,
          metaTons: 0,
          produzidoTons: 0,
          percentualAtingido: null,
          despesas: 0
        });
      }
      return porRegional.get(key);
    };

    const prod = (producaoRows || []).reduce((acc, r) => {
      acc.tons += n(r.toneladas);
      acc.receita += n(r.valor_embarcado);
      acc.embarcadoTotal += n(r.total_embarcado_mais_teste);
      if (r.coordenacao && !isRegionalExcluida(r.coordenacao)) {
        acc.coordenacoes.add(normKey(r.coordenacao));
        const reg = ensureRegional(r.coordenacao);
        if (reg) {
          reg.tons += n(r.toneladas);
          reg.receita += n(r.valor_embarcado);
        }
      }
      if (r.funcionario) acc.colaboradores.add(String(r.funcionario).trim().toUpperCase());
      return acc;
    }, { tons: 0, receita: 0, embarcadoTotal: 0, coordenacoes: new Set(), colaboradores: new Set() });

    (metasRegionalView || []).forEach((r) => {
      if (isRegionalExcluida(r.regional)) return;
      const reg = ensureRegional(r.regional);
      if (!reg) return;
      reg.estado = r.estado || reg.estado;
      reg.metaTons = n(r.meta_tons);
      reg.produzidoTons = n(r.produzido_tons);
      reg.percentualAtingido = n(r.percentual_atingido);
    });

    // Despesas do mês (consolidado + por regional)
    const despesaLinhas = (despesasRows || []).map((r) => ({
      coordenacao: r.coordenacao,
      totalComRateio: n(r.total_com_rateio)
    })).sort((a, b) => b.totalComRateio - a.totalComRateio);
    (despesasRows || []).forEach((r) => {
      if (isRegionalExcluida(r.coordenacao)) return;
      const reg = ensureRegional(r.coordenacao);
      if (reg) reg.despesas = n(r.total_com_rateio);
    });
    const totalTodasRegionais = n(despesasRows?.[0]?.total_todas_regionais);
    const totalGeral = n(despesasRows?.[0]?.total_geral);

    const faturamentoContasReceber = (contasReceberRows || []).reduce((s, r) => s + n(r.valor_pago), 0);
    const faturamentoNF = faturamentoNotasAgente > 0 ? faturamentoNotasAgente : faturamentoContasReceber;

    const resultado = faturamentoNF - totalTodasRegionais;
    const margem = faturamentoNF > 0 ? (resultado / faturamentoNF) * 100 : 0;

    // Bônus
    const totalRegionaisBonus = (metasRegionaisRows || []).length;
    const qualificandoBonus = (metasRegionaisRows || []).filter((r) => r.qualifica_bonus).length;

    const regionais = Array.from(porRegional.values())
      .filter((r) => r.metaTons > 0 || r.tons > 0 || r.despesas > 0)
      .map((r) => ({
        ...r,
        resultado: r.receita - r.despesas,
        margem: r.receita > 0 ? ((r.receita - r.despesas) / r.receita) * 100 : 0
      }))
      .sort((a, b) => (b.percentualAtingido ?? -1) - (a.percentualAtingido ?? -1));

    return {
      ano,
      mes,
      producao: {
        tons: prod.tons,
        receita: faturamentoNF,
        embarcadoTotal: prod.embarcadoTotal,
        regionaisAtivas: prod.coordenacoes.size,
        colaboradoresAtivos: prod.colaboradores.size
      },
      metasMes,
      despesas: {
        linhas: despesaLinhas.slice(0, 6),
        totalTodasRegionais,
        totalGeral,
        resultado,
        margem
      },
      bonus: { total: totalRegionaisBonus, qualificando: qualificandoBonus },
      regionais
    };
  }

  function renderTabelaRegionais(regionais) {
    if (!regionais.length) {
      return `<p class="hint">Sem dados regionais consolidados para este período ainda.</p>`;
    }
    return `
      <div class="socio-table-wrap">
        <table class="socio-table">
          <thead>
            <tr>
              <th>Regional</th>
              <th>Meta</th>
              <th>Produzido</th>
              <th>% atingido</th>
              <th>Receita</th>
              <th>Despesas</th>
              <th>Resultado</th>
            </tr>
          </thead>
          <tbody>
            ${regionais.map((r) => {
              const resClasse = r.resultado >= 0 ? 'pos' : 'neg';
              const pct = r.percentualAtingido;
              return `
              <tr>
                <td>${safe(r.nome)}${r.estado ? `<span class="uf">${safe(r.estado)}</span>` : ''}</td>
                <td>${fmtTons(r.metaTons)}</td>
                <td>${fmtTons(r.produzidoTons || r.tons)}</td>
                <td><span class="socio-pct-badge ${pctClass(pct)}">${pct != null ? fmtPct(pct) : '—'}</span></td>
                <td>${fmtMoney(r.receita)}</td>
                <td>${fmtMoney(r.despesas)}</td>
                <td class="${resClasse}">${fmtMoney(r.resultado)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function destruirGraficos() {
    if (charts.meta) { charts.meta.destroy(); charts.meta = null; }
    if (charts.financeiro) { charts.financeiro.destroy(); charts.financeiro = null; }
  }

  function montarGraficos(container, regionais) {
    destruirGraficos();
    if (!window.Chart || !regionais || !regionais.length) return;

    const canvasMeta = container.querySelector('#socio-chart-meta');
    const canvasFin = container.querySelector('#socio-chart-fin');
    if (!canvasMeta || !canvasFin) return;

    const ChartJs = window.Chart;
    const GRID_C = 'rgba(148,163,184,0.1)';
    const TT = {
      backgroundColor: '#0b1220',
      borderColor: 'rgba(250,204,21,.25)',
      borderWidth: 1,
      titleFont: { family: "'DM Sans',system-ui,sans-serif", size: 11, weight: '700' },
      bodyFont: { size: 11 },
      padding: 10
    };
    ChartJs.defaults.color = '#9aa3b5';
    ChartJs.defaults.borderColor = GRID_C;
    ChartJs.defaults.font.family = "'DM Sans',system-ui,sans-serif";
    ChartJs.defaults.font.size = 11;

    const labels = regionais.map((r) => r.nome);
    const legenda = { position: 'top', align: 'end', labels: { boxWidth: 12, boxHeight: 12, padding: 14 } };
    const yAxis = { grid: { display: false }, ticks: { font: { size: 10 } } };

    const atingidoArr = regionais.map((r) => Math.min(n(r.percentualAtingido), 100));
    const restanteArr = regionais.map((r) => Math.max(100 - n(r.percentualAtingido), 0));

    charts.meta = new ChartJs(canvasMeta, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: '% atingido', data: atingidoArr, backgroundColor: 'rgba(34,197,94,.75)', borderRadius: { topLeft: 5, bottomLeft: 5 }, barThickness: 11, stack: 'meta' },
          { label: 'Restante para a meta', data: restanteArr, backgroundColor: 'rgba(250,204,21,.35)', borderRadius: { topRight: 5, bottomRight: 5 }, barThickness: 11, stack: 'meta' }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: legenda,
          tooltip: {
            ...TT,
            callbacks: {
              label: (ctx) => `  ${ctx.dataset.label}: ${fmtPct(ctx.parsed.x)}`,
              footer: (items) => {
                const r = regionais[items[0].dataIndex];
                return `Produzido: ${fmtTons(r.produzidoTons || r.tons)} de ${fmtTons(r.metaTons)} · % atingido real: ${r.percentualAtingido != null ? fmtPct(r.percentualAtingido) : '—'}`;
              }
            },
            footerFont: { size: 10, weight: '600' },
            footerColor: '#9aa3b5'
          }
        },
        scales: {
          x: { stacked: true, min: 0, max: 100, grid: { color: GRID_C }, ticks: { font: { size: 10 }, callback: (v) => `${fmtNum(v)}%` } },
          y: { ...yAxis, stacked: true }
        }
      }
    });

    charts.financeiro = new ChartJs(canvasFin, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Receita', data: regionais.map((r) => r.receita), backgroundColor: 'rgba(34,197,94,.7)', borderRadius: 5, barThickness: 11 },
          { label: 'Despesas', data: regionais.map((r) => r.despesas), backgroundColor: 'rgba(248,113,113,.7)', borderRadius: 5, barThickness: 11 }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: legenda,
          tooltip: { ...TT, callbacks: { label: (ctx) => `  ${ctx.dataset.label}: ${fmtMoney(ctx.parsed.x)}` } }
        },
        scales: {
          x: { grid: { color: GRID_C }, ticks: { font: { size: 10 }, callback: (v) => `R$${(v / 1000).toFixed(0)}k` } },
          y: yAxis
        }
      }
    });
  }

  function renderSeletorMeses() {
    const { mesesDisponiveis, mesSelecionado } = state;
    if (!mesesDisponiveis || !mesesDisponiveis.length) return '';
    return `<div class="socio-mes-selector">
      ${mesesDisponiveis.map(({ ano, mes }) => {
        const ativo = mesSelecionado?.ano === ano && mesSelecionado?.mes === mes ? 'ativo' : '';
        const label = `${MESES[mes - 1].slice(0, 3)} ${ano}`;
        return `<button class="socio-mes-btn ${ativo}" data-mes-btn data-ano="${ano}" data-mes="${mes}" type="button">${label}</button>`;
      }).join('')}
    </div>`;
  }

  function renderLoading() {
    return `<div class="socio-page">${renderSeletorMeses()}<div class="socio-status">Carregando indicadores executivos…</div></div>`;
  }

  function renderErro(msg) {
    return `<div class="socio-status error"><strong>Não foi possível carregar o dashboard.</strong><br>${safe(msg)}</div>`;
  }

  function renderConteudo() {
    const { ano, mes, producao, metasMes, despesas, bonus } = state;
    const periodo = `${MESES[(mes || 1) - 1]} de ${ano}`;

    const pctAtingido = n(metasMes?.percentual_atingido);
    const metaTotal = n(metasMes?.meta_total_tons);
    const produzidoMetas = n(metasMes?.produzido_total_tons);
    const fillClass = pctAtingido >= 100 ? '' : (pctAtingido >= 80 ? 'warn' : 'bad');

    const cardsExecutivos = `
      <div class="socio-cards">
        <div class="socio-card gold">
          <span class="lbl">Produção total</span>
          <strong class="val">${fmtTons(producao.tons)}</strong>
          <span class="sub">Toneladas movimentadas no mês</span>
        </div>
        <div class="socio-card green">
          <span class="lbl">Faturamento</span>
          <strong class="val">${fmtMoney(producao.receita)}</strong>
          <span class="sub">NFs recebidas no período</span>
        </div>
        <div class="socio-card">
          <span class="lbl">% da meta atingida</span>
          <strong class="val">${fmtPct(pctAtingido)}</strong>
          <span class="sub">${fmtTons(produzidoMetas)} de ${fmtTons(metaTotal)}</span>
        </div>
        <div class="socio-card">
          <span class="lbl">Regionais em operação</span>
          <strong class="val">${fmtNum(producao.regionaisAtivas)}</strong>
          <span class="sub">${fmtNum(producao.colaboradoresAtivos)} colaboradores em campo</span>
        </div>
        <div class="socio-card ${bonus.qualificando > 0 ? 'green' : ''}">
          <span class="lbl">Qualificando bônus</span>
          <strong class="val">${fmtNum(bonus.qualificando)} / ${fmtNum(bonus.total)}</strong>
          <span class="sub">Regionais com bônus de produção liberado</span>
        </div>
      </div>`;

    const metaProgresso = `
      <div class="socio-meta-row">
        <div class="nums">
          <strong>${fmtTons(produzidoMetas)} produzidas</strong>
          <span>Meta do mês: ${fmtTons(metaTotal)} · Restante: ${fmtTons(Math.max(metaTotal - produzidoMetas, 0))}</span>
        </div>
        <span class="socio-pct-badge ${pctClass(pctAtingido)}">${fmtPct(pctAtingido)}</span>
      </div>
      <div class="socio-track"><div class="socio-fill ${fillClass}" style="width:${Math.min(pctAtingido, 100)}%"></div></div>
    `;

    const resultadoClasse = despesas.resultado >= 0 ? 'green' : 'red';
    const resumoFinanceiro = `
      <div class="socio-fin-list">
        <div class="socio-fin-row">
          <span class="name">Receita (NFs recebidas no mês)</span>
          <span class="amt green">${fmtMoney(producao.receita)}</span>
        </div>
        <div class="socio-fin-row">
          <span class="name">Despesas totais (todas as regionais + rateio)</span>
          <span class="amt red">${fmtMoney(despesas.totalTodasRegionais)}</span>
        </div>
        <div class="socio-fin-row">
          <span class="name">Despesas administrativas (geral)</span>
          <span class="amt gold">${fmtMoney(despesas.totalGeral)}</span>
        </div>
        <div class="socio-fin-row">
          <span class="name">Resultado do mês (receita − despesas)</span>
          <span class="amt ${resultadoClasse}">${fmtMoney(despesas.resultado)}</span>
        </div>
        <div class="socio-fin-row">
          <span class="name">Margem sobre a receita</span>
          <span class="amt ${resultadoClasse}">${fmtPct(despesas.margem)}</span>
        </div>
      </div>`;

    const regionais = state.regionais || [];
    const alturaGraficos = Math.max(360, regionais.length * 36);
    const semRegionais = `<p class="hint">Sem dados regionais consolidados para este período ainda.</p>`;

    return `
      <div class="socio-page">
        ${renderSeletorMeses()}
        <section class="socio-hero">
          <span class="socio-kicker">Dashboard do Sócio · Visão executiva</span>
          <h2>Panorama geral da operação</h2>
          <p>Indicadores consolidados de produção, metas e resultado financeiro para acompanhamento estratégico do negócio — sem a necessidade de navegar entre os módulos operacionais.</p>
          <span class="socio-period">Referência: ${safe(periodo)}</span>
        </section>

        <div class="socio-section-title">
          <h3>Visão executiva geral</h3>
          <span>Produção, meta e força operacional do mês de referência</span>
        </div>
        ${cardsExecutivos}

        <div class="socio-section-title">
          <h3>Financeiro &amp; DRE resumido</h3>
          <span>Receita, despesas e resultado consolidado de ${safe(periodo)}</span>
        </div>
        <div class="socio-grid">
          <div class="socio-panel">
            <h4>Resumo do resultado financeiro</h4>
            <p class="hint">Comparativo entre as NFs recebidas no mês e as despesas totais apuradas no DRE.</p>
            ${resumoFinanceiro}
          </div>
          <div class="socio-panel">
            <h4>Progresso da meta de produção</h4>
            <p class="hint">Percentual atingido em relação à meta consolidada de todas as regionais.</p>
            ${metaProgresso}
          </div>
        </div>

        <div class="socio-section-title">
          <h3>Desempenho por todas as regionais</h3>
          <span>Meta x produção e receita x despesas, regional a regional — ${safe(periodo)}</span>
        </div>
        ${regionais.length ? `
        <div class="socio-charts">
          <div class="socio-chart-box">
            <h4>% da meta atingida por regional</h4>
            <p class="hint">Barra acumulada totalizando 100%: percentual já produzido (verde) e percentual restante para a meta (dourado).</p>
            <div class="socio-chart-canvas-wrap" id="socio-chart-meta-wrap" style="height:${alturaGraficos}px">
              <canvas id="socio-chart-meta"></canvas>
            </div>
          </div>
          <div class="socio-chart-box">
            <h4>Receita x despesas (R$)</h4>
            <p class="hint">Faturamento operacional (valor embarcado) vs despesas apuradas em cada regional.</p>
            <div class="socio-chart-canvas-wrap" id="socio-chart-fin-wrap" style="height:${alturaGraficos}px">
              <canvas id="socio-chart-fin"></canvas>
            </div>
          </div>
        </div>
        ${renderTabelaRegionais(regionais)}
        ` : semRegionais}
      </div>
    `;
  }

  function render(container) {
    if (state.loading) {
      destruirGraficos();
      container.innerHTML = renderLoading();
      return;
    }
    if (state.erro) {
      destruirGraficos();
      container.innerHTML = renderErro(state.erro);
      return;
    }
    container.innerHTML = renderConteudo();
    montarGraficos(container, state.regionais || []);
  }

  function attachListeners(container, supabase) {
    if (_attached.has(container)) return;
    _attached.add(container);
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-mes-btn]');
      if (!btn || state.loading) return;
      const ano = Number(btn.dataset.ano);
      const mes = Number(btn.dataset.mes);
      if (state.mesSelecionado?.ano === ano && state.mesSelecionado?.mes === mes) return;
      state.mesSelecionado = { ano, mes };
      state.loading = true;
      state.erro = null;
      render(container);
      carregarDados(supabase, ano, mes)
        .then((dados) => { Object.assign(state, dados, { loading: false, erro: null }); })
        .catch((e) => { state.loading = false; state.erro = e?.message || 'Erro inesperado.'; })
        .finally(() => render(container));
    });
  }

  async function openHome(container, opts = {}) {
    injectStyle();
    const supabase = opts?.supabase || opts?.api?.supabase;
    state.loading = true;
    state.erro = null;
    render(container);

    if (!supabase) {
      state.loading = false;
      state.erro = 'Conexão com o banco de dados indisponível.';
      render(container);
      return;
    }

    // Busca meses disponíveis na primeira abertura
    if (!state.mesesDisponiveis.length) {
      try {
        const meses = await carregarMesesDisponiveis(supabase);
        state.mesesDisponiveis = meses;
        if (!state.mesSelecionado && meses.length) {
          state.mesSelecionado = meses[0];
        }
      } catch (_) { /* segue sem seletor */ }
    }

    const { ano, mes } = state.mesSelecionado || {};
    try {
      const dados = await carregarDados(supabase, ano, mes);
      Object.assign(state, dados, { loading: false, erro: null });
    } catch (e) {
      state.loading = false;
      state.erro = e?.message || 'Erro inesperado ao carregar os dados.';
    }

    render(container);
    attachListeners(container, supabase);
  }

  window.DASHBOARD_SOCIO = { openHome };
})();
