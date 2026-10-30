// Financeiro — aba Dashboard (KPIs, gráficos e movimentações).
// Extraído de assets/js/financeiro.js (renderContent) em 15/10/2026. Cada fábrica criarX(ctx) recebe o contexto da tela
// ({ content, userContext } + funções das fábricas anteriores) e devolve as funções que as outras partes usam. O código
// das funções e constantes foi movido sem alteração. Para publicar uma mudança em qualquer módulo de
// assets/js/modules/financeiro/, troque o token ?v=20261030-fin21 em TODOS os imports internos e nos carregadores
// (assets/js/financeiro.js, financeiro.html): tests/financeiro-modulos-versao.test.mjs garante que fiquem iguais.
import { supabase } from '../../supabaseClient.js';
import { esc, money, brDate } from './util.js?v=20261030-fin21';

function criarDashboard(ctx) {
  const dashCharts = { line: null, donut: null };

  async function loadDashboardData() {
    const hoje = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const hojeStr = `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-${pad(hoje.getDate())}`;
    const seisMesesAtras = new Date(hoje);
    seisMesesAtras.setMonth(seisMesesAtras.getMonth() - 5);
    const inicioPeriodo = `${seisMesesAtras.getFullYear()}-${String(seisMesesAtras.getMonth() + 1).padStart(2, '0')}-01`;
    const novDiasAtras = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const quinzeDias = new Date(hoje);
    quinzeDias.setDate(quinzeDias.getDate() + 14);
    const fimPeriodo = `${quinzeDias.getFullYear()}-${pad(quinzeDias.getMonth() + 1)}-${pad(quinzeDias.getDate())}`;

    const [fluxoRes, fluxoDiarioRes, categoriaRes, receberRes, pagarRes] = await Promise.all([
      supabase.from('financeiro_fluxo_caixa_diario')
        .select('data,contas_receber,contas_pagar,saldo_dia,saldo_projetado')
        .gte('data', inicioPeriodo)
        .order('data', { ascending: true }),
      supabase.from('financeiro_fluxo_caixa_diario')
        .select('data,contas_pagar,contas_receber')
        .gte('data', hojeStr)
        .lte('data', fimPeriodo)
        .order('data', { ascending: true }),
      supabase.from('financeiro_contas_pagar')
        .select('categoria,valor')
        .gte('vencimento', novDiasAtras),
      supabase.from('financeiro_contas_receber')
        .select('cliente,valor,vencimento,situacao')
        .eq('vencimento', hojeStr)
        .order('cliente'),
      supabase.from('financeiro_contas_pagar')
        .select('favorecido,valor,vencimento,situacao')
        .eq('vencimento', hojeStr)
        .order('favorecido')
    ]);

    renderDashboard({
      fluxo: fluxoRes.data || [],
      fluxoDiario: fluxoDiarioRes.data || [],
      categorias: (categoriaRes.data || []).filter((r) => r.categoria),
      receber: receberRes.data || [],
      pagar: pagarRes.data || [],
      hojeStr
    });
  }

  function renderDashboard({ fluxo, fluxoDiario, categorias, receber, pagar, hojeStr }) {
    const hoje = new Date();
    const byDay = {};
    fluxoDiario.forEach((row) => {
      const dia = String(row.data).slice(0, 10);
      byDay[dia] = { pagar: Number(row.contas_pagar || 0), receber: Number(row.contas_receber || 0) };
    });
    const dias = Object.keys(byDay).sort();

    const diaLabels = dias.map((d) => {
      const [, mo, dy] = d.split('-');
      return `${dy}/${mo}`;
    });

    const lineCtx = document.getElementById('dashLineChart');
    if (lineCtx && typeof Chart !== 'undefined') {
      if (dashCharts.line) { dashCharts.line.destroy(); dashCharts.line = null; }
      dashCharts.line = new Chart(lineCtx, {
        type: 'line',
        data: {
          labels: diaLabels,
          datasets: [
            { label: 'A Receber', data: dias.map((d) => byDay[d].receber), borderColor: '#34d399', backgroundColor: 'rgba(52,211,153,.1)', borderWidth: 2.5, pointBackgroundColor: '#34d399', pointRadius: 4, fill: true, tension: 0.35 },
            { label: 'A Pagar', data: dias.map((d) => byDay[d].pagar), borderColor: '#f87171', backgroundColor: 'rgba(248,113,113,.07)', borderWidth: 2.5, pointBackgroundColor: '#f87171', pointRadius: 4, fill: true, tension: 0.35 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: '#6b7280', font: { size: 12 }, usePointStyle: true } },
            tooltip: { backgroundColor: 'rgba(15,23,42,.95)', borderColor: 'rgba(148,163,184,.18)', borderWidth: 1, titleColor: '#e2e8f0', bodyColor: '#6b7280', callbacks: { label: (ctx) => ` ${money(ctx.raw)}` } }
          },
          scales: {
            x: { grid: { color: 'rgba(148,163,184,.07)' }, ticks: { color: '#64748b', font: { size: 11 } } },
            y: { grid: { color: 'rgba(148,163,184,.07)' }, ticks: { color: '#64748b', font: { size: 11 }, callback: (v) => `R$ ${(v / 1000).toFixed(0)}k` } }
          }
        }
      });
    }

    const catMap = {};
    categorias.forEach((row) => { const cat = row.categoria || 'Outros'; catMap[cat] = (catMap[cat] || 0) + Number(row.valor || 0); });
    const catEntries = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 7);
    const donutColors = ['#34d399', '#818cf8', '#f87171', '#fb923c', '#a78bfa', '#38bdf8', '#fbbf24'];

    const donutCtx = document.getElementById('dashDonutChart');
    if (donutCtx && typeof Chart !== 'undefined') {
      if (dashCharts.donut) { dashCharts.donut.destroy(); dashCharts.donut = null; }
      if (catEntries.length) {
        dashCharts.donut = new Chart(donutCtx, {
          type: 'doughnut',
          data: {
            labels: catEntries.map(([k]) => k),
            datasets: [{ data: catEntries.map(([, v]) => v), backgroundColor: donutColors, borderColor: 'rgba(15,23,42,.9)', borderWidth: 3, hoverOffset: 8 }]
          },
          options: {
            responsive: true, maintainAspectRatio: false, cutout: '62%',
            plugins: {
              legend: { position: 'bottom', labels: { color: '#6b7280', font: { size: 11 }, padding: 10, usePointStyle: true } },
              tooltip: { backgroundColor: 'rgba(15,23,42,.95)', borderColor: 'rgba(148,163,184,.18)', borderWidth: 1, titleColor: '#e2e8f0', bodyColor: '#6b7280', callbacks: { label: (ctx) => ` ${money(ctx.raw)}` } }
            }
          }
        });
      } else {
        const pEl = donutCtx.closest('.dash-chart-card')?.querySelector('p');
        if (pEl) pEl.textContent = 'Sem dados de categorias nos últimos 90 dias.';
      }
    }

    const txEl = document.getElementById('dashTransactions');
    if (!txEl) return;
    const combined = [
      ...receber.map((r) => ({ tipo: 'receber', nome: r.cliente, valor: Number(r.valor || 0), data: r.vencimento, situacao: r.situacao })),
      ...pagar.map((r) => ({ tipo: 'pagar', nome: r.favorecido, valor: Number(r.valor || 0), data: r.vencimento, situacao: r.situacao }))
    ].sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

    if (!combined.length) {
      txEl.innerHTML = '<div class="dash-loading">Nenhum vencimento para hoje.</div>';
      return;
    }
    txEl.innerHTML = combined.map((tx) => `
      <div class="dash-tx-row">
        <div class="dash-tx-icon ${esc(tx.tipo)}">${tx.tipo === 'receber' ? '↑' : '↓'}</div>
        <div style="min-width:0">
          <div class="dash-tx-name">${esc(tx.nome || '-')}</div>
          <div class="dash-tx-sub">${esc(tx.situacao || (tx.tipo === 'receber' ? 'A Receber' : 'A Pagar'))}</div>
        </div>
        <div class="dash-tx-date">${brDate(tx.data)}</div>
        <div class="dash-tx-value ${esc(tx.tipo)}">${tx.tipo === 'pagar' ? '−' : '+'}${money(tx.valor)}</div>
      </div>
    `).join('');
  }

  return { loadDashboardData };
}

export { criarDashboard };
