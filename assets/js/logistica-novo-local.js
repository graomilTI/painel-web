// Novo local de embarque (Abrir OS): o usuário escolhe UF e cidade, o mapa da cidade abre e ele marca
// onde fica o local. Se já existir outro local a até 2 km do ponto, sugere-o antes de criar.
// O novo local NÃO é criado no GRM: fica em logistica_locais_embarque_novos (PENDENTE) e a O.S. segue
// marcada como "local novo" para a Logística cadastrar no GRM.
import { supabase } from './supabaseClient.js';
import { centroDaCidade, limitesDaCidade, chaveLocal, locaisProximos, RAIO_PROXIMIDADE_KM } from './logistica-locais-servico.js?v=20260924-novo3';

const LEAFLET_CSS_HREF = './assets/vendor/leaflet/leaflet.css';
const LEAFLET_JS_SRC = './assets/vendor/leaflet/leaflet.js';
const BRASIL = { lat: -14.235, lng: -51.925, zoom: 4 };

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function ensureLeaflet() {
  if (window.L) return true;
  try {
    if (!document.getElementById('nleLeafletCss')) {
      const link = document.createElement('link');
      link.id = 'nleLeafletCss'; link.rel = 'stylesheet'; link.href = LEAFLET_CSS_HREF;
      document.head.appendChild(link);
    }
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = LEAFLET_JS_SRC; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
    return !!window.L;
  } catch { return false; }
}

function injectStyle() {
  if (document.getElementById('nleStyle')) return;
  const style = document.createElement('style');
  style.id = 'nleStyle';
  style.textContent = `
    .nle-overlay{position:fixed;inset:0;z-index:210000;background:rgba(0,0,0,.66);display:flex;align-items:center;justify-content:center;padding:16px}
    .nle-modal{width:min(980px,100%);max-height:calc(100vh - 32px);overflow:auto;background:#0d0d18;border:1px solid rgba(45,212,160,.3);border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,.6);color:#e2e2f0}
    .nle-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 18px;border-bottom:1px solid rgba(148,163,184,.16)}
    .nle-head h3{margin:0;font-size:17px}
    .nle-head p{margin:2px 0 0;font-size:12px;color:#7d8aa3}
    .nle-x{background:transparent;border:0;color:#a9b8b1;font-size:22px;line-height:1;cursor:pointer}
    .nle-body{display:grid;grid-template-columns:minmax(0,320px) minmax(0,1fr);gap:16px;padding:16px 18px}
    .nle-form{display:flex;flex-direction:column;gap:10px}
    .nle-form label{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:700;color:#a9b8b1}
    .nle-form .nle-row{display:grid;grid-template-columns:90px 1fr;gap:8px}
    .nle-map{height:400px;border-radius:12px;border:1px solid rgba(52,211,153,.2);overflow:hidden;background:#07110d}
    .nle-coord{font-size:12px;color:#7d8aa3;min-height:16px}
    .nle-prox{border:1px solid rgba(250,204,21,.32);background:rgba(250,204,21,.08);border-radius:12px;padding:10px 12px;font-size:12px}
    .nle-prox b{color:#fde68a}
    .nle-prox ul{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:6px}
    .nle-prox li{display:flex;align-items:center;justify-content:space-between;gap:8px}
    .nle-prox li span{min-width:0;overflow:hidden;text-overflow:ellipsis}
    .nle-prox small{color:#a9b8b1}
    .nle-foot{display:flex;justify-content:flex-end;gap:10px;padding:14px 18px;border-top:1px solid rgba(148,163,184,.16)}
    .nle-msg{font-size:12px;color:#fca5a5;min-height:16px}
    @media(max-width:820px){.nle-body{grid-template-columns:1fr}.nle-map{height:300px}}
  `;
  document.head.appendChild(style);
}

// Resolve com:
//   { tipo: 'existente', uf, cidade, nome_local }   -> usuário aceitou um local já cadastrado no raio
//   { tipo: 'novo', local }                          -> novo local gravado (PENDENTE) ou já pendente próximo
//   null                                             -> cancelou
export function abrirNovoLocalEmbarque({ uf = '', cidade = '', nome = '', ufs = [], cidadesDaUf = () => [], solicitante = {} }) {
  injectStyle();
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'nle-overlay';
    overlay.innerHTML = `
      <div class="nle-modal" role="dialog" aria-modal="true" aria-label="Novo local de embarque">
        <div class="nle-head">
          <div><h3>Novo local de embarque</h3><p>Escolha a UF e a cidade e clique no mapa onde fica o local. Se já houver um local a até ${RAIO_PROXIMIDADE_KM} km, você poderá usá-lo.</p></div>
          <button class="nle-x" type="button" data-nle-fechar aria-label="Fechar">×</button>
        </div>
        <div class="nle-body">
          <div class="nle-form">
            <div class="nle-row">
              <label>UF<select id="nleUf" class="log-input"><option value="">UF</option>${ufs.map((u) => `<option value="${esc(u)}" ${u === uf ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select></label>
              <label>Cidade<input id="nleCidade" class="log-input" list="nleCidades" autocomplete="off" value="${esc(cidade)}" placeholder="Cidade"></label>
            </div>
            <datalist id="nleCidades">${cidadesDaUf(uf).map((c) => `<option value="${esc(c)}"></option>`).join('')}</datalist>
            <label>Nome do local de embarque<input id="nleNome" class="log-input" autocomplete="off" value="${esc(nome)}" placeholder="Ex.: COOPERATIVA X - FILIAL Y"></label>
            <div class="nle-coord" id="nleCoord">Clique no mapa para marcar o local.</div>
            <div id="nleProx" hidden></div>
            <div class="nle-msg" id="nleMsg"></div>
          </div>
          <div class="nle-map" id="nleMap"></div>
        </div>
        <div class="nle-foot">
          <button class="btn btn-secondary" type="button" data-nle-fechar>Cancelar</button>
          <button class="log-btn-ok" type="button" id="nleSalvar" disabled>Usar este novo local</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const $ = (sel) => overlay.querySelector(sel);
    let map = null;
    let marker = null;
    let camada = null;
    let limite = null; // contorno do município (IBGE)
    let ponto = null; // { lat, lng }
    let proximos = [];
    let ocupado = false;
    let fechado = false;

    function fechar(resultado) {
      fechado = true;
      try { map?.remove(); } catch { /* ignore */ }
      map = null;
      overlay.remove();
      resolve(resultado);
    }

    function atualizarBotao() {
      const ok = ponto && $('#nleUf').value && $('#nleCidade').value.trim() && $('#nleNome').value.trim().length >= 3;
      $('#nleSalvar').disabled = !ok || ocupado;
    }

    function renderProximos() {
      const box = $('#nleProx');
      if (!ponto || !proximos.length) { box.hidden = true; box.innerHTML = ''; return; }
      box.hidden = false;
      box.className = 'nle-prox';
      box.innerHTML = `<b>Já existe local a até ${RAIO_PROXIMIDADE_KM} km deste ponto.</b> É algum destes?<ul>${proximos.slice(0, 5).map((p, i) => `
        <li><span>${esc(p.nome_local)}<br><small>${esc(p.cidade)}/${esc(p.uf)} · ${p.km < 1 ? `${Math.round(p.km * 1000)} m` : `${p.km.toFixed(1).replace('.', ',')} km`}${p.novo ? ' · novo local já solicitado' : ''}</small></span>
        <button class="btn btn-secondary" type="button" data-nle-usar="${i}">É este</button></li>`).join('')}</ul>`;
    }

    async function pontoMarcado(lat, lng) {
      ponto = { lat, lng };
      $('#nleCoord').textContent = `Ponto marcado: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      if (!marker) {
        marker = window.L.marker([lat, lng], { draggable: true }).addTo(map);
        marker.on('dragend', () => { const p = marker.getLatLng(); pontoMarcado(p.lat, p.lng); });
      } else marker.setLatLng([lat, lng]);
      atualizarBotao();
      try { proximos = await locaisProximos(lat, lng); } catch (e) { console.warn('[novo-local] proximidade', e); proximos = []; }
      if (!fechado && ponto && ponto.lat === lat && ponto.lng === lng) renderProximos();
    }

    async function centralizarCidade() {
      if (!map || fechado) return;
      const u = $('#nleUf').value;
      const c = $('#nleCidade').value.trim();
      // 1) contorno oficial do município (IBGE): enquadra a cidade inteira e a desenha no mapa;
      // 2) sem contorno: mediana dos locais do GRM na cidade / geocodificação; 3) Brasil.
      const geo = (u && c && await limitesDaCidade(u, c)) || null;
      const centro = geo ? null : ((u && c && await centroDaCidade(u, c)) || null);
      if (fechado || !map) return;
      limite?.remove();
      limite = null;
      map.invalidateSize();
      if (geo) {
        limite = window.L.geoJSON(geo, { style: { color: '#22e58a', weight: 2, fillColor: '#22e58a', fillOpacity: 0.06, interactive: false } }).addTo(map);
        map.fitBounds(limite.getBounds(), { padding: [16, 16] });
      } else {
        const alvo = centro || BRASIL;
        map.setView([alvo.lat, alvo.lng], alvo.zoom);
      }
      // Locais já cadastrados na cidade (com coordenada) como referência no mapa.
      camada?.clearLayers();
      if (u && c && !fechado) {
        const { data } = await supabase.from('grm_locais_servico').select('nome_local,latitude,longitude')
          .eq('ativo', true).eq('uf', u).eq('cidade_norm', chaveLocal(c)).not('latitude', 'is', null).limit(300);
        if (fechado || !camada) return;
        (data || []).forEach((l) => window.L.circleMarker([Number(l.latitude), Number(l.longitude)], { radius: 5, weight: 1, color: '#fff', fillColor: '#64748b', fillOpacity: 0.85 })
          .bindTooltip(esc(l.nome_local)).addTo(camada));
      }
    }

    (async () => {
      const ok = await ensureLeaflet();
      if (fechado) return;
      if (!ok) { $('#nleMap').innerHTML = '<div style="padding:18px;color:#fca5a5">Não foi possível carregar o mapa.</div>'; return; }
      const L = window.L;
      map = L.map($('#nleMap'), { center: [BRASIL.lat, BRASIL.lng], zoom: BRASIL.zoom });
      // Mapa de ruas (OpenStreetMap): mais legível para marcar exatamente onde fica o armazém.
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
      camada = L.layerGroup().addTo(map);
      map.on('click', (e) => pontoMarcado(e.latlng.lat, e.latlng.lng));
      requestAnimationFrame(() => { if (!fechado && map) map.invalidateSize(); });
      centralizarCidade();
    })();

    $('#nleUf').addEventListener('change', () => {
      $('#nleCidade').value = '';
      $('#nleCidades').innerHTML = cidadesDaUf($('#nleUf').value).map((c) => `<option value="${esc(c)}"></option>`).join('');
      atualizarBotao();
    });
    $('#nleCidade').addEventListener('change', () => { centralizarCidade(); atualizarBotao(); });
    $('#nleNome').addEventListener('input', atualizarBotao);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('[data-nle-fechar]')) { fechar(null); return; }
      const usar = e.target.closest('[data-nle-usar]');
      if (usar) {
        const p = proximos[Number(usar.dataset.nleUsar)];
        if (!p) return;
        if (p.novo) fechar({ tipo: 'novo', local: { id: p.id, nome_local: p.nome_local, uf: p.uf, cidade: p.cidade, latitude: p.latitude, longitude: p.longitude, ja_pendente: true } });
        else fechar({ tipo: 'existente', uf: p.uf, cidade: p.cidade, nome_local: p.nome_local });
      }
    });

    $('#nleSalvar').addEventListener('click', async () => {
      if (!ponto) return;
      ocupado = true;
      atualizarBotao();
      $('#nleMsg').textContent = '';
      const registro = {
        nome_local: $('#nleNome').value.trim().toUpperCase(),
        uf: $('#nleUf').value,
        cidade: $('#nleCidade').value.trim(),
        latitude: Number(ponto.lat.toFixed(7)),
        longitude: Number(ponto.lng.toFixed(7)),
        solicitante_id: solicitante.id || null,
        solicitante_nome: solicitante.nome || null,
        status: 'PENDENTE',
      };
      const { data, error } = await supabase.from('logistica_locais_embarque_novos').insert(registro).select('id,nome_local,uf,cidade,latitude,longitude').single();
      ocupado = false;
      if (error) { $('#nleMsg').textContent = `Não foi possível salvar o novo local: ${error.message}`; atualizarBotao(); return; }
      fechar({ tipo: 'novo', local: data });
    });

    atualizarBotao();
    $('#nleNome').focus();
  });
}
