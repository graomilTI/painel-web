import { supabase } from './supabaseClient.js';

(function () {
  'use strict';

  const styleId = 'operacional-direcionamento-styles';
  const leafletCssId = 'leaflet-css-operacional';
  const leafletJsId = 'leaflet-js-operacional';
  const INDICACOES_KEY = 'operacional_indicacoes_v1';

  const BRAZIL_LAT_MIN = -33.77;
  const BRAZIL_LAT_MAX = 5.28;
  const BRAZIL_LNG_MIN = -73.99;
  const BRAZIL_LNG_MAX = -28.84;

  const state = {
    pontos: [],
    colaboradores: [],
    hoteis: [],
    passagens: [],
    auditorias: [],
    selectedPontoId: '',
    ranking: [],
    map: null,
    layers: [],
    loaded: false,
    indicacoes: {},
    foraDoMapa: { colaboradores: [], pontos: [] },
  };

  function safeText(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[char]));
  }

  function n(value, fallback = 0) {
    const parsed = Number(String(value ?? '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function money(value) {
    return n(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function normalize(value) {
    return String(value || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .trim().toUpperCase();
  }

  function toRad(value) {
    return (Number(value) * Math.PI) / 180;
  }

  function distanciaKm(aLat, aLon, bLat, bLon) {
    const lat1 = Number(aLat);
    const lon1 = Number(aLon);
    const lat2 = Number(bLat);
    const lon2 = Number(bLon);
    if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const x = Math.sin(dLat / 2) ** 2
      + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return Math.round((R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))) * 100) / 100;
  }

  function isInsideBrazil(lat, lng) {
    const la = Number(lat);
    const lo = Number(lng);
    return Number.isFinite(la) && Number.isFinite(lo)
      && la >= BRAZIL_LAT_MIN && la <= BRAZIL_LAT_MAX
      && lo >= BRAZIL_LNG_MIN && lo <= BRAZIL_LNG_MAX;
  }

  function loadIndicacoesFromStorage() {
    try {
      const raw = localStorage.getItem(INDICACOES_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }

  function saveIndicacoes() {
    try {
      localStorage.setItem(INDICACOES_KEY, JSON.stringify(state.indicacoes));
    } catch {}
  }

  function indicarColab(pontoId, colabId) {
    const pId = String(pontoId);
    const cId = String(colabId);
    if (!state.indicacoes[pId]) state.indicacoes[pId] = [];
    if (!state.indicacoes[pId].includes(cId)) state.indicacoes[pId].push(cId);
    saveIndicacoes();
  }

  function removerIndicacao(pontoId, colabId) {
    const pId = String(pontoId);
    if (!state.indicacoes[pId]) return;
    state.indicacoes[pId] = state.indicacoes[pId].filter(id => id !== String(colabId));
    if (!state.indicacoes[pId].length) delete state.indicacoes[pId];
    saveIndicacoes();
  }

  function isIndicadoNoPonto(pontoId, colabId) {
    return (state.indicacoes[String(pontoId)] || []).includes(String(colabId));
  }

  function getAssignedElsewhere(currentPontoId) {
    const assigned = new Set();
    Object.entries(state.indicacoes).forEach(([pId, ids]) => {
      if (String(pId) !== String(currentPontoId)) ids.forEach(id => assigned.add(id));
    });
    return assigned;
  }

  function ensureStyles() {
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .op-shell{display:flex;flex-direction:column;gap:18px;color:#e2e2f0;padding-bottom:36px}
      .op-card{border:1px solid rgba(51,65,85,.7);border-radius:24px;background:linear-gradient(180deg,rgba(15,23,42,.94),rgba(2,6,23,.78));box-shadow:0 18px 50px rgba(0,0,0,.20);overflow:hidden}
      .op-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:18px 18px 0}
      .op-card-head h3{margin:0;color:#f8fafc;font-size:18px}.op-card-head p{margin:5px 0 0;color:#6b7280;font-size:13px;line-height:1.45}
      .op-hero{position:relative;overflow:hidden;border:1px solid rgba(34,197,94,.18);background:linear-gradient(135deg,rgba(6,78,59,.48),rgba(2,6,23,.85));border-radius:24px;padding:22px;box-shadow:0 24px 80px rgba(0,0,0,.22)}
      .op-kicker{display:inline-flex;align-items:center;gap:8px;padding:6px 10px;border-radius:999px;border:1px solid rgba(74,222,128,.22);background:rgba(22,101,52,.18);font-size:12px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#bbf7d0}
      .op-hero h2{margin:14px 0 8px;font-size:clamp(25px,3vw,38px);line-height:1.05;color:#f8fafc}.op-hero p{margin:0;max-width:980px;color:#cbd5e1;line-height:1.6}
      .op-form{display:grid;grid-template-columns:2fr repeat(4,minmax(120px,1fr)) auto;gap:12px;align-items:end;margin-top:18px}
      .op-field{display:flex;flex-direction:column;gap:7px}.op-field label{font-size:12px;color:#6b7280;font-weight:900;text-transform:uppercase;letter-spacing:.06em}
      .op-field input,.op-field select{width:100%;box-sizing:border-box;border:1px solid rgba(51,65,85,.9);border-radius:14px;background:#0d0d18;color:#e2e2f0;padding:11px 12px;outline:none;color-scheme:dark;min-height:43px}
      .op-field select option{background:#0d0d18;color:#e2e2f0}.op-field input:focus,.op-field select:focus{border-color:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.14)}
      .op-btn{border:1px solid rgba(34,197,94,.38);border-radius:14px;background:linear-gradient(135deg,#166534,#15803d);color:#ecfdf5;font-weight:900;padding:12px 16px;cursor:pointer;min-height:43px;white-space:nowrap;box-shadow:0 10px 24px rgba(22,101,52,.22)}
      .op-btn.secondary{background:rgba(15,23,42,.72);border-color:rgba(148,163,184,.25);box-shadow:none;color:#e2e2f0}.op-btn:hover{filter:brightness(1.08)}.op-btn:disabled{opacity:.55;cursor:not-allowed}
      .op-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.op-metric{border:1px solid rgba(51,65,85,.7);border-radius:20px;background:rgba(15,23,42,.72);padding:16px}.op-metric span{font-size:12px;color:#6b7280;text-transform:uppercase;font-weight:900;letter-spacing:.06em}.op-metric strong{display:block;margin-top:8px;font-size:24px;color:#f8fafc}
      .op-layout{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(360px,.65fr);gap:18px;align-items:stretch}.op-map{height:560px;margin:18px;border-radius:22px;overflow:hidden;border:1px solid rgba(51,65,85,.7);background:#052e24;position:relative}.op-map .leaflet-control-attribution{background:rgba(2,6,23,.68);color:#6b7280}.op-map .leaflet-control-attribution a{color:#bbf7d0}.op-map-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;color:#cbd5e1;background:radial-gradient(circle at center,rgba(34,197,94,.18),transparent 38%),#052e24;z-index:1}.op-map-empty strong{display:block;color:#f8fafc;font-size:18px;margin-bottom:6px}
      .op-list{display:flex;flex-direction:column;gap:10px;padding:18px;max-height:560px;overflow:auto}.op-point,.op-rank{border:1px solid rgba(51,65,85,.72);background:rgba(15,23,42,.74);border-radius:18px;padding:13px;cursor:pointer;transition:.18s ease}.op-point:hover,.op-rank:hover{border-color:rgba(34,197,94,.5);transform:translateY(-1px)}.op-point.active{border-color:#22c55e;background:rgba(22,101,52,.20)}.op-point strong,.op-rank strong{display:block;color:#f8fafc}.op-point span,.op-rank span{display:block;margin-top:4px;color:#6b7280;font-size:12px;line-height:1.35}
      .op-rank{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;cursor:default}.op-rank-pos{width:34px;height:34px;display:flex;align-items:center;justify-content:center;border-radius:12px;background:rgba(22,101,52,.75);color:#dcfce7;font-weight:900}.op-score{text-align:right}.op-score strong{font-size:20px;color:#bbf7d0}.op-score span{text-transform:uppercase;font-weight:900}
      .op-rank.indicado{border-color:rgba(34,197,94,.5);background:rgba(22,101,52,.12)}
      .op-table-wrap{overflow:auto;padding:0 18px 18px}.op-table{width:100%;border-collapse:separate;border-spacing:0 10px;min-width:1120px}.op-table th{text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.07em;padding:0 12px 2px}.op-table td{background:rgba(15,23,42,.78);border-top:1px solid rgba(51,65,85,.7);border-bottom:1px solid rgba(51,65,85,.7);padding:13px 12px;color:#e2e2f0}.op-table td:first-child{border-left:1px solid rgba(51,65,85,.7);border-radius:14px 0 0 14px;font-weight:900;color:#f8fafc}.op-table td:last-child{border-right:1px solid rgba(51,65,85,.7);border-radius:0 14px 14px 0}.op-pill{display:inline-flex;align-items:center;border-radius:999px;padding:5px 9px;font-size:12px;font-weight:900;border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.7);white-space:nowrap}.op-pill.ok{color:#bbf7d0;background:rgba(22,101,52,.22)}.op-pill.warn{color:#fde68a;background:rgba(120,53,15,.22)}.op-pill.bad{color:#fecaca;background:rgba(127,29,29,.22)}.op-pill.muted{color:#cbd5e1;background:rgba(51,65,85,.32)}
      .op-alert{border:1px solid rgba(251,191,36,.3);border-radius:18px;background:rgba(120,53,15,.14);color:#fde68a;padding:14px 16px;line-height:1.45}.op-alert strong{color:#fef3c7}.op-alert.danger{border-color:rgba(239,68,68,.3);background:rgba(127,29,29,.14);color:#fecaca}.op-alert.danger strong{color:#fee2e2}
      .op-actions{display:flex;gap:10px;flex-wrap:wrap}.op-loading{opacity:.72;pointer-events:none}.op-select-line{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.op-select-line .op-pill{cursor:pointer}
      .op-direcionar-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 0;border-bottom:1px solid rgba(51,65,85,.35)}.op-direcionar-row:last-child{border-bottom:none}
      @media(max-width:1180px){.op-layout{grid-template-columns:1fr}.op-form{grid-template-columns:repeat(2,minmax(0,1fr))}.op-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.op-form .op-actions{grid-column:1/-1}}
      @media(max-width:680px){.op-form,.op-summary{grid-template-columns:1fr}.op-map{height:430px;margin:12px}.op-card-head{padding:14px 14px 0}.op-list{padding:14px;max-height:420px}.op-table-wrap{padding:0 14px 14px}}
    `;
    document.head.appendChild(style);
  }

  function loadScript(src, id) {
    return new Promise((resolve, reject) => {
      if (document.getElementById(id)) return resolve();
      const s = document.createElement('script');
      s.id = id;
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function loadCss(href, id) {
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  async function ensureLeaflet() {
    if (window.L) return true;
    try {
      loadCss('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', leafletCssId);
      await loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', leafletJsId);
      return Boolean(window.L);
    } catch (err) {
      console.warn('[Operacional] Leaflet indisponível, usando mapa simplificado.', err);
      return false;
    }
  }

  async function selectFrom(table, columns, orderColumn, limit = 2000) {
    try {
      let query = supabase.from(table).select(columns).limit(limit);
      if (orderColumn) query = query.order(orderColumn, { ascending: true });
      const { data, error } = await query;
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.warn(`[Operacional] Falha ao carregar ${table}:`, err?.message || err);
      return [];
    }
  }

  async function selectAll(table, orderColumn, limit = 3000) {
    try {
      let query = supabase.from(table).select('*').limit(limit);
      if (orderColumn) query = query.order(orderColumn, { ascending: true });
      const { data, error } = await query;
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.warn(`[Operacional] Falha ao carregar ${table}:`, err?.message || err);
      return [];
    }
  }

  function firstValue(row, fields) {
    for (const field of fields) {
      const value = row?.[field];
      if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return null;
  }

  function parseLatLngFromMaps(value) {
    const text = String(value || '');
    if (!text) return { latitude: null, longitude: null };
    const atMatch = text.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
    if (atMatch) return { latitude: Number(atMatch[1]), longitude: Number(atMatch[2]) };
    const qMatch = text.match(/[?&](?:q|query|ll)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
    if (qMatch) return { latitude: Number(qMatch[1]), longitude: Number(qMatch[2]) };
    const generic = text.match(/(-?\d{1,2}\.\d{4,})[,\s]+(-?\d{1,3}\.\d{4,})/);
    if (generic) return { latitude: Number(generic[1]), longitude: Number(generic[2]) };
    return { latitude: null, longitude: null };
  }

  function normalizeHotelRow(row, fonte = 'Hospedagem') {
    const maps = parseLatLngFromMaps(firstValue(row, ['link_maps', 'maps', 'google_maps', 'url_maps']));
    const latitude = firstValue(row, ['latitude', 'lat']) ?? maps.latitude;
    const longitude = firstValue(row, ['longitude', 'lng', 'lon']) ?? maps.longitude;
    const status = String(firstValue(row, ['status', 'situacao']) || '').trim().toUpperCase();
    const ativo = row?.ativo !== false && !['INATIVO', 'INATIVA', 'CANCELADO', 'CANCELADA', 'BLOQUEADO', 'BLOQUEADA'].includes(status);
    return {
      id: row?.id,
      nome: firstValue(row, ['nome', 'hotel', 'nome_hotel', 'razao_social']) || 'Hotel sem nome',
      cidade: firstValue(row, ['cidade', 'cidade_hotel']) || '',
      uf: String(firstValue(row, ['uf', 'estado', 'uf_hotel']) || '').trim().toUpperCase(),
      latitude,
      longitude,
      diaria_individual: firstValue(row, ['valor_diaria_individual', 'diaria_individual', 'valor_individual', 'individual', 'valor_diaria_padrao', 'diaria_padrao']),
      diaria_duplo: firstValue(row, ['valor_diaria_duplo', 'diaria_duplo', 'valor_duplo', 'duplo']),
      diaria_triplo: firstValue(row, ['valor_diaria_triplo', 'diaria_triplo', 'valor_triplo', 'triplo']),
      diaria_quadruplo: firstValue(row, ['valor_diaria_quadruplo', 'diaria_quadruplo', 'valor_quadruplo', 'quadruplo']),
      prioridade: firstValue(row, ['prioridade']) || 'NORMAL',
      status: status || 'ATIVO',
      ativo,
      fonte,
      raw: row,
    };
  }

  function dedupeHoteis(hoteis) {
    const seen = new Set();
    return hoteis.filter((h) => {
      const key = normalize(`${h.nome}|${h.cidade}|${h.uf}|${h.fonte}`);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function loadData() {
    const [pontos, colaboradores, hoteisHospedagem, hoteisOperacional, passagens, auditorias] = await Promise.all([
      selectFrom('operacional_pontos_embarque', 'id,tipo_local,nome_local,uf,cidade,latitude,longitude,supervisao,coordenacao,ativo', 'nome_local', 3000),
      selectFrom('operacional_colaborador_base', 'id,colaborador_id,nome,cpf,tipo_mao_obra,empresa,coordenacao,supervisao,cidade_base,uf_base,latitude,longitude,valor_diaria,valor_alimentacao,ativo', 'nome', 3000),
      selectAll('hospedagem_hoteis', 'cidade', 3000),
      selectAll('operacional_hoteis', 'nome', 2000),
      selectFrom('operacional_passagens_cache', 'origem_cidade,origem_uf,destino_cidade,destino_uf,valor_estimado,data_cotacao,validade_ate', 'data_cotacao', 5000),
      selectFrom('operacional_auditoria_colaborador', 'colaborador_id,nome_colaborador,nome_chave,score_impacto,severidade,data_evento,resultado,motivo_recusa,local_embarque,cidade_embarque,uf_destino,produto,desconto_kg,ativo', 'data_evento', 5000),
    ]);

    // Detect out-of-Brazil coordinates before filtering
    const foraColab = colaboradores.filter(c =>
      c.ativo !== false
      && Number.isFinite(Number(c.latitude)) && Number.isFinite(Number(c.longitude))
      && !isInsideBrazil(c.latitude, c.longitude)
    );
    const foraPontos = pontos.filter(p =>
      p.ativo !== false
      && Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude))
      && !isInsideBrazil(p.latitude, p.longitude)
    );
    state.foraDoMapa = { colaboradores: foraColab, pontos: foraPontos };

    // Pontos fora do Brasil são excluídos (coordenada inválida = ponto inutilizável)
    state.pontos = pontos.filter((p) =>
      p.ativo !== false && isInsideBrazil(p.latitude, p.longitude)
    );

    // Colaboradores fora do Brasil têm coordenadas zeradas (aparecem no ranking sem km)
    state.colaboradores = colaboradores.filter((c) => c.ativo !== false).map((c) =>
      isInsideBrazil(c.latitude, c.longitude) ? c : { ...c, latitude: null, longitude: null }
    );

    state.hoteis = dedupeHoteis([
      ...hoteisHospedagem.map((h) => normalizeHotelRow(h, 'Hospedagem')),
      ...hoteisOperacional.map((h) => normalizeHotelRow(h, 'Operacional')),
    ]).filter((h) => h.ativo && h.nome && h.cidade && h.uf);
    state.passagens = passagens;
    state.auditorias = auditorias.filter((a) => a.ativo !== false);
    state.loaded = true;

    if (!state.selectedPontoId && state.pontos[0]) state.selectedPontoId = state.pontos[0].id;
  }

  function selectedPonto() {
    return state.pontos.find((p) => String(p.id) === String(state.selectedPontoId)) || state.pontos[0] || null;
  }

  function getForm(container) {
    return {
      pontoId: container.querySelector('#opPonto')?.value || state.selectedPontoId,
      volume: n(container.querySelector('#opVolume')?.value, 0),
      dias: Math.max(1, n(container.querySelector('#opDias')?.value, 1)),
      qtd: Math.max(1, n(container.querySelector('#opQtd')?.value, 1)),
      tipo: container.querySelector('#opTipo')?.value || 'todos',
      busca: normalize(container.querySelector('#opBusca')?.value || ''),
    };
  }

  function hotelDiariaPorEquipe(hotel, qtdEquipe = 1) {
    const qtd = Math.max(1, n(qtdEquipe, 1));
    const individual = n(hotel?.diaria_individual, 0);
    const duplo = n(hotel?.diaria_duplo, 0);
    const triplo = n(hotel?.diaria_triplo, 0);
    const quadruplo = n(hotel?.diaria_quadruplo, 0);
    const fallback = individual || duplo || triplo || quadruplo || 0;

    if (qtd <= 1) return { diaria: individual || fallback, tipo_quarto: 'individual', quartos: 1 };
    if (qtd === 2) return { diaria: duplo || individual || fallback, tipo_quarto: 'duplo', quartos: 1 };
    if (qtd === 3) return { diaria: triplo || duplo || individual || fallback, tipo_quarto: 'triplo', quartos: 1 };

    const quartos = Math.ceil(qtd / 4);
    return { diaria: (quadruplo || triplo || duplo || individual || fallback) * quartos, tipo_quarto: 'quádruplo', quartos };
  }

  function hotelMaisProximo(ponto, qtdEquipe = 1) {
    if (!ponto) return null;

    const enrich = (h) => {
      const distancia = distanciaKm(h.latitude, h.longitude, ponto.latitude, ponto.longitude);
      const diariaInfo = hotelDiariaPorEquipe(h, qtdEquipe);
      return {
        ...h,
        distancia,
        diaria: diariaInfo.diaria,
        tipo_quarto: diariaInfo.tipo_quarto,
        quartos: diariaInfo.quartos,
        mesma_cidade: normalize(h.cidade) === normalize(ponto.cidade) && normalize(h.uf) === normalize(ponto.uf),
      };
    };

    const daCidade = state.hoteis
      .filter((h) => normalize(h.cidade) === normalize(ponto.cidade) && normalize(h.uf) === normalize(ponto.uf))
      .map(enrich)
      .sort((a, b) => {
        const prioridadeA = normalize(a.prioridade).includes('ALTA') ? 0 : 1;
        const prioridadeB = normalize(b.prioridade).includes('ALTA') ? 0 : 1;
        return prioridadeA - prioridadeB
          || n(a.diaria, 999999) - n(b.diaria, 999999)
          || n(a.distancia, 999999) - n(b.distancia, 999999);
      });
    if (daCidade[0]) return daCidade[0];

    const comCoordenadas = state.hoteis
      .map(enrich)
      .filter((h) => Number.isFinite(Number(h.distancia)))
      .sort((a, b) => n(a.distancia, 999999) - n(b.distancia, 999999) || n(a.diaria, 999999) - n(b.diaria, 999999));
    return comCoordenadas[0] || null;
  }

  function passagemPara(colab, ponto) {
    const match = state.passagens
      .filter((p) => normalize(p.origem_cidade) === normalize(colab.cidade_base)
        && normalize(p.origem_uf) === normalize(colab.uf_base)
        && normalize(p.destino_cidade) === normalize(ponto.cidade)
        && normalize(p.destino_uf) === normalize(ponto.uf))
      .sort((a, b) => String(b.data_cotacao || '').localeCompare(String(a.data_cotacao || '')))[0];
    if (match) return n(match.valor_estimado, 0);

    const d = distanciaKm(colab.latitude, colab.longitude, ponto.latitude, ponto.longitude);
    if (d == null) return 0;
    if (d <= 55) return 0;
    return Math.round((45 + d * 0.42) * 100) / 100;
  }

  function auditoriaResumo(colab) {
    const nomeChave = normalize(`${colab.nome_chave || colab.nome || ''}`);
    const items = state.auditorias.filter((a) => {
      const sameId = colab.colaborador_id && a.colaborador_id && String(a.colaborador_id) === String(colab.colaborador_id);
      const sameKey = a.nome_chave && nomeChave && normalize(a.nome_chave) === nomeChave;
      const sameName = normalize(a.nome_colaborador) === normalize(colab.nome);
      return sameId || sameKey || sameName;
    });
    const impacto = items.reduce((sum, a) => sum + n(a.score_impacto, 0), 0);
    const descontos = items.filter((a) => normalize(a.resultado || '').includes('DESCONTO') || n(a.desconto_kg, 0) > 0).length;
    const altas = items.filter((a) => normalize(a.severidade || '').includes('ALTA')).length;
    const ultima = items.slice().sort((a, b) => String(b.data_evento || '').localeCompare(String(a.data_evento || '')))[0] || null;
    const score = Math.max(0, Math.min(100, 100 - impacto));
    return {
      score,
      total: items.length,
      descontos,
      altas,
      ultima_data: ultima?.data_evento || null,
      ultima_resultado: ultima?.resultado || null,
      ultima_motivo: ultima?.motivo_recusa || null,
      impacto,
    };
  }

  function scoreClass(score) {
    if (score >= 80) return 'ok';
    if (score >= 62) return 'warn';
    return 'bad';
  }

  function calcRanking(container) {
    const form = getForm(container);
    state.selectedPontoId = form.pontoId;
    const ponto = selectedPonto();
    if (!ponto) {
      state.ranking = [];
      return [];
    }

    const hotel = hotelMaisProximo(ponto, form.qtd);
    const assignedElsewhere = getAssignedElsewhere(form.pontoId);

    const candidatos = state.colaboradores.filter((c) => {
      if (!c.nome) return false;
      if (assignedElsewhere.has(String(c.id))) return false;
      if (form.tipo !== 'todos' && normalize(c.tipo_mao_obra) !== normalize(form.tipo)) return false;
      if (form.busca) {
        const blob = normalize(`${c.nome} ${c.cidade_base} ${c.uf_base} ${c.supervisao} ${c.coordenacao}`);
        if (!blob.includes(form.busca)) return false;
      }
      return true;
    });

    const rows = candidatos.map((c) => {
      const distancia = distanciaKm(c.latitude, c.longitude, ponto.latitude, ponto.longitude);
      const semCoordenada = distancia == null;
      const passagem = passagemPara(c, ponto);
      const tipo = normalize(c.tipo_mao_obra).includes('DIAR') ? 'Diarista' : 'Efetivo';
      const alimentacao = n(c.valor_alimentacao, 30) * form.dias;
      const maoObra = tipo === 'Diarista' ? n(c.valor_diaria, 0) * form.dias : 0;
      const precisaHotel = distancia == null ? true : distancia > 80;
      const valorHotel = precisaHotel ? n(hotel?.diaria, 0) * form.dias : 0;
      const custoTotal = passagem + valorHotel + maoObra + alimentacao;
      const audit = auditoriaResumo(c);
      const auditoria = audit.score;
      const distanciaScore = distancia == null ? 35 : Math.max(0, 100 - (distancia / 8));
      const custoScore = Math.max(0, 100 - (custoTotal / 12));
      const volumePeso = form.volume >= 600 ? 0.32 : 0.24;
      const auditoriaPeso = form.volume >= 600 ? 0.36 : 0.28;
      const score = Math.round(
        (auditoria * auditoriaPeso)
        + (distanciaScore * 0.22)
        + (custoScore * 0.30)
        + ((tipo === 'Efetivo' ? 88 : 72) * volumePeso * 0.35)
      );
      const indicado = isIndicadoNoPonto(form.pontoId, c.id);
      return {
        ...c,
        tipo_calculado: tipo,
        ponto,
        distancia,
        semCoordenada,
        indicado,
        hotel_nome: hotel ? `${hotel.nome} · ${hotel.cidade}/${hotel.uf}` : 'Sem hotel cadastrado na cidade/UF',
        hotel_distancia: hotel?.distancia ?? null,
        hotel_fonte: hotel?.fonte || null,
        hotel_tipo_quarto: hotel?.tipo_quarto || null,
        hotel_quartos: hotel?.quartos || 0,
        valor_hotel: valorHotel,
        valor_passagem: passagem,
        valor_mao_obra: maoObra,
        valor_alimentacao: alimentacao,
        custo_total: custoTotal,
        score_auditoria: auditoria,
        auditoria_total: audit.total,
        auditoria_descontos: audit.descontos,
        auditoria_altas: audit.altas,
        auditoria_ultima_data: audit.ultima_data,
        auditoria_ultima_resultado: audit.ultima_resultado,
        auditoria_ultima_motivo: audit.ultima_motivo,
        score_final: Math.max(0, Math.min(100, score)),
        status: semCoordenada ? 'Falta coordenada' : (score >= 80 ? 'Recomendado' : score >= 62 ? 'Analisar' : 'Alto custo'),
      };
    }).sort((a, b) => b.score_final - a.score_final || a.custo_total - b.custo_total);

    state.ranking = rows;
    return rows;
  }

  function renderOptions() {
    return state.pontos.map((p) => `
      <option value="${safeText(p.id)}" ${String(p.id) === String(state.selectedPontoId) ? 'selected' : ''}>
        ${safeText(p.nome_local)} · ${safeText(p.cidade)}/${safeText(p.uf)}
      </option>
    `).join('');
  }

  function renderMetrics(rows) {
    const ponto = selectedPonto();
    const valid = rows.filter((r) => !r.semCoordenada);
    const best = rows[0];
    const avg = rows.length ? rows.reduce((s, r) => s + r.custo_total, 0) / rows.length : 0;
    const totalIndicados = Object.values(state.indicacoes).reduce((s, arr) => s + arr.length, 0);
    return `
      <section class="op-summary">
        <div class="op-metric"><span>Ponto selecionado</span><strong>${ponto ? safeText(ponto.cidade + '/' + ponto.uf) : '-'}</strong></div>
        <div class="op-metric"><span>Colaboradores avaliados</span><strong>${rows.length}</strong></div>
        <div class="op-metric"><span>Melhor indicação</span><strong>${best ? safeText(best.nome) : '-'}</strong></div>
        <div class="op-metric"><span>Direcionados (total)</span><strong>${totalIndicados}</strong></div>
      </section>
      ${rows.length && !valid.length ? '<div class="op-alert"><strong>Atenção:</strong> os colaboradores carregados não possuem latitude/longitude. Para ranking real por distância, alimente a tabela <code>operacional_colaborador_base</code> com coordenadas da base/residência.</div>' : ''}
    `;
  }

  function renderRanking(rows) {
    if (!rows.length) return '<div class="op-alert"><strong>Nenhum colaborador encontrado.</strong><br>Cadastre/importe a base operacional de colaboradores para gerar a relação de custo-benefício.</div>';
    const pontoId = state.selectedPontoId;
    return rows.slice(0, 10).map((row, index) => {
      const indicado = isIndicadoNoPonto(pontoId, row.id);
      return `
        <div class="op-rank${indicado ? ' indicado' : ''}">
          <div class="op-rank-pos">${index + 1}</div>
          <div>
            <strong>${safeText(row.nome)}</strong>
            <span>${safeText(row.tipo_calculado)} · ${row.distancia == null ? 'sem km' : `${row.distancia} km`} · ${money(row.custo_total)} · Aud: ${Math.round(row.score_auditoria)}%</span>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
            <div class="op-score">
              <strong>${row.score_final}</strong>
              <span>score</span>
            </div>
            <button
              class="op-btn${indicado ? '' : ' secondary'}"
              style="padding:5px 12px;min-height:unset;font-size:11px"
              data-toggle-indicacao="${safeText(row.id)}"
              data-indicado="${indicado}">
              ${indicado ? '✓ Indicado' : 'Indicar'}
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderPontosList() {
    const pontos = state.pontos.slice(0, 12);
    if (!pontos.length) return '<div class="op-alert"><strong>Nenhum ponto importado.</strong><br>Importe a planilha de pontos pelo menu Relatórios.</div>';
    return pontos.map((p) => {
      const qtdIndicados = (state.indicacoes[String(p.id)] || []).length;
      return `
        <div class="op-point ${String(p.id) === String(state.selectedPontoId) ? 'active' : ''}" data-ponto-id="${safeText(p.id)}">
          <strong>${safeText(p.nome_local)}${qtdIndicados ? ` <span class="op-pill ok" style="font-size:10px;padding:2px 7px">${qtdIndicados} dir.</span>` : ''}</strong>
          <span>${safeText(p.tipo_local || 'Ponto')} · ${safeText(p.cidade)}/${safeText(p.uf)} · ${safeText(p.supervisao || 'Sem supervisão')}</span>
        </div>
      `;
    }).join('');
  }

  function renderDirecionamentoPanel() {
    const entries = Object.entries(state.indicacoes)
      .map(([pId, colabIds]) => ({
        ponto: state.pontos.find(p => String(p.id) === String(pId)),
        colabIds,
      }))
      .filter(({ ponto, colabIds }) => ponto && colabIds.length);

    if (!entries.length) return '';

    const items = entries.map(({ ponto, colabIds }) => {
      const colabs = colabIds
        .map(cId => state.colaboradores.find(c => String(c.id) === String(cId)))
        .filter(Boolean);
      if (!colabs.length) return '';
      return `
        <div class="op-rank" style="flex-direction:column;gap:8px;cursor:default">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
            <div>
              <strong>${safeText(ponto.nome_local)}</strong>
              <span>${safeText(ponto.cidade)}/${safeText(ponto.uf)} · ${safeText(ponto.supervisao || '')}</span>
            </div>
            <span class="op-pill ok">${colabs.length} indicado${colabs.length > 1 ? 's' : ''}</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px">
            ${colabs.map(c => `
              <div class="op-direcionar-row">
                <span style="color:#f8fafc;font-size:13px">${safeText(c.nome)}</span>
                <button class="op-btn secondary" style="padding:3px 10px;min-height:unset;font-size:11px"
                        data-remover-indicacao="${safeText(ponto.id)}"
                        data-remover-colab="${safeText(c.id)}">
                  Remover
                </button>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }).filter(Boolean);

    if (!items.length) return '';

    return `
      <article class="op-card">
        <div class="op-card-head">
          <div>
            <h3>Mapa de direcionamento</h3>
            <p>Colaboradores indicados por ponto de embarque. Indicados em outro ponto são ocultados dos demais rankings.</p>
          </div>
          <button class="op-btn secondary" id="opLimparIndicacoes" type="button" style="white-space:nowrap;margin-top:4px;flex-shrink:0">
            Limpar tudo
          </button>
        </div>
        <div class="op-list" style="max-height:none">${items.join('')}</div>
      </article>
    `;
  }

  function renderOutOfBrazilWarning() {
    const { colaboradores: fC, pontos: fP } = state.foraDoMapa;
    const total = fC.length + fP.length;
    if (!total) return '';
    const partes = [
      fC.length ? `${fC.length} colaborador(es) (ex.: ${fC.slice(0, 2).map(c => safeText(c.nome)).join(', ')}${fC.length > 2 ? '...' : ''})` : '',
      fP.length ? `${fP.length} ponto(s) de embarque` : '',
    ].filter(Boolean).join(' e ');
    return `
      <div class="op-alert danger">
        <strong>Coordenadas fora do Brasil detectadas</strong> — ${partes}.<br>
        Esses registros foram desconsiderados no mapa e no ranking de distância.
        Corrija as coordenadas manualmente ou limpe-as pelo botão abaixo para ajuste posterior.<br>
        <button class="op-btn" id="opLimparCoords" type="button"
                style="margin-top:10px;font-size:12px;padding:8px 14px">
          Limpar coordenadas inválidas no banco
        </button>
      </div>
    `;
  }

  async function limparCoordenadasForaDoBrasil(container) {
    const { colaboradores: fC, pontos: fP } = state.foraDoMapa;
    if (!fC.length && !fP.length) return;
    const btn = container.querySelector('#opLimparCoords');
    if (btn) { btn.disabled = true; btn.textContent = 'Limpando...'; }
    try {
      const ops = [];
      if (fC.length) {
        ops.push(supabase.from('operacional_colaborador_base')
          .update({ latitude: null, longitude: null })
          .in('id', fC.map(c => c.id)));
      }
      if (fP.length) {
        ops.push(supabase.from('operacional_pontos_embarque')
          .update({ latitude: null, longitude: null })
          .in('id', fP.map(p => p.id)));
      }
      const results = await Promise.all(ops);
      const erros = results.filter(r => r.error);
      if (erros.length) throw erros[0].error;
      state.foraDoMapa = { colaboradores: [], pontos: [] };
      container.classList.add('op-loading');
      await loadData();
      container.classList.remove('op-loading');
      renderShell(container);
    } catch (err) {
      console.error('[Operacional] Erro ao limpar coordenadas:', err);
      if (btn) { btn.disabled = false; btn.textContent = 'Limpar coordenadas inválidas no banco'; }
    }
  }

  async function renderMap(container, rows) {
    const mapEl = container.querySelector('#opMap');
    if (!mapEl) return;
    const ponto = selectedPonto();
    if (!ponto) {
      mapEl.innerHTML = '<div class="op-map-empty"><div><strong>Sem pontos de embarque</strong><span>Importe a planilha pelo menu Relatórios.</span></div></div>';
      return;
    }

    const ok = await ensureLeaflet();
    if (!ok) {
      mapEl.innerHTML = '<div class="op-map-empty"><div><strong>Mapa indisponível</strong><span>Não foi possível carregar o mapa externo. Os dados continuam disponíveis no ranking e na tabela.</span></div></div>';
      return;
    }

    if (state.map) {
      state.map.remove();
      state.map = null;
    }
    mapEl.innerHTML = '';
    const center = [Number(ponto.latitude), Number(ponto.longitude)];
    const map = window.L.map(mapEl, { zoomControl: true, scrollWheelZoom: false }).setView(center, 9);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    const markers = [];
    const pontoMarker = window.L.circleMarker(center, {
      radius: 10, color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.88, weight: 2
    }).addTo(map).bindPopup(`<strong>${safeText(ponto.nome_local)}</strong><br>${safeText(ponto.cidade)}/${safeText(ponto.uf)}`);
    markers.push(pontoMarker);

    const form = getForm(container);
    const hotel = hotelMaisProximo(ponto, form.qtd);
    if (hotel && Number.isFinite(Number(hotel.latitude)) && Number.isFinite(Number(hotel.longitude))) {
      const hotelMarker = window.L.circleMarker([Number(hotel.latitude), Number(hotel.longitude)], {
        radius: 8, color: '#38bdf8', fillColor: '#38bdf8', fillOpacity: 0.86, weight: 2
      }).addTo(map).bindPopup(`<strong>Hotel sugerido</strong><br>${safeText(hotel.nome)}<br>${safeText(hotel.cidade)}/${safeText(hotel.uf)} · ${safeText(hotel.fonte || 'Hospedagem')}<br>${money(hotel.diaria || 0)}`);
      markers.push(hotelMarker);
      window.L.polyline([center, [Number(hotel.latitude), Number(hotel.longitude)]], { color: '#38bdf8', weight: 2, opacity: 0.65, dashArray: '6 6' }).addTo(map);
    }

    rows.slice(0, 8).forEach((row, index) => {
      if (!Number.isFinite(Number(row.latitude)) || !Number.isFinite(Number(row.longitude))) return;
      const latlng = [Number(row.latitude), Number(row.longitude)];
      const isIndicado = isIndicadoNoPonto(state.selectedPontoId, row.id);
      const color = isIndicado ? '#22c55e' : (index === 0 ? '#facc15' : '#f59e0b');
      const marker = window.L.circleMarker(latlng, {
        radius: isIndicado ? 10 : (index === 0 ? 9 : 7), color, fillColor: color, fillOpacity: 0.85, weight: isIndicado ? 3 : 2
      }).addTo(map).bindPopup(`<strong>${safeText(row.nome)}</strong>${isIndicado ? ' ✓ Indicado' : ''}<br>${safeText(row.tipo_calculado)} · ${row.distancia ?? '-'} km<br>Total: ${money(row.custo_total)}<br>Auditoria: ${Math.round(row.score_auditoria)}% (${row.auditoria_total || 0} aud.)<br>Score: ${row.score_final}`);
      markers.push(marker);
      window.L.polyline([latlng, center], { color: isIndicado ? '#22c55e' : (index === 0 ? '#22c55e' : '#64748b'), weight: isIndicado ? 3 : (index === 0 ? 3 : 1.5), opacity: isIndicado ? 0.9 : (index === 0 ? 0.82 : 0.35) }).addTo(map);
    });

    if (markers.length > 1) {
      const group = window.L.featureGroup(markers);
      map.fitBounds(group.getBounds().pad(0.18), { maxZoom: 10 });
    }
    state.map = map;
    setTimeout(() => map.invalidateSize(), 80);
  }

  function renderTable(rows) {
    if (!rows.length) return '';
    const pontoId = state.selectedPontoId;
    return `
      <article class="op-card">
        <div class="op-card-head">
          <div>
            <h3>Relação de custo-benefício por colaborador</h3>
            <p>Ranking gerado com base no ponto de embarque selecionado, custos, distância e histórico de auditoria.</p>
          </div>
        </div>
        <div class="op-table-wrap">
          <table class="op-table">
            <thead>
              <tr>
                <th>#</th><th>Colaborador</th><th>Tipo</th><th>Base</th><th>Distância</th><th>Hotel sugerido</th><th>Fonte hotel</th><th>Passagem</th><th>Hotel</th><th>Mão de obra</th><th>Alimentação</th><th>Total</th><th>Auditoria</th><th>Histórico</th><th>Score</th><th>Status</th><th>Direcionamento</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((row, index) => {
                const cls = row.semCoordenada ? 'muted' : scoreClass(row.score_final);
                const indicado = isIndicadoNoPonto(pontoId, row.id);
                return `<tr>
                  <td>${index + 1}</td>
                  <td>${safeText(row.nome)}</td>
                  <td>${safeText(row.tipo_calculado)}</td>
                  <td>${safeText(`${row.cidade_base || '-'}${row.uf_base ? '/' + row.uf_base : ''}`)}</td>
                  <td>${row.distancia == null ? '-' : row.distancia + ' km'}</td>
                  <td>${safeText(row.hotel_nome)}${row.hotel_tipo_quarto ? `<br><small>${safeText(row.hotel_tipo_quarto)}${row.hotel_quartos > 1 ? ` · ${row.hotel_quartos} quartos` : ``}</small>` : ``}</td>
                  <td>${row.hotel_fonte ? `<span class="op-pill ok">${safeText(row.hotel_fonte)}</span>` : `<span class="op-pill muted">Não localizado</span>`}</td>
                  <td>${money(row.valor_passagem)}</td>
                  <td>${money(row.valor_hotel)}</td>
                  <td>${money(row.valor_mao_obra)}</td>
                  <td>${money(row.valor_alimentacao)}</td>
                  <td>${money(row.custo_total)}</td>
                  <td>${Math.round(row.score_auditoria)}%</td>
                  <td>${row.auditoria_total ? `${row.auditoria_total} aud. · ${row.auditoria_descontos} desc.` : 'Sem histórico'}</td>
                  <td><span class="op-pill ${cls}">${row.score_final}</span></td>
                  <td><span class="op-pill ${cls}">${safeText(row.status)}</span></td>
                  <td>
                    <button class="op-btn${indicado ? '' : ' secondary'}"
                            style="padding:5px 12px;min-height:unset;font-size:11px"
                            data-toggle-indicacao="${safeText(row.id)}"
                            data-indicado="${indicado}">
                      ${indicado ? '✓ Indicado' : 'Indicar'}
                    </button>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </article>
    `;
  }

  function renderShell(container) {
    const rows = calcRanking(container);
    container.innerHTML = `
      <div class="op-shell">
        <section class="op-hero">
          <span class="op-kicker">Operacional · Direcionamento de embarque</span>
          <h2>Selecione o ponto de embarque e gere o custo-benefício da equipe</h2>
          <p>Escolha o local onde surgiu o embarque. O painel compara colaboradores por distância, passagem, hotel, tipo de mão de obra, alimentação e histórico de auditoria. Clique em <strong>Indicar</strong> para direcionar um colaborador ao ponto — ele deixa de aparecer nos demais rankings.</p>
          <div class="op-form">
            <div class="op-field">
              <label>Ponto de embarque</label>
              <select id="opPonto">${renderOptions()}</select>
            </div>
            <div class="op-field"><label>Volume</label><input id="opVolume" type="number" placeholder="Toneladas" value="${safeText(container.dataset.volume || '')}"></div>
            <div class="op-field"><label>Dias</label><input id="opDias" type="number" min="1" value="${safeText(container.dataset.dias || '1')}"></div>
            <div class="op-field"><label>Qtd equipe</label><input id="opQtd" type="number" min="1" value="${safeText(container.dataset.qtd || '1')}"></div>
            <div class="op-field"><label>Tipo</label><select id="opTipo"><option value="todos">Todos</option><option value="efetivo">Efetivo</option><option value="diarista">Diarista</option></select></div>
            <div class="op-actions"><button class="op-btn" id="opGerar" type="button">Gerar ranking</button><button class="op-btn secondary" id="opReload" type="button">Atualizar</button></div>
          </div>
          <div class="op-form" style="grid-template-columns:1fr; margin-top:12px">
            <div class="op-field"><label>Buscar colaborador, cidade ou supervisão</label><input id="opBusca" placeholder="Ex.: Carlos, Cascavel, Bahia..." /></div>
          </div>
        </section>
        <div id="opForaBrasilPlaceholder">${renderOutOfBrazilWarning()}</div>
        <div id="opMetrics">${renderMetrics(rows)}</div>
        <section class="op-layout">
          <article class="op-card">
            <div class="op-card-head"><div><h3>Mapa real do embarque</h3><p>Mostra ponto selecionado, hotel mais próximo e os melhores colaboradores. Indicados aparecem em verde.</p></div></div>
            <div class="op-map" id="opMap"><div class="op-map-empty"><div><strong>Carregando mapa...</strong><span>Aguarde alguns segundos.</span></div></div></div>
          </article>
          <article class="op-card">
            <div class="op-card-head"><div><h3>Pontos disponíveis</h3><p>Clique em um ponto ou selecione no filtro acima.</p></div></div>
            <div class="op-list" id="opPontosList">${renderPontosList()}</div>
          </article>
        </section>
        <section class="op-layout">
          <article class="op-card">
            <div class="op-card-head"><div><h3>Ranking recomendado</h3><p>Ordenado pelo score operacional. Colaboradores já direcionados a outro ponto não aparecem aqui.</p></div></div>
            <div class="op-list" id="opRanking">${renderRanking(rows)}</div>
          </article>
          <article class="op-card">
            <div class="op-card-head"><div><h3>Próxima etapa</h3><p>Para o ranking ficar 100% real, a base dos colaboradores precisa ter latitude/longitude e o módulo Hospedagem precisa manter hotéis com cidade/UF e diárias por tipo de quarto.</p></div></div>
            <div class="op-list">
              <div class="op-alert"><strong>Fluxo correto:</strong><br>1. Importar pontos pelo menu Relatórios.<br>2. Selecionar o ponto aqui no Operacional.<br>3. Informar volume/dias.<br>4. Gerar ranking, clicar em <strong>Indicar</strong> para direcionar a equipe.<br>5. Repetir para cada ponto — o painel distribui automaticamente.</div>
            </div>
          </article>
        </section>
        <div id="opDirecionamentoPlaceholder">${renderDirecionamentoPanel()}</div>
        <div id="opTable">${renderTable(rows)}</div>
      </div>
    `;
    bindEvents(container);
    renderMap(container, rows);
  }

  function refreshComputed(container) {
    container.dataset.volume = container.querySelector('#opVolume')?.value || '';
    container.dataset.dias = container.querySelector('#opDias')?.value || '1';
    container.dataset.qtd = container.querySelector('#opQtd')?.value || '1';
    const rows = calcRanking(container);
    container.querySelector('#opMetrics').innerHTML = renderMetrics(rows);
    container.querySelector('#opRanking').innerHTML = renderRanking(rows);
    container.querySelector('#opTable').innerHTML = renderTable(rows);
    const dirPanel = container.querySelector('#opDirecionamentoPlaceholder');
    if (dirPanel) dirPanel.innerHTML = renderDirecionamentoPanel();
    const pontosListEl = container.querySelector('#opPontosList');
    if (pontosListEl) {
      pontosListEl.innerHTML = renderPontosList();
      bindPointClicks(container);
    }
    bindIndicacaoClicks(container);
    renderMap(container, rows);
  }

  function bindIndicacaoClicks(container) {
    container.querySelectorAll('[data-toggle-indicacao]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const colabId = btn.dataset.toggleIndicacao;
        const pontoId = state.selectedPontoId;
        if (btn.dataset.indicado === 'true') {
          removerIndicacao(pontoId, colabId);
        } else {
          indicarColab(pontoId, colabId);
        }
        refreshComputed(container);
      });
    });

    container.querySelectorAll('[data-remover-indicacao]').forEach((btn) => {
      btn.addEventListener('click', () => {
        removerIndicacao(btn.dataset.removerIndicacao, btn.dataset.removerColab);
        refreshComputed(container);
      });
    });

    container.querySelector('#opLimparIndicacoes')?.addEventListener('click', () => {
      state.indicacoes = {};
      saveIndicacoes();
      refreshComputed(container);
    });

    container.querySelector('#opLimparCoords')?.addEventListener('click', () => {
      limparCoordenadasForaDoBrasil(container);
    });
  }

  function bindEvents(container) {
    container.querySelector('#opPonto')?.addEventListener('change', (ev) => {
      state.selectedPontoId = ev.target.value;
      refreshComputed(container);
    });
    container.querySelector('#opGerar')?.addEventListener('click', () => refreshComputed(container));
    container.querySelector('#opBusca')?.addEventListener('input', () => refreshComputed(container));
    container.querySelector('#opTipo')?.addEventListener('change', () => refreshComputed(container));
    container.querySelector('#opReload')?.addEventListener('click', async () => {
      container.classList.add('op-loading');
      await loadData();
      container.classList.remove('op-loading');
      renderShell(container);
    });
    bindPointClicks(container);
    bindIndicacaoClicks(container);
  }

  function bindPointClicks(container) {
    container.querySelectorAll('[data-ponto-id]').forEach((el) => {
      el.addEventListener('click', () => {
        state.selectedPontoId = el.getAttribute('data-ponto-id');
        const select = container.querySelector('#opPonto');
        if (select) select.value = state.selectedPontoId;
        refreshComputed(container);
      });
    });
  }

  async function openHome(container) {
    ensureStyles();
    state.indicacoes = loadIndicacoesFromStorage();
    container.innerHTML = `
      <div class="op-shell">
        <section class="op-hero"><span class="op-kicker">Operacional</span><h2>Carregando mapa de direcionamento...</h2><p>Buscando pontos de embarque, colaboradores, hotéis do módulo Hospedagem, passagens e auditoria no Supabase.</p></section>
      </div>
    `;
    await loadData();
    renderShell(container);
  }

  window.OPERACIONAL = { openHome };
})();
