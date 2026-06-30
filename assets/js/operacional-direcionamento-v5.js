import { supabase } from './supabaseClient.js';

(function () {
  'use strict';

  const previousOpenHome = window.OPERACIONAL?.openHome;
  let cachedTotalVeiculos = null;
  let observer = null;

  function norm(v) {
    return String(v ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .trim();
  }

  function isAtivo(row) {
    const status = norm(`${row?.status || ''} ${row?.situacao || ''}`);
    return !/INATIV|DESLIGAD|DEMITID|REMOVID|BAIXAD|VENDID|CANCELAD/.test(status);
  }

  async function carregarTotalVeiculos() {
    if (cachedTotalVeiculos !== null) return cachedTotalVeiculos;

    try {
      const { data, error } = await supabase
        .from('frotas_veiculos')
        .select('id,placa,status,situacao')
        .limit(5000);

      if (error) throw error;

      cachedTotalVeiculos = (data || [])
        .filter(r => r?.id || r?.placa)
        .filter(isAtivo)
        .length;

      return cachedTotalVeiculos;
    } catch (err) {
      console.warn('[opv5] Falha ao carregar frotas_veiculos:', err?.message || err);
      return null;
    }
  }

  function atualizarCard(root, total) {
    if (!root || total == null) return;

    const cards = [...root.querySelectorAll('.opv2-kpi')];
    const card = cards.find(el => norm(el.querySelector('span')?.textContent).includes('VEICULOS C LEITURA'));
    if (!card) return;

    const strong = card.querySelector('strong');
    if (strong) strong.textContent = String(total);
  }

  async function corrigirKpi(root) {
    const total = await carregarTotalVeiculos();
    atualizarCard(root, total);
  }

  function observar(root) {
    if (!root) return;
    if (observer) observer.disconnect();

    observer = new MutationObserver(() => {
      if (cachedTotalVeiculos !== null) atualizarCard(root, cachedTotalVeiculos);
    });

    observer.observe(root, { childList: true, subtree: true });
  }

  async function openHome(root, opts = {}) {
    if (typeof previousOpenHome === 'function') {
      await previousOpenHome(root, opts);
    } else {
      root.innerHTML = `
        <article class="card">
          <h3>Operacional ADM</h3>
          <p>Não foi possível carregar o módulo operacional.</p>
        </article>
      `;
      return;
    }

    observar(root);
    await corrigirKpi(root);
    console.info('[opv5] KPI Veículos c/ leitura corrigido pela tabela frotas_veiculos', { total: cachedTotalVeiculos });
  }

  window.OPERACIONAL = { ...(window.OPERACIONAL || {}), openHome };
})();
