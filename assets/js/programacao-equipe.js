// Etapa B da Programação: "quem vai atender as OS disponíveis".
// Lista compacta de OS em ATENDER, cada uma com um dropdown de candidatos
// ranqueados (Contrato 50% / Distância 30% / Auditoria 20%, calculado no
// banco pela RPC programacao_etapa_b_candidatos) e um mapa à direita
// mostrando a rota do colaborador focado até o ponto de embarque — reta por
// padrão, ou a rota real (OSRM, agrupando até 4 colaboradores por veículo)
// quando o gestor pedir "Ver rotas no mapa" (reaproveita a Edge Function já
// usada em Frotas Roteirização, ver supabase/functions/frotas-roteirizar).
import { supabase } from './supabaseClient.js';

const LEAFLET_CSS_ID = 'leaflet-css-prog-equipe';
const LEAFLET_JS_ID = 'leaflet-js-prog-equipe';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function hasGeo(lat, lng) {
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
}

function round1(n) { return Math.round(n * 10) / 10; }

// Distância acima da qual sugerimos hotel. R$7/L, 10km/L → 150km ida =
// R$210 combustível R/T, mais econômico do que ida+volta no dia seguinte.
const HOTEL_KM_THRESHOLD = 150;
const HOTEL_DIARIA_EST = 120; // R$ estimado por diária (referência básica)

function precisaHotel(km) { return km != null && km >= HOTEL_KM_THRESHOLD; }
function estimarCustoKm(km) {
  if (km == null) return null;
  return Math.round((km * 2 / 10) * 7 * 100) / 100;
}
function parseEmbarqueUfCidade(embarque) {
  const m = /^([A-Z]{2})\s*-\s*([^(]+)/.exec(embarque || '');
  if (!m) return { uf: '', cidade: '' };
  return { uf: m[1].trim(), cidade: m[2].trim() };
}

// Rastreia OS que já tiveram hotel solicitado nesta sessão para atualizar o botão
const hotelSolicitadoIds = new Set();

function contratoLabel(tipo) {
  const norm = normalizeText(tipo);
  if (norm.includes('EFETIVO')) return 'Efetivo';
  if (norm.includes('INTERMITENTE')) return 'Intermitente';
  if (norm.includes('DIARISTA')) return 'Diarista';
  return 'Não informado';
}

function loadCss(href, id) {
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

function loadScript(src, id) {
  if (document.getElementById(id)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function ensureLeaflet() {
  if (window.L) return true;
  try {
    loadCss('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', LEAFLET_CSS_ID);
    await loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', LEAFLET_JS_ID);
    return !!window.L;
  } catch {
    return false;
  }
}

function injectStyles() {
  if (document.getElementById('progEquipeStyles')) return;
  const style = document.createElement('style');
  style.id = 'progEquipeStyles';
  style.textContent = `
    .peqb-kpis{display:grid;grid-template-columns:repeat(2,minmax(140px,1fr));gap:10px;margin-bottom:12px}
    .peqb-kpi{border:1px solid rgba(34,197,94,.18);background:rgba(2,6,23,.32);border-radius:12px;padding:10px}
    .peqb-kpi span{display:block;color:#93c5fd;font-size:9.5px;font-weight:950;letter-spacing:.08em;text-transform:uppercase}
    .peqb-kpi strong{display:block;margin-top:4px;color:#fff;font-size:18px}
    .peqb-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:flex-end;margin-bottom:12px}
    .peqb-btn{border:1px solid rgba(134,239,172,.35);background:rgba(22,163,74,.16);color:#dcfce7;border-radius:999px;padding:8px 14px;font-size:12px;font-weight:950;cursor:pointer;white-space:nowrap}
    .peqb-btn:hover{background:rgba(22,163,74,.3)}
    .peqb-btn:disabled{opacity:.55;cursor:not-allowed}
    .peqb-grid{display:grid;grid-template-columns:minmax(360px,1fr) minmax(320px,.85fr);gap:14px;align-items:start}
    @media(max-width:1080px){.peqb-grid{grid-template-columns:1fr}}
    .peqb-os-list{display:flex;flex-direction:column;gap:8px;max-height:calc(100vh - 320px);min-height:300px;overflow:auto;padding-right:2px}
    .peqb-row{border:1px solid rgba(52,211,153,.18);border-radius:14px;background:rgba(2,6,23,.32);padding:10px 12px;cursor:pointer}
    .peqb-row:hover,.peqb-row.focus{border-color:rgba(52,211,153,.45);background:rgba(34,197,94,.08)}
    .peqb-row-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;color:#f8fafc;font-weight:950;font-size:12.5px}
    .peqb-row-head small{color:#bbf7d0;font-size:10.5px;white-space:nowrap}
    .peqb-row-meta{color:#94a3b8;font-size:10.5px;margin-top:2px;line-height:1.3}
    .peqb-chip{display:inline-flex;align-items:center;border-radius:999px;padding:2px 8px;font-size:9.5px;font-weight:850;border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.6);color:#cbd5e1;white-space:nowrap;margin-top:4px}
    .peqb-chip.ok{border-color:rgba(34,197,94,.35);background:rgba(22,101,52,.22);color:#bbf7d0}
    .peqb-chip.warn{border-color:rgba(245,158,11,.32);background:rgba(245,158,11,.12);color:#fde68a}
    .peqb-row-actions{display:flex;gap:6px;margin-top:7px;align-items:center}
    .peqb-select{flex:1;min-width:0;height:32px;border:1px solid rgba(148,163,184,.22);border-radius:8px;background:#0d0d18;color:#e2e2f0;padding:0 8px;font-size:11.5px;outline:none;color-scheme:dark}
    .peqb-row-btn{border:1px solid rgba(134,239,172,.35);background:rgba(22,163,74,.16);color:#dcfce7;border-radius:8px;padding:0 10px;height:32px;font-size:11px;font-weight:900;cursor:pointer;white-space:nowrap}
    .peqb-row-btn.danger{border-color:rgba(239,68,68,.35);background:rgba(239,68,68,.14);color:#fecaca}
    .peqb-row-btn:disabled{opacity:.6;cursor:not-allowed}
    .peqb-map-wrap{border:1px solid rgba(148,163,184,.14);border-radius:18px;background:rgba(2,6,23,.36);overflow:hidden;position:sticky;top:8px}
    .peqb-map{height:min(560px,calc(100vh - 280px));min-height:340px;position:relative}
    #peqbMapEl{position:absolute;inset:0}
    .peqb-map-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#94a3b8;text-align:center;padding:20px;font-size:12.5px}
    .leaflet-tooltip.peqb-tt{background:rgba(2,6,23,.92)!important;border:1px solid rgba(34,197,94,.35)!important;color:#f8fafc!important;border-radius:8px!important;font-size:11px!important;padding:4px 8px!important;font-weight:700!important;box-shadow:none!important}
    .leaflet-control-attribution{background:rgba(2,6,23,.65)!important;color:#6b7280!important;font-size:10px!important}
    .peqb-empty{border:1px dashed rgba(148,163,184,.22);border-radius:14px;padding:22px;text-align:center;color:#94a3b8;line-height:1.4}
    .peqb-chip-hotel{border-color:rgba(251,191,36,.4)!important;background:rgba(251,191,36,.1)!important;color:#fbbf24!important;font-weight:950!important}
    .peqb-row-btn.hotel{border-color:rgba(251,191,36,.45);background:rgba(251,191,36,.12);color:#fbbf24}
    .peqb-row-btn.hotel:hover{background:rgba(251,191,36,.22)}
    .peqb-row-btn.hotel.done{border-color:rgba(34,197,94,.4);background:rgba(22,163,74,.15);color:#86efac;cursor:default}
  `;
  document.head.appendChild(style);
}

async function loadOsAtender(supervisao) {
  const { data, error } = await supabase
    .from('operacional_os')
    .select('id,numero_os,cliente,embarque,ponto_embarque_id,ponto1_latitude,ponto1_longitude,supervisao')
    .eq('supervisao', supervisao)
    .eq('status_gestor', 'ATENDER')
    .order('numero_os', { ascending: false })
    .limit(300);
  if (error) throw error;
  return data || [];
}

async function loadPontos(ids) {
  if (!ids.length) return new Map();
  const { data, error } = await supabase
    .from('operacional_pontos_embarque')
    .select('id,nome_local,latitude,longitude')
    .in('id', ids);
  if (error) throw error;
  return new Map((data || []).map((p) => [p.id, p]));
}

async function loadEquipeExistente(programacaoId) {
  const { data, error } = await supabase.from('programacao_equipe').select('*').eq('programacao_id', programacaoId);
  if (error) throw error;
  return data || [];
}

function pontoDaOs(os, pontosPorId) {
  if (hasGeo(os.ponto1_latitude, os.ponto1_longitude)) {
    return { lat: Number(os.ponto1_latitude), lng: Number(os.ponto1_longitude), nome: os.embarque };
  }
  const ponto = os.ponto_embarque_id ? pontosPorId.get(os.ponto_embarque_id) : null;
  if (ponto && hasGeo(ponto.latitude, ponto.longitude)) {
    return { lat: Number(ponto.latitude), lng: Number(ponto.longitude), nome: ponto.nome_local || os.embarque };
  }
  return null;
}

// O ranking de candidatos (Contrato/Distância/Auditoria) é calculado no banco
// pela RPC programacao_etapa_b_candidatos (ver migração
// 20260625130000_programacao_etapa_b_candidatos_rpc.sql e seguintes), que já
// filtra pelos top 8 por OS usando colaborador_cruzamento pré-computado.
async function loadCandidatosPorOs(supervisao, osComPonto, excluirIds) {
  const osPayload = osComPonto
    .filter(({ candidatosNecessarios }) => candidatosNecessarios)
    .map(({ os, ponto }) => ({ os_id: os.id, lat: ponto?.lat ?? null, lng: ponto?.lng ?? null }));
  if (!osPayload.length) return new Map();

  const { data, error } = await supabase.rpc('programacao_etapa_b_candidatos', {
    p_supervisao: supervisao,
    p_excluir_colaborador_ids: [...excluirIds],
    p_os: osPayload,
  });
  if (error) throw error;

  const porOs = new Map();
  (data || []).forEach((row) => {
    const lista = porOs.get(row.os_id) || [];
    lista.push({
      nome: row.nome,
      cargo: row.cargo,
      coordenacao: row.coordenacao,
      supervisao: row.supervisao,
      colaboradorId: row.colaborador_id,
      tipoLabel: contratoLabel(row.tipo_contrato),
      km: row.km != null ? Number(row.km) : null,
      auditPeso: row.auditorias_peso != null ? Number(row.auditorias_peso) : null,
      veiculoId: row.veiculo_id || null,
      veiculoPlaca: row.veiculo_placa || null,
      lat: row.colab_lat != null ? Number(row.colab_lat) : null,
      lng: row.colab_lng != null ? Number(row.colab_lng) : null,
      custoTotal: row.custo_total != null ? Number(row.custo_total) : null,
      score: Number(row.score),
      scoreContrato: Number(row.score_contrato),
      scoreDistancia: Number(row.score_distancia),
      scoreAuditoria: Number(row.score_auditoria),
    });
    porOs.set(row.os_id, lista);
  });
  return porOs;
}

function brl(value) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function candidatoOptionLabel(cand) {
  const km = cand.km != null ? `${cand.km}km` : 'sem coord.';
  const custo = cand.custoTotal != null ? `R$${brl(cand.custoTotal)}` : 'sem custo';
  const logistica = cand.veiculoId ? ' 🚐' : '';
  const hotel = precisaHotel(cand.km) ? ' 🏨' : '';
  return `${cand.nome} — ${km} — ${custo} — score ${(cand.score * 100).toFixed(0)}${logistica}${hotel}`;
}

function osRowHtml(item) {
  const { os, confirmadoRow, candidatos } = item;
  const confirmado = !!confirmadoRow;
  const selecionadoId = confirmadoRow?.colaborador_id || candidatos[0]?.colaboradorId || '';
  const optionsHtml = candidatos.length
    ? candidatos.map((c) => `<option value="${esc(c.colaboradorId)}" ${c.colaboradorId === selecionadoId ? 'selected' : ''}>${esc(candidatoOptionLabel(c))}</option>`).join('')
    : '<option value="">Nenhum candidato disponível</option>';

  // Botão de hotel: só aparece quando confirmado e colaborador está longe
  const kmConfirmado = confirmadoRow?.km_estimado != null ? Number(confirmadoRow.km_estimado) : null;
  const custoKmConfirmado = estimarCustoKm(kmConfirmado);
  const hotelJaPedido = hotelSolicitadoIds.has(os.id);
  const hotelBtn = confirmado && precisaHotel(kmConfirmado)
    ? hotelJaPedido
      ? `<button type="button" class="peqb-row-btn hotel done" disabled>✓ Hotel solicitado</button>`
      : `<button type="button" class="peqb-row-btn hotel" data-pedir-hotel title="Combustível ida+volta estimado: R$${custoKmConfirmado != null ? brl(custoKmConfirmado) : '?'} — hotel pode ser mais econômico">🏨 Pedir hotel</button>`
    : '';

  // Badge informativo para OS ainda não confirmadas com candidato distante
  const kmMelhor = candidatos[0]?.km ?? null;
  const infoBadge = !confirmado && precisaHotel(kmMelhor)
    ? `<span class="peqb-chip peqb-chip-hotel">🏨 Melhor candidato a ${kmMelhor}km</span>`
    : '';

  return `
    <article class="peqb-row" data-os-id="${esc(os.id)}">
      <div class="peqb-row-head"><span>${esc(os.cliente || '-')}</span><small>OS ${esc(os.numero_os || '-')}</small></div>
      <div class="peqb-row-meta">Embarque: ${esc(os.embarque || '-')}</div>
      <span class="peqb-chip ${confirmado ? 'ok' : 'warn'}">${confirmado ? `Confirmado · ${esc(confirmadoRow.nome_colaborador)}${kmConfirmado != null ? ` · ${kmConfirmado}km` : ''}` : 'Pendente'}</span>
      ${infoBadge}
      <div class="peqb-row-actions">
        <select class="peqb-select" data-select-colaborador ${candidatos.length ? '' : 'disabled'}>${optionsHtml}</select>
        <button type="button" class="peqb-row-btn" data-confirmar ${candidatos.length ? '' : 'disabled'}>${confirmado ? 'Atualizar' : 'Confirmar'}</button>
        ${hotelBtn}
        ${confirmado ? `<button type="button" class="peqb-row-btn danger" data-remover="${esc(confirmadoRow.id)}">Remover</button>` : ''}
      </div>
    </article>
  `;
}

function atualizarKpis(root, osComCandidatos, confirmadosPorOs) {
  const kpiKmEl = root.querySelector('#peqbKpiKm');
  const kpiOsEl = root.querySelector('#peqbKpiOs');
  const kmTotal = osComCandidatos.reduce((soma, { os }) => {
    const km = confirmadosPorOs.get(os.id)?.km_estimado;
    return soma + (Number.isFinite(km) ? km : 0);
  }, 0);
  if (kpiKmEl) kpiKmEl.textContent = `${round1(kmTotal)} km`;
  if (kpiOsEl) kpiOsEl.textContent = String(confirmadosPorOs.size);
}

// --- Mapa: desenho de preview (reta) e de rota real (frotas-roteirizar) ---
// Reaproveita o padrão visual/técnico de assets/js/modules/frotas-roteirizacao.js
// (tiles CartoDB dark, layer groups, polyline verde, marcadores circulares).

// Ícone de volante (motorista/logística — quem está com a leitura do veículo
// no patrimônio) e ícone de pin vermelho de check-in (ponto de embarque),
// no mesmo estilo visual do resto do painel.
const ICON_WHEEL_SVG = `
  <svg width="26" height="26" viewBox="0 0 26 26" xmlns="http://www.w3.org/2000/svg">
    <circle cx="13" cy="13" r="11.5" fill="#16a34a" stroke="#dcfce7" stroke-width="2"/>
    <circle cx="13" cy="13" r="7" fill="none" stroke="#052e16" stroke-width="2"/>
    <circle cx="13" cy="13" r="2" fill="#052e16"/>
    <line x1="13" y1="6.5" x2="13" y2="9.7" stroke="#052e16" stroke-width="2"/>
    <line x1="8.2" y1="16.2" x2="11.1" y2="14.4" stroke="#052e16" stroke-width="2"/>
    <line x1="17.8" y1="16.2" x2="14.9" y2="14.4" stroke="#052e16" stroke-width="2"/>
  </svg>`;
const ICON_PIN_SVG = `
  <svg width="26" height="34" viewBox="0 0 26 34" xmlns="http://www.w3.org/2000/svg">
    <path d="M13 33C13 33 24 20.5 24 12.5C24 6.15 18.85 1 12.5 1S1 6.15 1 12.5C1 20.5 13 33 13 33Z" fill="#ef4444" stroke="#fecaca" stroke-width="1.5"/>
    <circle cx="12.5" cy="12.5" r="5.2" fill="#fff"/>
  </svg>`;

function iconWheel() {
  return window.L.divIcon({ className: '', html: ICON_WHEEL_SVG, iconSize: [26, 26], iconAnchor: [13, 13] });
}
function iconPin() {
  return window.L.divIcon({ className: '', html: ICON_PIN_SVG, iconSize: [26, 34], iconAnchor: [13, 33] });
}

function criarMapState() {
  return { map: null, layerRota: null, layerPontos: null, ready: false };
}

async function garantirMapa(mapState, mountEl) {
  if (mapState.ready) return mapState.map;
  const ok = await ensureLeaflet();
  if (!ok || !window.L) return null;
  const L = window.L;
  mapState.map = L.map(mountEl, { zoomControl: true, scrollWheelZoom: true, center: [-14.235, -51.925], zoom: 4 });
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution: '&copy; OSM &copy; CARTO',
    subdomains: 'abcd',
  }).addTo(mapState.map);
  mapState.layerRota = L.layerGroup().addTo(mapState.map);
  mapState.layerPontos = L.layerGroup().addTo(mapState.map);
  mapState.ready = true;
  return mapState.map;
}

function desenharPolyline(mapState, bounds, { coords, geometria, dashed }) {
  const L = window.L;
  if (geometria?.type === 'LineString' && Array.isArray(geometria.coordinates)) {
    const latlngs = geometria.coordinates.map(([lng, lat]) => [lat, lng]);
    L.polyline(latlngs, { color: '#22c55e', weight: 4, opacity: 0.85 }).addTo(mapState.layerRota);
    latlngs.forEach((p) => bounds.push(p));
  } else if (Array.isArray(coords) && coords.length >= 2) {
    L.polyline(coords, { color: '#22c55e', weight: 4, opacity: 0.85, dashArray: dashed ? '6 6' : null }).addTo(mapState.layerRota);
    coords.forEach((p) => bounds.push(p));
  }
}

// Preview simples: 1 colaborador -> 1 embarque (reta), usado antes de calcular
// rotas reais ou quando a OS focada não está em nenhuma rota calculada.
function desenharNoMapa(mapState, { pontoEmbarque, colaborador, linha }) {
  const L = window.L;
  if (!L || !mapState.map) return;
  mapState.layerRota.clearLayers();
  mapState.layerPontos.clearLayers();

  const bounds = [];
  if (pontoEmbarque && hasGeo(pontoEmbarque.lat, pontoEmbarque.lng)) {
    const marker = L.marker([pontoEmbarque.lat, pontoEmbarque.lng], { icon: iconPin() });
    marker.bindTooltip(esc(pontoEmbarque.titulo || 'Embarque'), { className: 'peqb-tt' });
    mapState.layerPontos.addLayer(marker);
    bounds.push([pontoEmbarque.lat, pontoEmbarque.lng]);
  }
  if (colaborador && hasGeo(colaborador.lat, colaborador.lng)) {
    const marker = colaborador.logistica
      ? L.marker([colaborador.lat, colaborador.lng], { icon: iconWheel() })
      : L.circleMarker([colaborador.lat, colaborador.lng], { radius: 7, color: '#fff', weight: 2, fillColor: '#60a5fa', fillOpacity: 0.95 });
    marker.bindTooltip(esc(colaborador.titulo), { className: 'peqb-tt' });
    mapState.layerPontos.addLayer(marker);
    bounds.push([colaborador.lat, colaborador.lng]);
  }
  if (linha) desenharPolyline(mapState, bounds, linha);

  if (bounds.length) mapState.map.fitBounds(bounds, { padding: [28, 28], maxZoom: 13 });
}

// Desenha todas as rotas calculadas de uma vez (chamado por "Ver rotas no
// mapa"): origem do veículo com ícone de volante (é onde o motorista/
// logística está agora), paradas de coleta em azul, embarque com pin
// vermelho de check-in.
function desenharTodasRotas(mapState, rotas) {
  const L = window.L;
  if (!L || !mapState.map) return;
  mapState.layerRota.clearLayers();
  mapState.layerPontos.clearLayers();

  const bounds = [];
  rotas.forEach((rota) => {
    if (!rota.paradas.length) return;
    const coords = [rota.origem, ...rota.paradas].map((p) => [p.lat, p.lng]);
    desenharPolyline(mapState, bounds, { coords, geometria: rota.geometria });

    if (hasGeo(rota.origem?.lat, rota.origem?.lng)) {
      const marker = L.marker([rota.origem.lat, rota.origem.lng], { icon: iconWheel() });
      marker.bindTooltip(esc(`Motorista: ${rota.motorista || 'Não identificado'} · ${rota.placa}`), { className: 'peqb-tt' });
      mapState.layerPontos.addLayer(marker);
    }
    rota.paradas.forEach((p) => {
      if (!hasGeo(p.lat, p.lng)) return;
      const marker = p.tipo === 'embarque'
        ? L.marker([p.lat, p.lng], { icon: iconPin() })
        : L.circleMarker([p.lat, p.lng], { radius: 7, color: '#fff', weight: 2, fillColor: '#60a5fa', fillOpacity: 0.95 });
      const titulo = p.tipo === 'embarque' ? (p.ponto_nome || 'Embarque') : `Coleta: ${p.colaborador_nome}`;
      marker.bindTooltip(esc(titulo), { className: 'peqb-tt' });
      mapState.layerPontos.addLayer(marker);
    });
  });

  if (bounds.length) mapState.map.fitBounds(bounds, { padding: [28, 28], maxZoom: 12 });
}

export async function renderProgramacaoEquipe(content, options = {}) {
  injectStyles();
  const supervisao = String(options.supervisao || '').trim();
  const programacaoId = options.programacaoId || null;

  content.innerHTML = `
    <div class="prog-section-title">
      <h4>Organizar Equipe</h4>
      <span class="badge">Etapa B</span>
    </div>
    <div class="peqb-kpis">
      <div class="peqb-kpi"><span>Km total estimado</span><strong id="peqbKpiKm">0 km</strong></div>
      <div class="peqb-kpi"><span>OS com equipe</span><strong id="peqbKpiOs">0</strong></div>
    </div>
    <div class="peqb-toolbar">
      <button type="button" class="peqb-btn" id="peqbAutoPreencher">Auto-preencher</button>
      <button type="button" class="peqb-btn" id="peqbVerRotas">Ver rotas no mapa</button>
    </div>
    <div class="peqb-grid">
      <div class="peqb-os-list" id="peqbOsList"><div class="peqb-empty">Carregando OS em ATENDER...</div></div>
      <div class="peqb-map-wrap">
        <div class="peqb-map"><div id="peqbMapEl"></div><div class="peqb-map-empty" id="peqbMapEmpty">Selecione uma OS para ver a rota.</div></div>
      </div>
    </div>
  `;

  const listEl = content.querySelector('#peqbOsList');
  const mapMount = content.querySelector('#peqbMapEl');
  const mapEmptyEl = content.querySelector('#peqbMapEmpty');
  const mapState = criarMapState();

  if (!supervisao || !programacaoId) {
    listEl.innerHTML = '<div class="peqb-empty">Carregue o contexto (supervisão e data) para organizar a equipe.</div>';
    return;
  }

  let carregando = false;
  let osComCandidatosAtual = [];
  let rotasPorOsId = new Map(); // os_id -> rota completa (frotas-roteirizar), só após "Ver rotas no mapa"
  let rotasCompletas = []; // todas as rotas relevantes (sem duplicar veículo), desenhadas juntas no mapa
  let focoOsId = null;

  function candidatoSelecionado(item) {
    const select = listEl.querySelector(`[data-os-id="${item.os.id}"] [data-select-colaborador]`);
    const id = select?.value || item.confirmadoRow?.colaborador_id || item.candidatos[0]?.colaboradorId;
    return item.candidatos.find((c) => c.colaboradorId === id) || null;
  }

  async function atualizarMapaParaOs(osId) {
    focoOsId = osId;
    listEl.querySelectorAll('.peqb-row').forEach((row) => row.classList.toggle('focus', row.dataset.osId === osId));

    const item = osComCandidatosAtual.find((it) => String(it.os.id) === osId);
    if (!item || !item.ponto) {
      mapEmptyEl.style.display = 'flex';
      mapEmptyEl.textContent = 'Sem coordenadas de embarque para esta OS.';
      return;
    }

    const map = await garantirMapa(mapState, mapMount);
    if (!map) {
      mapEmptyEl.style.display = 'flex';
      mapEmptyEl.textContent = 'Não foi possível carregar o mapa (sem conexão com o Leaflet).';
      return;
    }
    mapEmptyEl.style.display = 'none';

    // Com "Ver rotas no mapa" já calculado, todas as rotas ficam visíveis ao
    // mesmo tempo — clicar numa OS só dá zoom/foco na rota dela específica.
    if (rotasCompletas.length) {
      desenharTodasRotas(mapState, rotasCompletas);
      const rotaDaOs = rotasPorOsId.get(osId);
      if (rotaDaOs) {
        const bounds = [rotaDaOs.origem, ...rotaDaOs.paradas].map((p) => [p.lat, p.lng]);
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
      }
      return;
    }

    const cand = candidatoSelecionado(item);
    desenharNoMapa(mapState, {
      pontoEmbarque: { lat: item.ponto.lat, lng: item.ponto.lng, titulo: item.ponto.nome || 'Embarque' },
      colaborador: cand && hasGeo(cand.lat, cand.lng) ? { lat: cand.lat, lng: cand.lng, titulo: cand.nome, logistica: !!cand.veiculoId } : null,
      linha: cand && hasGeo(cand.lat, cand.lng) ? { coords: [[cand.lat, cand.lng], [item.ponto.lat, item.ponto.lng]], dashed: true } : null,
    });
    if (!cand || !hasGeo(cand?.lat, cand?.lng)) {
      mapEmptyEl.style.display = 'flex';
      mapEmptyEl.textContent = 'Colaborador sem coordenadas — mostrando só o ponto de embarque.';
    }
  }

  async function carregarERenderizar() {
    if (carregando) return;
    carregando = true;
    listEl.innerHTML = '<div class="peqb-empty">Carregando OS em ATENDER...</div>';
    try {
      const [osRows, equipeRows] = await Promise.all([loadOsAtender(supervisao), loadEquipeExistente(programacaoId)]);
      if (!osRows.length) {
        listEl.innerHTML = '<div class="peqb-empty">Nenhuma OS marcada como ATENDER para esta supervisão. Confirme as OS na etapa A.</div>';
        return;
      }

      const pontosPorId = await loadPontos([...new Set(osRows.map((os) => os.ponto_embarque_id).filter(Boolean))]);

      const confirmadosPorOs = new Map();
      equipeRows.filter((r) => r.confirmado).forEach((r) => confirmadosPorOs.set(r.os_id, r));
      const colaboradoresConfirmadosEmOutraOs = new Set(equipeRows.filter((r) => r.confirmado).map((r) => r.colaborador_id));

      const osComPonto = osRows.map((os) => {
        const confirmadoRow = confirmadosPorOs.get(os.id) || null;
        return { os, ponto: pontoDaOs(os, pontosPorId), confirmadoRow, candidatosNecessarios: !confirmadoRow };
      });
      const candidatosPorOs = await loadCandidatosPorOs(supervisao, osComPonto, colaboradoresConfirmadosEmOutraOs);

      osComCandidatosAtual = osComPonto.map(({ os, ponto, confirmadoRow }) => ({
        os,
        ponto,
        confirmadoRow,
        candidatos: confirmadoRow ? [] : (candidatosPorOs.get(os.id) || []),
      }));
      listEl.innerHTML = osComCandidatosAtual.map(osRowHtml).join('');

      atualizarKpis(content, osComCandidatosAtual, confirmadosPorOs);

      const manterFoco = focoOsId && osComCandidatosAtual.some((it) => String(it.os.id) === focoOsId);
      await atualizarMapaParaOs(manterFoco ? focoOsId : String(osComCandidatosAtual[0].os.id));
    } catch (error) {
      console.error('[programacao-equipe] render:', error);
      listEl.innerHTML = `<div class="peqb-empty">${esc(error.message || 'Erro ao montar a equipe.')}</div>`;
    } finally {
      carregando = false;
    }
  }

  listEl.addEventListener('click', async (event) => {
    const btnConfirmar = event.target.closest('[data-confirmar]');
    const btnRemover = event.target.closest('[data-remover]');
    const btnHotelEl = event.target.closest('[data-pedir-hotel]');
    const row = event.target.closest('.peqb-row');
    if (!btnConfirmar && !btnRemover && !btnHotelEl && row && !event.target.closest('select')) {
      await atualizarMapaParaOs(row.dataset.osId);
      return;
    }
    if (!btnConfirmar && !btnRemover && !btnHotelEl) return;

    const btn = btnConfirmar || btnRemover || btnHotelEl;
    const osId = row?.dataset.osId;
    btn.disabled = true;
    try {
      if (btnConfirmar) {
        const item = osComCandidatosAtual.find((it) => String(it.os.id) === osId);
        const selectEl = row.querySelector('[data-select-colaborador]');
        const cand = item?.candidatos.find((c) => c.colaboradorId === selectEl?.value);
        if (item && cand) await confirmarCandidato(programacaoId, item.os, cand);
      } else if (btnRemover) {
        await removerConfirmacao(programacaoId, btn.dataset.remover);
      } else if (btnHotelEl) {
        const item = osComCandidatosAtual.find((it) => String(it.os.id) === osId);
        if (item) {
          const sol = await solicitarHospedagem(item.os, item.confirmadoRow, options.dataReferencia || null);
          hotelSolicitadoIds.add(osId);
          btn.textContent = '✓ Hotel solicitado';
          btn.classList.add('done');
          btn.disabled = true;
          if (sol?.codigo) {
            const info = document.createElement('span');
            info.className = 'peqb-chip peqb-chip-hotel';
            info.style.cssText = 'margin-left:4px;font-size:9px';
            info.textContent = sol.codigo;
            btn.after(info);
          }
          return; // não precisa recarregar a lista toda
        }
      }
      await carregarERenderizar();
    } catch (error) {
      console.error('[programacao-equipe] ação:', error);
      btn.disabled = false;
      alert(error.message || 'Erro ao salvar. Tente novamente.');
    }
  });

  listEl.addEventListener('change', (event) => {
    const select = event.target.closest('[data-select-colaborador]');
    const row = event.target.closest('.peqb-row');
    if (!select || !row) return;
    atualizarMapaParaOs(row.dataset.osId);
  });

  const autoPreencherBtn = content.querySelector('#peqbAutoPreencher');
  autoPreencherBtn.addEventListener('click', async () => {
    autoPreencherBtn.disabled = true;
    autoPreencherBtn.textContent = 'Preenchendo...';
    try {
      const pendentes = osComCandidatosAtual.filter((it) => !it.confirmadoRow && it.candidatos.length);
      for (const item of pendentes) {
        // Menor custo total para a empresa; fallback para candidatos sem custo calculado
        const comCusto = item.candidatos.filter((c) => c.custoTotal != null);
        const melhor = comCusto.length
          ? comCusto.reduce((a, b) => a.custoTotal <= b.custoTotal ? a : b)
          : item.candidatos[0];
        if (!melhor) continue;
        await confirmarCandidato(programacaoId, item.os, melhor);
        // Remove o colaborador recém-confirmado dos candidatos das próximas OS
        // desta mesma rodada, pra não escalar a mesma pessoa duas vezes.
        osComCandidatosAtual.forEach((outro) => {
          outro.candidatos = outro.candidatos.filter((c) => c.colaboradorId !== melhor.colaboradorId);
        });
      }
      await carregarERenderizar();
    } catch (error) {
      console.error('[programacao-equipe] auto-preencher:', error);
      alert(error.message || 'Erro ao auto-preencher.');
    } finally {
      autoPreencherBtn.disabled = false;
      autoPreencherBtn.textContent = 'Auto-preencher';
    }
  });

  const verRotasBtn = content.querySelector('#peqbVerRotas');
  verRotasBtn.addEventListener('click', async () => {
    verRotasBtn.disabled = true;
    verRotasBtn.textContent = 'Calculando rotas...';
    try {
      const osIds = osComCandidatosAtual.map((it) => String(it.os.id));
      const { data, error } = await supabase.functions.invoke('frotas-roteirizar', {
        body: { osIds, maxParadas: 4, publicar: false },
      });
      if (error) throw new Error(error.message || 'Falha ao calcular rotas.');
      if (data?.error) throw new Error(data.error);

      rotasPorOsId = new Map();
      // Só as rotas que atendem alguma OS desta tela (a function devolve
      // também veículos sem embarque hoje, que não interessam aqui).
      rotasCompletas = (data?.rotas || []).filter((rota) => rota.paradas.some((p) => p.os_id));
      rotasCompletas.forEach((rota) => {
        rota.paradas.filter((p) => p.os_id).forEach((p) => rotasPorOsId.set(p.os_id, rota));
      });
      if (!rotasPorOsId.size) alert('Nenhuma rota calculada (colaboradores sem coordenadas ou sem veículo disponível).');
      if (focoOsId) await atualizarMapaParaOs(focoOsId);
      else if (rotasCompletas.length) {
        const map = await garantirMapa(mapState, mapMount);
        if (map) { mapEmptyEl.style.display = 'none'; desenharTodasRotas(mapState, rotasCompletas); }
      }
    } catch (error) {
      console.error('[programacao-equipe] ver rotas:', error);
      alert(error.message || 'Erro ao calcular rotas.');
    } finally {
      verRotasBtn.disabled = false;
      verRotasBtn.textContent = 'Ver rotas no mapa';
    }
  });

  await carregarERenderizar();
}


async function solicitarHospedagem(os, confirmadoRow, dataReferencia) {
  const { uf, cidade } = parseEmbarqueUfCidade(os.embarque);
  const data = dataReferencia || new Date().toISOString().slice(0, 10);
  const nome = confirmadoRow?.nome_colaborador || '';
  const km = confirmadoRow?.km_estimado;

  const payload = {
    data_solicitacao: data,
    cidade: cidade || os.embarque || '',
    uf: uf || '',
    cliente: os.cliente || null,
    local_embarque: os.embarque || '',
    data_checkin_prevista: data,
    data_checkout_prevista: data,
    quantidade_diarias_prevista: 1,
    observacao_gestor: `Sugestão automática via Programação — ${nome}${km != null ? ` a ${km}km` : ''} do ponto de embarque.`,
    status_solicitacao: 'SOLICITADA',
  };

  const { data: sol, error } = await supabase.from('hospedagem_solicitacoes').insert(payload).select('id,codigo').single();
  if (error) throw error;

  const cpf = confirmadoRow?.colaborador_id && /^\d+$/.test(confirmadoRow.colaborador_id)
    ? confirmadoRow.colaborador_id : null;
  await supabase.from('hospedagem_solicitacao_colaboradores').insert({
    solicitacao_id: sol.id,
    colaborador_nome: nome,
    colaborador_cpf: cpf,
  });

  return sol;
}

async function confirmarCandidato(programacaoId, os, cand) {
  const payload = {
    programacao_id: programacaoId,
    os_id: os.id,
    colaborador_id: cand.colaboradorId,
    nome_colaborador: cand.nome,
    score: cand.score,
    score_contrato: cand.scoreContrato,
    score_distancia: cand.scoreDistancia,
    score_auditoria: cand.scoreAuditoria,
    km_estimado: cand.km,
    confirmado: true,
  };
  const { error } = await supabase.from('programacao_equipe').upsert(payload, { onConflict: 'programacao_id,os_id,colaborador_id' });
  if (error) throw error;

  // operacional_os_colaboradores é o vínculo OS<->colaborador usado por outras
  // telas (Frotas Roteirização, relatórios) — replica aqui o mesmo padrão
  // "substitui a atribuição da OS" que a distribuição manual já fazia.
  const { error: delErr } = await supabase.from('operacional_os_colaboradores').delete().eq('os_id', os.id);
  if (delErr) console.warn('[programacao-equipe] falha ao limpar vínculo anterior da OS.', delErr);
  const cpfCandidato = /^\d+$/.test(cand.colaboradorId) ? cand.colaboradorId : null;
  const { error: vinculoErr } = await supabase.from('operacional_os_colaboradores').insert({
    os_id: os.id,
    colaborador_key: cand.colaboradorId,
    colaborador_nome: cand.nome,
    colaborador_cpf: cpfCandidato,
    distancia_km: cand.km,
    origem_sugestao: 'PROGRAMACAO_ETAPA_B',
  });
  if (vinculoErr) console.warn('[programacao-equipe] falha ao gravar vínculo OS<->colaborador.', vinculoErr);

  // Colaborador que já é motorista de um veículo cadastrado (colaborador_cruzamento.veiculo_id)
  // entra como "Logística" em vez de "OK", mesma convenção usada em programacao.js/ensureDefaultRows.
  const espelho = {
    programacao_id: programacaoId,
    colaborador_id: cand.colaboradorId,
    nome_colaborador: cand.nome,
    cargo: cand.cargo || null,
    coordenacao: cand.coordenacao || null,
    supervisao: cand.supervisao || null,
    disponibilidade: cand.veiculoId ? 'LOGISTICA' : 'OK',
  };
  const { error: espelhoErr } = await supabase.from('programacao_colaboradores').upsert(espelho, { onConflict: 'programacao_id,colaborador_id' });
  if (espelhoErr) console.warn('[programacao-equipe] falha ao espelhar disponibilidade.', espelhoErr);
}

async function removerConfirmacao(programacaoId, equipeRowId) {
  const { data: rows, error: selErr } = await supabase.from('programacao_equipe').select('colaborador_id,os_id').eq('id', equipeRowId).limit(1);
  if (selErr) throw selErr;
  const colaboradorId = rows?.[0]?.colaborador_id;
  const osId = rows?.[0]?.os_id;

  const { error } = await supabase.from('programacao_equipe').delete().eq('id', equipeRowId);
  if (error) throw error;

  if (osId) {
    const { error: vinculoErr } = await supabase.from('operacional_os_colaboradores').delete().eq('os_id', osId);
    if (vinculoErr) console.warn('[programacao-equipe] falha ao remover vínculo OS<->colaborador.', vinculoErr);
  }

  if (colaboradorId) {
    const { error: updErr } = await supabase
      .from('programacao_colaboradores')
      .update({ disponibilidade: 'SEM EMBARQUE' })
      .eq('programacao_id', programacaoId)
      .eq('colaborador_id', colaboradorId);
    if (updErr) console.warn('[programacao-equipe] falha ao reverter disponibilidade.', updErr);
  }
}
