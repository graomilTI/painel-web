import { supabase } from './supabaseClient.js';

(function () {
  'use strict';

  const previousOpenHome = window.OPERACIONAL?.openHome;
  let observer = null;
  let kpis = null;

  function norm(v) {
    return String(v ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .trim();
  }

  function placaNorm(v) {
    return String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function ativo(row) {
    const s = norm(`${row?.status || ''} ${row?.situacao || ''}`);
    return !/INATIV|DESLIGAD|DEMITID|REMOVID|BAIXAD|VENDID|CANCELAD/.test(s);
  }

  function comRastreador(row) {
    return row?.rastreador_bfleet === true
      || row?.bfleet_confirmado === true
      || norm(row?.bfleet_status) === 'COM RASTREADOR'
      || norm(row?.bfleet_status) === 'COM_RASTREADOR';
  }

  async function carregarKpis() {
    if (kpis) return kpis;

    const [{ data: veiculos, error: vErr }, { data: posicoes, error: pErr }] = await Promise.all([
      supabase
        .from('frotas_veiculos')
        .select('id,placa,status,situacao,rastreador_bfleet,bfleet_confirmado,bfleet_status')
        .limit(5000),
      supabase
        .from('frotas_posicoes')
        .select('placa,veiculo_id')
        .limit(5000),
    ]);

    if (vErr) console.warn('[opv7] frotas_veiculos:', vErr.message || vErr);
    if (pErr) console.warn('[opv7] frotas_posicoes:', pErr.message || pErr);

    const veiculosAtivos = (veiculos || []).filter(ativo);
    const rastreador = veiculosAtivos.filter(comRastreador).length;

    const placas = new Set();
    const ids = new Set();
    for (const p of (posicoes || [])) {
      const placa = placaNorm(p.placa);
      if (placa) placas.add(placa);
      if (p.veiculo_id) ids.add(String(p.veiculo_id));
    }

    kpis = {
      frotaAtiva: veiculosAtivos.length,
      comRastreador: rastreador,
      comPosicao: Math.max(placas.size, ids.size),
      semPosicao: Math.max(0, rastreador - Math.max(placas.size, ids.size)),
    };

    return kpis;
  }

  function atualizarCardPorLabel(root, busca, novoLabel, valor) {
    const cards = [...root.querySelectorAll('.opv2-kpi')];
    const card = cards.find(el => norm(el.querySelector('span')?.textContent).includes(busca));
    if (!card) return false;

    const span = card.querySelector('span');
    const strong = card.querySelector('strong');
    if (span) span.textContent = novoLabel;
    if (strong) strong.textContent = String(valor);
    return true;
  }

  function garantirCard(root, label, valor) {
    const grid = root.querySelector('.opv2-kpis');
    if (!grid) return;

    const jaExiste = [...grid.querySelectorAll('.opv2-kpi span')]
      .some(span => norm(span.textContent) === norm(label));
    if (jaExiste) return;

    const div = document.createElement('div');
    div.className = 'opv2-kpi';
    div.innerHTML = `<span>${label}</span><strong>${valor}</strong>`;
    grid.appendChild(div);
  }

  function aplicarKpis(root) {
    if (!root || !kpis) return;

    atualizarCardPorLabel(root, 'VEICULOS C LEITURA', 'Com rastreador', kpis.comRastreador);
    atualizarCardPorLabel(root, 'FROTA NAS OS', 'Com posição atual', kpis.comPosicao);
    garantirCard(root, 'Sem posição', kpis.semPosicao);
    garantirCard(root, 'Frota ativa', kpis.frotaAtiva);
  }

  function observar(root) {
    if (!root) return;
    if (observer) observer.disconnect();

    observer = new MutationObserver(() => aplicarKpis(root));
    observer.observe(root, { childList: true, subtree: true });
  }

  async function openHome(root, opts = {}) {
    const kpiPromise = carregarKpis();

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
    await kpiPromise;
    aplicarKpis(root);

    console.info('[opv7] KPIs BFleet aplicados', kpis);
  }

  window.OPERACIONAL = { ...(window.OPERACIONAL || {}), openHome };
})();
