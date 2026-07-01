import { supabase } from './supabaseClient.js';

let mapaCargasIrreg = null;
let markersLayer = null;

function fmtData(v) {
  if (!v) return '-';
  const s = String(v);
  const p = s.slice(0, 10).split('-');
  if (p.length === 3) return `${p[2]}/${p[1]}/${p[0]}`;
  return s;
}

function fmtDataHora(v) {
  if (!v) return '-';
  try {
    return new Date(v).toLocaleString('pt-BR');
  } catch (e) {
    return String(v);
  }
}

function fmtKm(m) {
  const n = Number(m || 0);
  if (n >= 1000) return `${(n / 1000).toFixed(2).replace('.', ',')} km`;
  return `${Math.round(n)} m`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function carregarIrregularidadesCargas() {
  const hoje = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('logistica_cargas_irregularidades')
    .select('*')
    .gte('data_classificacao', hoje)
    .order('detectado_em', { ascending: false })
    .limit(1000);

  if (error) {
    console.error(error);
    alert('Erro ao carregar irregularidades de cargas: ' + error.message);
    return;
  }

  const rows = data || [];
  renderCards(rows);
  renderTabela(rows);
  renderMapa(rows);
}

function renderCards(rows) {
  const el = document.getElementById('cardsIrregularidadesCargas');
  if (!el) return;
  const abertas = rows.filter(r => r.status === 'ABERTA').length;
  const colaboradores = new Set(rows.map(r => r.colaborador).filter(Boolean)).size;
  const maiorDist = rows.reduce((max, r) => Math.max(max, Number(r.distancia_m || 0)), 0);

  el.innerHTML = `
    <div class="card"><span>Total hoje</span><strong>${rows.length}</strong></div>
    <div class="card"><span>Abertas</span><strong>${abertas}</strong></div>
    <div class="card"><span>Colaboradores</span><strong>${colaboradores}</strong></div>
    <div class="card"><span>Maior distância</span><strong>${fmtKm(maiorDist)}</strong></div>
  `;
}

function renderTabela(rows) {
  const tbody = document.querySelector('#tabelaIrregularidadesCargas tbody');
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding: 18px;">Nenhuma irregularidade encontrada hoje.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${fmtDataHora(r.detectado_em)}</td>
      <td>${fmtData(r.data_classificacao)}</td>
      <td>${escapeHtml(r.os)}</td>
      <td>${escapeHtml(r.cliente)}</td>
      <td>${escapeHtml(r.coordenacao)}</td>
      <td>${escapeHtml(r.supervisao)}</td>
      <td>${escapeHtml(r.colaborador)}</td>
      <td>${escapeHtml(r.placa)}</td>
      <td>${fmtKm(r.distancia_m)}</td>
      <td>${escapeHtml(r.status)}</td>
    </tr>
  `).join('');
}

function renderMapa(rows) {
  const el = document.getElementById('mapaIrregularidadesCargas');
  if (!el || !window.L) return;

  if (!mapaCargasIrreg) {
    mapaCargasIrreg = L.map(el).setView([-24.9555, -53.4552], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(mapaCargasIrreg);
    markersLayer = L.layerGroup().addTo(mapaCargasIrreg);
  }

  markersLayer.clearLayers();

  const pontos = rows.filter(r => Number.isFinite(Number(r.lat_lancamento)) && Number.isFinite(Number(r.lng_lancamento)));

  pontos.forEach(r => {
    const lat = Number(r.lat_lancamento);
    const lng = Number(r.lng_lancamento);
    const marker = L.marker([lat, lng]);
    marker.bindPopup(`
      <strong>O.S. ${escapeHtml(r.os)}</strong><br>
      ${escapeHtml(r.cliente || '')}<br>
      Coordenação: ${escapeHtml(r.coordenacao || '')}<br>
      Supervisão: ${escapeHtml(r.supervisao || '')}<br>
      Colaborador: ${escapeHtml(r.colaborador || '')}<br>
      Distância: ${fmtKm(r.distancia_m)}
    `);
    marker.addTo(markersLayer);

    if (Number.isFinite(Number(r.lat_os)) && Number.isFinite(Number(r.lng_os))) {
      L.circle([Number(r.lat_os), Number(r.lng_os)], {
        radius: Number(r.raio_m || 2000)
      }).addTo(markersLayer);
      L.polyline([[lat, lng], [Number(r.lat_os), Number(r.lng_os)]]).addTo(markersLayer);
    }
  });

  if (pontos.length) {
    const bounds = L.latLngBounds(pontos.map(r => [Number(r.lat_lancamento), Number(r.lng_lancamento)]));
    mapaCargasIrreg.fitBounds(bounds, { padding: [30, 30] });
  }
}

document.addEventListener('DOMContentLoaded', carregarIrregularidadesCargas);
document.getElementById('btnAtualizarIrregularidadesCargas')?.addEventListener('click', carregarIrregularidadesCargas);

window.carregarIrregularidadesCargas = carregarIrregularidadesCargas;
