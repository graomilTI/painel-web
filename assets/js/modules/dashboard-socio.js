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
    bonus: null
  };

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

  function pctClass(pct) {
    const v = n(pct);
    if (v >= 100) return 'good';
    if (v >= 80) return 'warn';
    return 'bad';
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

      .socio-status{margin:0 0 16px;padding:14px 16px;border-radius:16px;border:1px solid var(--socio-border);background:rgba(15,23,42,.7);color:var(--socio-muted);font-size:13px;}
      .socio-status.error{border-color:rgba(248,113,113,.4);color:#fca5a5;}

      @media(max-width:1180px){
        .socio-cards{grid-template-columns:repeat(3,minmax(0,1fr));}
        .socio-grid{grid-template-columns:1fr;}
      }
      @media(max-width:640px){
        .socio-cards{grid-template-columns:repeat(2,minmax(0,1fr));}
        .socio-rank-row{grid-template-columns:96px 1fr 76px;}
      }
    `;
    document.head.appendChild(style);
  }

  async function carregarDados(supabase) {
    // 1) Mês de referência: o mais recente com produção lançada
    const { data: ultimaLinha } = await supabase
      .from('relatorio_resultado_diario')
      .select('data')
      .order('data', { ascending: false })
      .limit(1)
      .maybeSingle();

    let ano = new Date().getFullYear();
    let mes = new Date().getMonth() + 1;
    if (ultimaLinha?.data) {
      const [y, m] = String(ultimaLinha.data).split('-').map(Number);
      if (y && m) { ano = y; mes = m; }
    }

    const inicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
    const fimMesObj = new Date(ano, mes, 1);
    const fim = `${fimMesObj.getFullYear()}-${String(fimMesObj.getMonth() + 1).padStart(2, '0')}-01`;

    const [
      { data: producaoRows },
      { data: metasMensalRows },
      { data: despesasRows },
      { data: metasRegionaisRows }
    ] = await Promise.all([
      supabase
        .from('relatorio_resultado_diario')
        .select('toneladas, valor_embarcado, total_embarcado_mais_teste, coordenacao, funcionario')
        .gte('data', inicio).lt('data', fim),
      supabase
        .from('vw_metas_producao_mensal')
        .select('ano, mes, meta_total_tons, produzido_total_tons, percentual_atingido')
        .order('ano', { ascending: false }).order('mes', { ascending: false })
        .limit(6),
      supabase
        .from('dre_despesas_mensal')
        .select('coordenacao, total_coordenacao, total_geral, total_todas_regionais, rateio, total_com_rateio')
        .eq('ano', ano).eq('mes', mes),
      supabase
        .from('metas_producao')
        .select('qualifica_bonus')
        .eq('ano', ano).eq('mes', mes)
    ]);

    // Produção / faturamento agregados
    const prod = (producaoRows || []).reduce((acc, r) => {
      acc.tons += n(r.toneladas);
      acc.receita += n(r.valor_embarcado);
      acc.embarcadoTotal += n(r.total_embarcado_mais_teste);
      if (r.coordenacao) acc.coordenacoes.add(String(r.coordenacao).trim().toUpperCase());
      if (r.funcionario) acc.colaboradores.add(String(r.funcionario).trim().toUpperCase());
      return acc;
    }, { tons: 0, receita: 0, embarcadoTotal: 0, coordenacoes: new Set(), colaboradores: new Set() });

    // Metas do mês de referência (ou o mais recente disponível com dados)
    let metasMes = (metasMensalRows || []).find((r) => Number(r.ano) === ano && Number(r.mes) === mes) || null;
    if (!metasMes || !n(metasMes.meta_total_tons)) {
      metasMes = (metasMensalRows || []).find((r) => n(r.produzido_total_tons) > 0) || metasMensalRows?.[0] || null;
    }

    // Despesas do mês
    const despesaLinhas = (despesasRows || []).map((r) => ({
      coordenacao: r.coordenacao,
      totalComRateio: n(r.total_com_rateio)
    })).sort((a, b) => b.totalComRateio - a.totalComRateio);
    const totalTodasRegionais = n(despesasRows?.[0]?.total_todas_regionais);
    const totalGeral = n(despesasRows?.[0]?.total_geral);

    const resultado = prod.receita - totalTodasRegionais;
    const margem = prod.receita > 0 ? (resultado / prod.receita) * 100 : 0;

    // Bônus
    const totalRegionaisBonus = (metasRegionaisRows || []).length;
    const qualificandoBonus = (metasRegionaisRows || []).filter((r) => r.qualifica_bonus).length;

    return {
      ano,
      mes,
      producao: {
        tons: prod.tons,
        receita: prod.receita,
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
      bonus: { total: totalRegionaisBonus, qualificando: qualificandoBonus }
    };
  }

  function renderLoading() {
    return `<div class="socio-status">Carregando indicadores executivos…</div>`;
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
          <span class="sub">Valor embarcado no período</span>
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
          <span class="name">Receita (valor embarcado)</span>
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

    const maiorDespesa = despesas.linhas[0]?.totalComRateio || 1;
    const rankingDespesas = despesas.linhas.length
      ? `<div class="socio-rank">
          ${despesas.linhas.map((l) => `
            <div class="socio-rank-row">
              <span class="reg" title="${safe(l.coordenacao)}">${safe(l.coordenacao)}</span>
              <div class="bar-wrap"><div class="bar" style="width:${Math.max((l.totalComRateio / maiorDespesa) * 100, 3)}%"></div></div>
              <span class="amt">${fmtMoney(l.totalComRateio)}</span>
            </div>`).join('')}
        </div>`
      : `<p class="hint">Sem lançamentos de despesas para este mês ainda.</p>`;

    return `
      <div class="socio-page">
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
            <p class="hint">Comparativo entre o faturamento embarcado e as despesas totais apuradas no DRE para o mês.</p>
            ${resumoFinanceiro}
          </div>
          <div class="socio-panel">
            <h4>Progresso da meta de produção</h4>
            <p class="hint">Percentual atingido em relação à meta consolidada de todas as regionais.</p>
            ${metaProgresso}
            <h4 style="margin-top:20px">Maiores despesas por coordenação</h4>
            <p class="hint">Top coordenações pelo total de despesas com rateio aplicado.</p>
            ${rankingDespesas}
          </div>
        </div>
      </div>
    `;
  }

  function render(container) {
    if (state.loading) {
      container.innerHTML = renderLoading();
      return;
    }
    if (state.erro) {
      container.innerHTML = renderErro(state.erro);
      return;
    }
    container.innerHTML = renderConteudo();
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

    try {
      const dados = await carregarDados(supabase);
      Object.assign(state, dados, { loading: false, erro: null });
    } catch (e) {
      state.loading = false;
      state.erro = e?.message || 'Erro inesperado ao carregar os dados.';
    }

    render(container);
  }

  window.DASHBOARD_SOCIO = { openHome };
})();
