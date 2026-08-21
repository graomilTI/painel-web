import { supabase } from './supabaseClient.js';

const MAX_WIDTH = 768;
let saldoFiltro = '';
let raf = 0;
let supervisoesLiberadas = null;
let supervisoesErro = '';
let supervisoesPromise = null;

function isGestorMobile() {
  return document.body.classList.contains('mobile-gestor-mode') && window.innerWidth <= MAX_WIDTH;
}

function isAtualizarTab() {
  const active = document.querySelector('.log-tab.active');
  return active?.dataset?.tab === 'atualizar' || location.hash === '#atualizar';
}

function normalizeSupervisao(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

async function carregarSupervisoesLiberadas() {
  if (supervisoesPromise) return supervisoesPromise;

  if (isAtualizarTab()) {
    document.body.classList.add('logistica-atualizar-supervisao-pendente');
  }

  supervisoesPromise = (async () => {
    const { data, error } = await supabase
      .from('programacao_usuario_supervisoes')
      .select('supervisao')
      .eq('ativo', true);

    if (error) throw error;

    supervisoesLiberadas = new Set(
      (Array.isArray(data) ? data : [])
        .map((row) => normalizeSupervisao(row?.supervisao))
        .filter(Boolean)
    );
    supervisoesErro = '';
  })().catch((error) => {
    console.error('[logistica#atualizar] Falha ao carregar supervisões liberadas:', error);
    // Falha fechada: se a permissão não puder ser validada, nenhuma OS é exibida.
    supervisoesLiberadas = new Set();
    supervisoesErro = 'Não foi possível validar as supervisões liberadas para este usuário.';
  }).finally(() => {
    document.body.classList.remove('logistica-atualizar-supervisao-pendente');
    schedule();
  });

  return supervisoesPromise;
}

function parsePtBrNumber(value) {
  const text = String(value || '')
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '');
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function remanescenteDaLinha(row) {
  const cell = row.querySelector('td[data-label="Remanescente"]');
  if (!cell) return null;
  return parsePtBrNumber(cell.textContent);
}

function supervisaoDaLinha(row) {
  const cell = row.querySelector('td[data-label="O.S."]');
  if (!cell) return '';
  const detalhes = cell.querySelectorAll('small.muted');
  const supervisao = detalhes.length ? detalhes[detalhes.length - 1]?.textContent : '';
  return normalizeSupervisao(supervisao);
}

function atualizarAvisoSupervisao() {
  let aviso = document.getElementById('logisticaSupervisaoAviso');

  if (!isAtualizarTab() || supervisoesLiberadas === null || supervisoesLiberadas.size > 0) {
    aviso?.remove();
    return;
  }

  const anchor = document.querySelector('#logContent .atz-filtros') || document.querySelector('#logContent .log-table');
  if (!anchor) return;

  if (!aviso) {
    aviso = document.createElement('div');
    aviso.id = 'logisticaSupervisaoAviso';
    aviso.className = 'logistica-supervisao-aviso';
    anchor.parentElement?.insertBefore(aviso, anchor);
  }

  aviso.textContent = supervisoesErro || 'Nenhuma supervisão está liberada para este usuário.';
}

function aplicarFiltroSupervisao() {
  if (!isAtualizarTab()) {
    document.querySelectorAll('#logContent tr.atz-supervisao-hidden').forEach((row) => {
      row.classList.remove('atz-supervisao-hidden');
    });
    atualizarAvisoSupervisao();
    return;
  }

  const rows = document.querySelectorAll('#logContent .log-table tbody tr[data-os-row]');

  if (supervisoesLiberadas === null) {
    rows.forEach((row) => row.classList.add('atz-supervisao-hidden'));
    return;
  }

  rows.forEach((row) => {
    const supervisao = supervisaoDaLinha(row);
    const liberada = Boolean(supervisao) && supervisoesLiberadas.has(supervisao);
    row.classList.toggle('atz-supervisao-hidden', !liberada);
  });

  atualizarAvisoSupervisao();
}

function aplicarFiltroSaldo() {
  if (!isGestorMobile() || !isAtualizarTab()) return;
  const rows = document.querySelectorAll('#logContent .log-table tbody tr[data-os-row]');
  rows.forEach((row) => {
    const valor = remanescenteDaLinha(row);
    const ocultar = saldoFiltro === 'zero'
      ? valor !== 0
      : saldoFiltro === 'negativo'
        ? !(valor < 0)
        : false;
    row.classList.toggle('atz-saldo-hidden', ocultar);
  });
}

function atualizarBotoes() {
  document.querySelectorAll('[data-atualizar-saldo-filter]').forEach((btn) => {
    const active = btn.dataset.atualizarSaldoFilter === saldoFiltro;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function criarBotao(label, value) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'atz-saldo-filter-btn';
  button.dataset.atualizarSaldoFilter = value;
  button.textContent = label;
  button.setAttribute('aria-pressed', 'false');
  return button;
}

function organizarFiltros() {
  if (!isGestorMobile() || !isAtualizarTab()) return;
  const filtros = document.querySelector('#logContent .atz-filtros');
  if (!filtros) return;

  if (!filtros.classList.contains('atz-filtros-organizados')) {
    const inputs = [...filtros.querySelectorAll(':scope > input')];
    if (inputs.length >= 4) {
      const campos = document.createElement('div');
      campos.className = 'atz-filtros-campos';
      inputs.slice(0, 4).forEach((input) => campos.appendChild(input));

      const saldo = document.createElement('div');
      saldo.className = 'atz-saldo-filtros';
      saldo.append(
        criarBotao('Saldo Zerado', 'zero'),
        criarBotao('Saldo Negativo', 'negativo'),
      );

      filtros.append(campos, saldo);
      filtros.classList.add('atz-filtros-organizados');
    }
  }

  atualizarBotoes();
  aplicarFiltroSaldo();
}

function injectStyles() {
  if (document.getElementById('logisticaAtualizarMobileFiltrosStyles')) return;
  const style = document.createElement('style');
  style.id = 'logisticaAtualizarMobileFiltrosStyles';
  style.textContent = `
    #logContent tr.atz-supervisao-hidden,
    body.logistica-atualizar-supervisao-pendente #logContent tr[data-os-row] {
      display: none !important;
    }

    #logContent .logistica-supervisao-aviso {
      margin: 10px 0 12px;
      padding: 11px 13px;
      border: 1px solid rgba(245,158,11,.30);
      border-radius: 12px;
      background: rgba(245,158,11,.08);
      color: #fde68a;
      font-size: 12px;
      font-weight: 700;
    }

    @media (max-width: ${MAX_WIDTH}px) {
      body.mobile-gestor-mode #logContent .atz-filtros-organizados {
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) 112px !important;
        gap: 8px !important;
        align-items: stretch !important;
        margin: 10px 0 12px !important;
      }

      body.mobile-gestor-mode #logContent .atz-filtros-campos {
        display: grid !important;
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        gap: 7px !important;
        min-width: 0 !important;
      }

      body.mobile-gestor-mode #logContent .atz-filtros-campos .log-input {
        width: 100% !important;
        min-width: 0 !important;
        min-height: 40px !important;
        margin: 0 !important;
        padding: 8px 10px !important;
        border-radius: 10px !important;
        background: var(--bg-soft) !important;
        border-color: var(--line-2) !important;
        color: var(--text) !important;
        font-size: 12px !important;
      }

      body.mobile-gestor-mode #logContent .atz-saldo-filtros {
        display: grid !important;
        grid-template-rows: 1fr 1fr !important;
        gap: 7px !important;
        min-width: 0 !important;
      }

      body.mobile-gestor-mode #logContent .atz-saldo-filter-btn {
        width: 100% !important;
        min-width: 0 !important;
        min-height: 40px !important;
        padding: 6px 7px !important;
        border: 1px solid var(--line-2) !important;
        border-radius: 10px !important;
        background: var(--bg-card) !important;
        color: var(--muted) !important;
        font-family: 'DM Sans', system-ui, -apple-system, sans-serif !important;
        font-size: 10px !important;
        line-height: 1.1 !important;
        font-weight: 800 !important;
        text-align: center !important;
        cursor: pointer !important;
      }

      body.mobile-gestor-mode #logContent .atz-saldo-filter-btn.active {
        background: var(--green-soft) !important;
        border-color: var(--green-2) !important;
        color: var(--text) !important;
      }

      body.mobile-gestor-mode #logContent tr.atz-saldo-hidden {
        display: none !important;
      }

      body.mobile-gestor-mode #logContent .atz-acoes {
        display: grid !important;
        grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
        gap: 7px !important;
        width: 100% !important;
      }

      body.mobile-gestor-mode #logContent .atz-acao-btn {
        width: 100% !important;
        min-width: 0 !important;
        min-height: 44px !important;
        padding: 7px 5px !important;
        border-radius: 10px !important;
        white-space: nowrap !important;
      }
    }
  `;
  document.head.appendChild(style);
}

function schedule() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    aplicarFiltroSupervisao();
    organizarFiltros();
  });
}

injectStyles();
carregarSupervisoesLiberadas();

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-atualizar-saldo-filter]');
  if (!button) return;
  const value = button.dataset.atualizarSaldoFilter;
  saldoFiltro = saldoFiltro === value ? '' : value;
  atualizarBotoes();
  aplicarFiltroSaldo();
});

new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('resize', schedule, { passive: true });
window.addEventListener('hashchange', () => {
  if (isAtualizarTab() && supervisoesLiberadas === null) {
    document.body.classList.add('logistica-atualizar-supervisao-pendente');
  } else {
    document.body.classList.remove('logistica-atualizar-supervisao-pendente');
  }
  schedule();
});
schedule();
