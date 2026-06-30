import { supabase } from './supabaseClient.js';

(function () {
  'use strict';

  const previousOpenHome = window.OPERACIONAL?.openHome;
  let observer = null;
  let painel = {
    frotaAtiva: null,
    comRastreador: null,
    comPosicao: null,
    semPosicao: null,
  };

  const norm = v => String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();

  const placaNorm = v => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  function ativo(row) {
    const s = norm(row?.status || '');
    return !/INATIV|DESLIGAD|DEMITID|REMOVID|BAIXAD|VENDID|CANCELAD/.test(s);
  }

  function comRastreador(row) {
    return row?.rastreador_bfleet === true
      || row?.bfleet_confirmado === true
      || row?.possui_rastreador === true
      || norm(row?.bfleet_status) === 'COM RASTREADOR'
      || norm(row?.bfleet_status) === 'COM_RASTREADOR';
  }

  async function safeSelect(table, columns) {
    try {
      const { data, error } = await supabase.from(table).select(columns).limit(5000);
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.warn(`[opv8] ${table}:`, err?.message || err);
      return [];
    }
  }

  function latitudeFrom(row) {
    const fields = ['latitude', 'lat', 'latitud', 'ultima_latitude', 'posicao_latitude'];
    for (const f of fields) {
      const n = Number(String(row?.[f] ?? '').replace(',', '.'));
      if (Number.isFinite(n)) return n;
    }
    return null;
  }

  function longitudeFrom(row) {
    const fields = ['longitude', 'lng', 'lon', 'longitud', 'ultima_longitude', 'posicao_longitude'];
    for (const f of fields) {
      const n = Number(String(row?.[f] ?? '').replace(',', '.'));
      if (Number.isFinite(n)) return n;
    }
    return null;
  }

  function posicaoKey(row) {
    const id = row?.veiculo_id || row?.bfleet_vehicle_id || row?.id_veiculo || row?.vehicle_id;
    if (id) return `id:${String(id)}`;
    const placa = placaNorm(row?.placa || row?.patente || row?.bfleet_placa);
    return placa ? `placa:${placa}` : '';
  }

  function veiculoKeys(row) {
    const keys = [];
    const ids = [
      row?.id,
      row?.bfleet_vehicle_id,
      row?.bfleet_id,
      row?.bfleet_idgps,
      row?.bfleet_device_id,
    ].filter(Boolean);
    ids.forEach(id => keys.push(`id:${String(id)}`));

    [
      row?.placa,
      row?.placa_normalizada,
      row?.bfleet_placa,
      row?.bfleet_patente,
    ].map(placaNorm).filter(Boolean).forEach(p => keys.push(`placa:${p}`));

    return [...new Set(keys)];
  }

  async function carregarPainelBfleet() {
    const [veiculos, posicoes] = await Promise.all([
      safeSelect('frotas_veiculos', 'id,placa,placa_normalizada,status,possui_rastreador,rastreador_bfleet,bfleet_confirmado,bfleet_status,bfleet_id,bfleet_idgps,bfleet_device_id,bfleet_vehicle_id,bfleet_placa,bfleet_patente'),
      safeSelect('frotas_posicoes', '*'),
    ]);

    const ativos = veiculos.filter(ativo);
    const rastreados = ativos.filter(comRastreador);

    const posComCoord = [];
    const posTodos = new Set();

    for (const p of posicoes) {
      const key = posicaoKey(p);
      if (key) posTodos.add(key);

      const la = latitudeFrom(p);
      const lo = longitudeFrom(p);
      if (Number.isFinite(la) && Number.isFinite(lo)) posComCoord.push({ ...p, __key: key, __lat: la, __lng: lo });
    }

    const rastreadosComPosicao = rastreados.filter(v => {
      const keys = veiculoKeys(v);
      return keys.some(k => posTodos.has(k));
    }).length;

    const posicaoAtual = Math.max(rastreadosComPosicao, posTodos.size, posComCoord.length);

    painel = {
      frotaAtiva: ativos.length,
      comRastreador: rastreados.length,
      comPosicao: posicaoAtual,
      semPosicao: Math.max(0, rastreados.length - posicaoAtual),
    };

    return painel;
  }

  function setCard(card, label, value) {
    const span = card?.querySelector('span');
    const strong = card?.querySelector('strong');
    if (span) span.textContent = label;
    if (strong) strong.textContent = String(value);
  }

  function aplicarCards(root) {
    if (!root || painel.comRastreador == null) return;
    const cards = [...root.querySelectorAll('.opv2-kpi')];

    const cardVeiculos = cards.find(el => norm(el.querySelector('span')?.textContent).includes('VEICULOS C LEITURA'))
      || cards.find(el => norm(el.querySelector('span')?.textContent).includes('COM RASTREADOR'));
    const cardFrotaOs = cards.find(el => norm(el.querySelector('span')?.textContent).includes('FROTA NAS OS'))
      || cards.find(el => norm(el.querySelector('span')?.textContent).includes('COM POSICAO'));
    const cardCarona = cards.find(el => norm(el.querySelector('span')?.textContent).includes('CARONA'))
      || cards.find(el => norm(el.querySelector('span')?.textContent).includes('SEM POSICAO'));
    const cardDistantes = cards.find(el => norm(el.querySelector('span')?.textContent).includes('DISTANTES'))
      || cards.find(el => norm(el.querySelector('span')?.textContent).includes('FROTA ATIVA'));

    setCard(cardVeiculos, 'Com rastreador', painel.comRastreador);
    setCard(cardFrotaOs, 'Com posição atual', painel.comPosicao);
    setCard(cardCarona, 'Sem posição', painel.semPosicao);
    setCard(cardDistantes, 'Frota ativa', painel.frotaAtiva);
  }

  function observar(root) {
    if (!root) return;
    if (observer) observer.disconnect();

    observer = new MutationObserver(() => aplicarCards(root));
    observer.observe(root, { childList: true, subtree: true });
  }

  async function openHome(root, opts = {}) {
    const painelPromise = carregarPainelBfleet();

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
    await painelPromise;
    aplicarCards(root);

    console.info('[opv8] KPIs BFleet/posição aplicados', painel);
  }

  window.OPERACIONAL = { ...(window.OPERACIONAL || {}), openHome };
})();
