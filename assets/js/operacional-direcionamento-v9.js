import { supabase } from './supabaseClient.js';

(function () {
  'use strict';

  const previousOpenHome = window.OPERACIONAL?.openHome;

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

  function posicaoKey(row) {
    const id = row?.veiculo_id || row?.bfleet_vehicle_id || row?.id_veiculo || row?.vehicle_id;
    if (id) return `id:${String(id)}`;
    const placa = placaNorm(row?.placa || row?.patente || row?.bfleet_placa);
    return placa ? `placa:${placa}` : '';
  }

  function veiculoKeys(row) {
    const keys = [];
    [row?.id, row?.bfleet_vehicle_id, row?.bfleet_id, row?.bfleet_idgps, row?.bfleet_device_id]
      .filter(Boolean)
      .forEach(id => keys.push(`id:${String(id)}`));

    [row?.placa, row?.placa_normalizada, row?.bfleet_placa, row?.bfleet_patente]
      .map(placaNorm)
      .filter(Boolean)
      .forEach(p => keys.push(`placa:${p}`));

    return [...new Set(keys)];
  }

  async function carregarKpisBfleet() {
    try {
      const [veiculosRes, posicoesRes] = await Promise.all([
        supabase
          .from('frotas_veiculos')
          .select('id,placa,placa_normalizada,status,possui_rastreador,rastreador_bfleet,bfleet_confirmado,bfleet_status,bfleet_id,bfleet_idgps,bfleet_device_id,bfleet_vehicle_id,bfleet_placa,bfleet_patente')
          .limit(5000),
        supabase
          .from('frotas_posicoes')
          .select('placa,veiculo_id,idgps,latitude,longitude')
          .limit(5000),
      ]);

      if (veiculosRes.error) throw veiculosRes.error;
      if (posicoesRes.error) throw posicoesRes.error;

      const veiculos = Array.isArray(veiculosRes.data) ? veiculosRes.data : [];
      const posicoes = Array.isArray(posicoesRes.data) ? posicoesRes.data : [];

      const ativos = veiculos.filter(ativo);
      const rastreados = ativos.filter(comRastreador);
      const posTodos = new Set();

      for (const p of posicoes) {
        const key = posicaoKey(p) || (p.idgps ? `id:${p.idgps}` : '');
        if (key) posTodos.add(key);
      }

      const rastreadosComPosicao = rastreados.filter(v => veiculoKeys(v).some(k => posTodos.has(k))).length;
      const comPosicao = Math.max(rastreadosComPosicao, posTodos.size);

      return {
        frotaAtiva: ativos.length,
        comRastreador: rastreados.length,
        comPosicao,
        semPosicao: Math.max(0, rastreados.length - comPosicao),
      };
    } catch (err) {
      console.warn('[opv9] falha ao carregar KPIs BFleet:', err?.message || err);
      return null;
    }
  }

  function setCard(card, label, value) {
    if (!card) return;
    const span = card.querySelector('span');
    const strong = card.querySelector('strong');
    if (span && span.textContent !== label) span.textContent = label;
    if (strong && strong.textContent !== String(value)) strong.textContent = String(value);
  }

  function aplicarKpis(root, kpis) {
    if (!root || !kpis) return;

    const cards = [...root.querySelectorAll('.opv2-kpi')];
    if (!cards.length) return;

    const byLabel = label => cards.find(el => norm(el.querySelector('span')?.textContent).includes(label));

    setCard(byLabel('VEICULOS C LEITURA') || byLabel('COM RASTREADOR'), 'Com rastreador', kpis.comRastreador);
    setCard(byLabel('FROTA NAS OS') || byLabel('COM POSICAO'), 'Com posição atual', kpis.comPosicao);
    setCard(byLabel('CARONA') || byLabel('SEM POSICAO'), 'Sem posição', kpis.semPosicao);
    setCard(byLabel('DISTANTES') || byLabel('FROTA ATIVA'), 'Frota ativa', kpis.frotaAtiva);
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

    const kpis = await carregarKpisBfleet();
    aplicarKpis(root, kpis);
    setTimeout(() => aplicarKpis(root, kpis), 250);

    console.info('[opv9] KPIs BFleet aplicados', kpis);
  }

  window.OPERACIONAL = { ...(window.OPERACIONAL || {}), openHome };
})();
