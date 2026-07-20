import { supabase } from './supabaseClient.js';

const META_START = '[ALOJAMENTO_FATURA_V1]';
const META_END = '[/ALOJAMENTO_FATURA_V1]';
const state = { links: new Map(), loading: false, timer: null };

function extractMeta(observacoes) {
  const text = String(observacoes || '');
  const start = text.indexOf(META_START);
  const end = text.indexOf(META_END);
  if (start < 0 || end < start) return {};
  try {
    return JSON.parse(text.slice(start + META_START.length, end).trim()) || {};
  } catch {
    return {};
  }
}

function ensureStyles() {
  if (document.getElementById('finAlojFaturaStyles')) return;
  const style = document.createElement('style');
  style.id = 'finAlojFaturaStyles';
  style.textContent = `
    .fin-aloj-fatura-link{display:inline-flex!important;align-items:center;justify-content:center;gap:5px;width:auto!important;margin:0!important;padding:7px 10px!important;border:1px solid rgba(96,165,250,.34)!important;border-radius:9px!important;background:rgba(30,64,175,.15)!important;color:#bfdbfe!important;text-decoration:none!important;font-size:11px!important;font-weight:900!important;line-height:1!important;white-space:nowrap}
    .fin-aloj-fatura-link:hover{background:rgba(30,64,175,.28)!important;border-color:rgba(96,165,250,.58)!important;color:#eff6ff!important}
    .fin-aloj-fatura-link svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  `;
  document.head.appendChild(style);
}

function linkHtml(url) {
  const a = document.createElement('a');
  a.className = 'fin-aloj-fatura-link';
  a.dataset.finAlojFatura = '1';
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  a.innerHTML = '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"></path><path d="M14 2v6h6M8 13h8M8 17h6"></path></svg><span>Fatura</span>';
  return a;
}

function injectLinks() {
  const tbody = document.getElementById('setorPagamentosTbody');
  if (!tbody || !state.links.size) return;
  tbody.querySelectorAll('[data-pagar-setor],[data-ok-setor],[data-recusar-setor]').forEach((button) => {
    const id = button.dataset.pagarSetor || button.dataset.okSetor || button.dataset.recusarSetor;
    const url = state.links.get(String(id));
    if (!url) return;
    const actions = button.closest('.fin-pay-actions');
    if (!actions || actions.querySelector('[data-fin-aloj-fatura]')) return;
    actions.prepend(linkHtml(url));
  });
}

async function loadLinks() {
  if (state.loading) return;
  state.loading = true;
  try {
    const { data, error } = await supabase
      .from('financeiro_pagamentos')
      .select('id,observacoes')
      .eq('origem_tabela', 'hospedagem_alojamento_faturas')
      .limit(1000);
    if (error) throw error;
    state.links.clear();
    (data || []).forEach((row) => {
      const url = extractMeta(row.observacoes).arquivo_url;
      if (url) state.links.set(String(row.id), url);
    });
    injectLinks();
  } catch (error) {
    console.warn('[financeiro-alojamentos-faturas]', error?.message || error);
  } finally {
    state.loading = false;
  }
}

function schedule() {
  clearTimeout(state.timer);
  state.timer = setTimeout(() => {
    ensureStyles();
    injectLinks();
  }, 80);
}

if (!window.__financeiroAlojamentosFaturas) {
  window.__financeiroAlojamentosFaturas = true;
  ensureStyles();
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener('click', (event) => {
    if (event.target.closest('#btnReloadSetorPagamentos,[data-tab="pagamentos"],a[href*="#pagamentos"]')) setTimeout(loadLinks, 450);
  }, true);
  window.addEventListener('hashchange', () => setTimeout(loadLinks, 350));
}

loadLinks();
