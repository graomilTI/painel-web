// assets/js/core/ui.js
// Componentes reutilizáveis do design system (fundação P0, itens 2.6 e 2.7).
//
// Mantém o visual atual do painel (dark theme, detalhes em verde, layout
// compacto) e concentra os blocos repetidos em todas as telas: cabeçalho,
// abas, KPIs, tabela com paginação/ordenação, modal, badges, toast, estados
// de loading/vazio/erro (com tentar novamente) e status de dados.
//
// CSS correspondente: assets/css/design-system-components.css (carregado
// automaticamente na primeira importação deste módulo).

const CSS_ID = 'dsComponentsStyles';
if (typeof document !== 'undefined' && !document.getElementById(CSS_ID)) {
  const link = document.createElement('link');
  link.id = CSS_ID;
  link.rel = 'stylesheet';
  link.href = new URL('../css/design-system-components.css?v=20260726-p0', import.meta.url).href;
  document.head.appendChild(link);
}

// ── utilidades ───────────────────────────────────────────────────────────────
export function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function dinheiro(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function dataBR(value) {
  if (!value) return '-';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : String(value);
}

export function dataHoraBR(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function debounce(fn, ms = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// ── blocos de página ─────────────────────────────────────────────────────────
export function pageHeader({ titulo, subtitulo = '' }) {
  return `
    <div class="ds-hero">
      <h2>${esc(titulo)}</h2>
      ${subtitulo ? `<p>${esc(subtitulo)}</p>` : ''}
    </div>`;
}

export function tabs({ itens, ativo, attr = 'data-ds-tab' }) {
  return `
    <div class="ds-tabs" role="tablist">
      ${itens.map((t) => `
        <button class="ds-tab ${t.id === ativo ? 'active' : ''}" ${attr}="${esc(t.id)}"
                type="button" role="tab" aria-selected="${t.id === ativo}">
          ${esc(t.label)}${t.badge != null ? ` <span class="ds-tab-badge">${esc(t.badge)}</span>` : ''}
        </button>`).join('')}
    </div>`;
}

export function kpis(itens) {
  return `
    <div class="ds-kpis">
      ${itens.map((k) => `
        <div class="ds-kpi">
          <span>${esc(k.label)}</span>
          <strong id="${esc(k.id || '')}">${esc(k.valor ?? '0')}</strong>
        </div>`).join('')}
    </div>`;
}

export function badge(texto, tipo = 'neutral') {
  // tipos: ok | warn | danger | neutral
  return `<span class="ds-badge ${esc(tipo)}">${esc(texto)}</span>`;
}

// ── estados de tela (loading / vazio / erro) ─────────────────────────────────
export function loadingState(mensagem = 'Carregando...') {
  return `<div class="ds-state ds-loading"><span class="ds-spinner"></span>${esc(mensagem)}</div>`;
}

export function emptyState(mensagem = 'Nenhum registro encontrado.', dica = '') {
  return `
    <div class="ds-state ds-empty">
      <div class="ds-empty-icon">∅</div>
      <div>${esc(mensagem)}</div>
      ${dica ? `<small>${esc(dica)}</small>` : ''}
    </div>`;
}

export function errorState(mensagem, { retryId = '' } = {}) {
  return `
    <div class="ds-state ds-error">
      <div>${esc(mensagem || 'Erro ao carregar os dados.')}</div>
      ${retryId ? `<button class="ds-btn ds-btn-retry" id="${esc(retryId)}" type="button">Tentar novamente</button>` : ''}
    </div>`;
}

export function accessDenied(modulo = '') {
  return `
    <div class="ds-state ds-error">
      <div>Você não tem permissão para acessar ${modulo ? `o módulo ${esc(modulo)}` : 'esta área'}.</div>
      <small>Solicite acesso em Diretoria → Usuários e Acessos.</small>
    </div>`;
}

// ── status de dados (item 2.7: monitoramento visível) ───────────────────────
export function dataStatus({ atualizadoEm, origem = 'Supabase', duracaoMs = null, erro = null }) {
  const quando = atualizadoEm ? dataHoraBR(atualizadoEm) : '-';
  const duracao = duracaoMs != null ? ` · ${(duracaoMs / 1000).toFixed(1)}s` : '';
  return `
    <div class="ds-data-status ${erro ? 'err' : ''}" title="${esc(erro || '')}">
      ${erro ? '⚠' : '✓'} Atualizado ${esc(quando)} · ${esc(origem)}${duracao}${erro ? ` · ${esc(erro)}` : ''}
    </div>`;
}

// ── tabela com paginação e ordenação ─────────────────────────────────────────
/**
 * table({ colunas, linhasHtml, vazio })
 * colunas: [{ id, label, sortable }]
 * A ordenação emite eventos via data-ds-sort para o módulo tratar.
 */
export function table({ colunas, linhasHtml, vazio = 'Nenhum registro.', ordenacao = null, minWidth = 760 }) {
  const ths = colunas.map((c) => {
    const dir = ordenacao?.coluna === c.id ? (ordenacao.asc ? '▲' : '▼') : '';
    return c.sortable
      ? `<th><button class="ds-th-sort" data-ds-sort="${esc(c.id)}" type="button">${esc(c.label)} <span>${dir}</span></button></th>`
      : `<th>${esc(c.label)}</th>`;
  }).join('');
  const corpo = linhasHtml && linhasHtml.length
    ? linhasHtml
    : `<tr><td colspan="${colunas.length}" class="ds-td-empty">${vazio}</td></tr>`;
  return `
    <div class="ds-table-wrap">
      <table class="ds-table" style="min-width:${Number(minWidth)}px">
        <thead><tr>${ths}</tr></thead>
        <tbody>${corpo}</tbody>
      </table>
    </div>`;
}

export function pagination({ pagina, porPagina, total, attr = 'data-ds-page' }) {
  const paginas = Math.max(1, Math.ceil((total || 0) / (porPagina || 1)));
  const de = total ? (pagina - 1) * porPagina + 1 : 0;
  const ate = Math.min(pagina * porPagina, total || 0);
  return `
    <div class="ds-pagination">
      <span>${de}–${ate} de ${total || 0}</span>
      <div class="ds-pagination-btns">
        <button class="ds-btn" ${attr}="${pagina - 1}" type="button" ${pagina <= 1 ? 'disabled' : ''}>‹ Anterior</button>
        <span class="ds-page-num">${pagina} / ${paginas}</span>
        <button class="ds-btn" ${attr}="${pagina + 1}" type="button" ${pagina >= paginas ? 'disabled' : ''}>Próxima ›</button>
      </div>
    </div>`;
}

// ── modal ────────────────────────────────────────────────────────────────────
export function openModal({ id = 'dsModal', conteudoHtml, aoFechar = null }) {
  closeModal(id);
  const overlay = document.createElement('div');
  overlay.className = 'ds-modal open';
  overlay.id = id;
  overlay.innerHTML = `<div class="ds-modal-card">${conteudoHtml}</div>`;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) { closeModal(id); aoFechar?.(); }
  });
  document.body.appendChild(overlay);
  return overlay;
}

export function closeModal(id = 'dsModal') {
  document.getElementById(id)?.remove();
}

// ── confirmação padrão (substitui window.confirm) ────────────────────────────
export function confirmar({ titulo = 'Confirmar ação', mensagem = 'Deseja continuar?', confirmarLabel = 'Confirmar', cancelarLabel = 'Cancelar' } = {}) {
  return new Promise((resolve) => {
    const overlay = openModal({
      id: 'dsConfirmModal',
      conteudoHtml: `
        <h3 class="ds-modal-title">${esc(titulo)}</h3>
        <p class="ds-modal-text">${esc(mensagem)}</p>
        <div class="ds-modal-actions">
          <button class="ds-btn" data-ds-cancel type="button">${esc(cancelarLabel)}</button>
          <button class="ds-btn ds-btn-primary" data-ds-ok type="button">${esc(confirmarLabel)}</button>
        </div>`,
      aoFechar: () => resolve(false),
    });
    overlay.querySelector('[data-ds-cancel]').addEventListener('click', () => { closeModal('dsConfirmModal'); resolve(false); });
    overlay.querySelector('[data-ds-ok]').addEventListener('click', () => { closeModal('dsConfirmModal'); resolve(true); });
  });
}

// ── toast ────────────────────────────────────────────────────────────────────
export function toast(mensagem, tipo = 'ok', duracaoMs = 3500) {
  let host = document.getElementById('dsToastHost');
  if (!host) {
    host = document.createElement('div');
    host.id = 'dsToastHost';
    host.className = 'ds-toast-host';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = `ds-toast ${tipo}`;
  el.textContent = mensagem;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, duracaoMs);
}
