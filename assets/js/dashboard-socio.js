import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import './modules/dashboard-diretoria.js?v=20260910-2';

function normalizarChave(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

function criarSupabaseDashboardSocio(baseSupabase) {
  return new Proxy(baseSupabase, {
    get(target, prop, receiver) {
      if (prop !== 'from') return Reflect.get(target, prop, receiver);
      return (tableName) => {
        // As duas views abaixo são alimentadas pelos lotes atuais das APIs do GRM.
        // Mantemos os nomes esperados pelo módulo-base, mas trocamos a origem.
        if (tableName === 'grm_notas_fiscais_importacoes') {
          return target.from('dashboard_socios_notas_emitidas_api');
        }
        if (tableName === 'financeiro_contas_receber') {
          return target.from('dashboard_socios_recebimentos_api');
        }
        return target.from(tableName);
      };
    }
  });
}

const fmtInteiro = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const fmtMoeda = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', maximumFractionDigits: 0
});
const fmtMoedaCompacta = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1
});

function instalarChartComUnidadesReais() {
  if (!window.Chart || window.__dashboardSocioChartUnidades) return;
  const ChartOriginal = window.Chart;

  window.Chart = new Proxy(ChartOriginal, {
    construct(target, args, newTarget) {
      const config = args?.[1];
      const datasets = config?.data?.datasets || [];
      const financeiro = datasets.some((dataset) => dataset.label === 'Serviços')
        && datasets.some((dataset) => dataset.label === 'Notas')
        && datasets.some((dataset) => dataset.label === 'Recebimentos');

      if (financeiro) {
        datasets.forEach((dataset) => {
          dataset.yAxisID = dataset.label === 'Notas' ? 'notas' : 'financeiro';
        });

        config.options ||= {};
        config.options.scales ||= {};
        const eixoOriginal = config.options.scales.y || {};
        const ticksOriginais = eixoOriginal.ticks || {};
        const gridOriginal = eixoOriginal.grid || {};
        delete config.options.scales.y;

        config.options.scales.financeiro = {
          ...eixoOriginal,
          type: 'linear',
          position: 'left',
          beginAtZero: true,
          grid: gridOriginal,
          title: {
            ...(eixoOriginal.title || {}),
            display: true,
            text: 'Valores (R$)',
            color: ticksOriginais.color
          },
          ticks: {
            ...ticksOriginais,
            callback: (value) => fmtMoedaCompacta.format(Number(value) || 0)
          }
        };

        config.options.scales.notas = {
          type: 'linear',
          position: 'right',
          beginAtZero: true,
          grid: { drawOnChartArea: false },
          title: { display: true, text: 'Notas (qtd.)', color: ticksOriginais.color },
          ticks: {
            color: ticksOriginais.color,
            precision: 0,
            callback: (value) => fmtInteiro.format(Number(value) || 0)
          }
        };

        config.options.plugins ||= {};
        config.options.plugins.tooltip ||= {};
        const callbacks = config.options.plugins.tooltip.callbacks || {};
        config.options.plugins.tooltip.callbacks = {
          ...callbacks,
          label(context) {
            const value = context?.parsed?.y ?? context?.raw ?? 0;
            return context?.dataset?.label === 'Notas'
              ? `Notas: ${fmtInteiro.format(Number(value) || 0)}`
              : `${context?.dataset?.label || 'Valor'}: ${fmtMoeda.format(Number(value) || 0)}`;
          }
        };
      }

      return Reflect.construct(target, args, newTarget);
    }
  });

  window.__dashboardSocioChartUnidades = true;
}

function removerPrefixoMoeda(element) {
  if (!element || !/R\$/.test(element.textContent || '')) return;
  element.textContent = String(element.textContent || '').replace(/R\$\s*/i, '').trim();
}

function corrigirTabelaComparativa(root) {
  root.querySelectorAll('table.dir-table').forEach((table) => {
    const headers = [...table.querySelectorAll('thead th')];
    const index = headers.findIndex((th) => normalizarChave(th.textContent) === 'NOTASEMITIDAS');
    if (index < 0) return;
    table.querySelectorAll('tbody tr').forEach((row) => removerPrefixoMoeda(row.children?.[index]));
  });
}

function corrigirUnidadesNaTela(root) {
  const cardNotas = root.querySelector('[data-detail="invoices"]');
  if (cardNotas) {
    removerPrefixoMoeda(cardNotas.querySelector('.dir-kpi-value'));
    const sub = cardNotas.querySelector('.dir-kpi-sub');
    const texto = 'Quantidade pela data de emissão';
    if (sub && sub.textContent !== texto) sub.textContent = texto;
  }

  const indicadorRanking = root.querySelector('[data-rank-metric]');
  if (indicadorRanking?.value === 'invoices') {
    indicadorRanking.closest('.dir-section')
      ?.querySelectorAll('.dir-rank-row strong, .dir-rank-rest')
      .forEach(removerPrefixoMoeda);
  }

  const detalhe = root.querySelector('.dir-detail');
  if (detalhe && normalizarChave(detalhe.querySelector('h4')?.textContent) === 'NOTASEMITIDAS') {
    detalhe.querySelectorAll('.dir-rank-row strong, .dir-rank-rest').forEach(removerPrefixoMoeda);
    const p = detalhe.querySelector('.dir-detail-head p');
    const texto = 'Quantidade pela data de emissão. Maiores coordenações no filtro atual.';
    if (p && p.textContent !== texto) p.textContent = texto;
  }

  root.querySelectorAll('.dir-compare-metric').forEach((bloco) => {
    if (normalizarChave(bloco.querySelector('h4')?.textContent) !== 'NOTASEMITIDAS') return;
    bloco.querySelectorAll('.dir-compare-row strong').forEach(removerPrefixoMoeda);
  });
  corrigirTabelaComparativa(root);

  const indicadorMapa = root.querySelector('[data-map-metric]');
  if (indicadorMapa?.value === 'invoices') {
    const secao = indicadorMapa.closest('.dir-section');
    secao?.querySelectorAll('.dir-rank-row strong, .dir-rank-rest').forEach(removerPrefixoMoeda);
    secao?.querySelectorAll('svg title').forEach((title) => {
      if (/R\$/.test(title.textContent || '')) title.textContent = title.textContent.replace(/R\$\s*/g, '');
    });
  }
}

function observarUnidades(content) {
  let agendado = false;
  const aplicar = () => {
    if (agendado) return;
    agendado = true;
    queueMicrotask(() => {
      agendado = false;
      corrigirUnidadesNaTela(content);
    });
  };
  const observer = new MutationObserver(aplicar);
  observer.observe(content, { childList: true, subtree: true });
  content.addEventListener('change', aplicar);
  content.addEventListener('click', aplicar);
  aplicar();
}

export function renderContent(content, ctx) {
  if (!window.DASHBOARD_SOCIO || typeof window.DASHBOARD_SOCIO.openHome !== 'function') {
    content.innerHTML = '<div class="card"><strong>Erro ao carregar o Panorama da Empresa.</strong><br>O módulo window.DASHBOARD_SOCIO.openHome não foi encontrado.</div>';
    return;
  }

  instalarChartComUnidadesReais();
  observarUnidades(content);
  const supabaseDashboardSocio = criarSupabaseDashboardSocio(supabase);

  window.DASHBOARD_SOCIO.openHome(content, {
    supabase: supabaseDashboardSocio,
    api: { supabase: supabaseDashboardSocio },
    auth: ctx,
    user: ctx?.user || null,
    onBack: () => { window.location.href = './dashboard.html'; }
  });
}

initProtectedPage('Panorama da Empresa', renderContent);
