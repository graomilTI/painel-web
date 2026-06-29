import { supabase } from './supabaseClient.js';

const REGIONAL_MAP_CACHE_MS = 1000 * 60 * 15;

const STATE_PATHS = {
  MT: 'M278.20,387.30L294.39,360.23L294.54,335.13L261.17,334.75L261.32,292.49L322.05,292.04L326.84,263.61L354.21,304.06L480.99,312.53L471.03,343.45L474.07,369.84L464.04,412.25L454.00,413.92L449.75,428.43L441.31,429.79L426.94,448.17L422.31,463.67L425.50,470.62L406.42,470.70L413.72,463.82L413.80,454.97L405.66,463.44L386.28,463.89L369.63,454.44L355.50,457.77L340.37,469.26L323.88,456.48L323.88,437.05L287.93,437.13L287.70,422.31L280.10,413.84L286.48,414.14L286.10,404.77L283.59,393.50Z',
  PR: 'M425.27,559.61L489.95,568.76L500.82,598.10L523.70,610.95L512.53,625.47L501.43,625.47L494.59,629.85L487.22,626.22L473.99,626.37L471.33,630.23L460.84,631.67L458.56,638.09L414.71,630.91L408.70,618.89L396.31,617.98L402.93,587.74L408.63,576.09L415.70,566.34Z',
};

const SEGMENTS = [
  {
    key: 'MT1', state: 'MT', label: 'MT1', city: 'Sinop',
    aliases: ['MT1', 'MATO GROSSO MT1', 'SINOP'],
    area: 'M250 250 H375 C376 288 377 326 382 371 C346 380 307 385 250 386 Z',
    labelX: 334, labelY: 327,
  },
  {
    key: 'MT3', state: 'MT', label: 'MT3', city: 'Confresa',
    aliases: ['MT3', 'MATO GROSSO MT3', 'MATO GROSSO MT3 CONFRESA', 'MATO GROSSO MT3 QUERENCIA', 'CONFRESA', 'QUERENCIA'],
    area: 'M375 250 H510 V386 C462 383 420 377 382 371 C377 326 376 288 375 250 Z',
    labelX: 431, labelY: 330,
  },
  {
    key: 'MT4', state: 'MT', label: 'MT4', city: 'Campo Novo do Parecis',
    aliases: ['MT4', 'MATO GROSSO MT4', 'CAMPO NOVO DO PARECIS', 'CAMPO NOVO', 'PARECIS'],
    area: 'M250 386 C307 385 346 380 382 371 C379 408 379 444 384 500 H250 Z',
    labelX: 331, labelY: 425,
  },
  {
    key: 'MT2', state: 'MT', label: 'MT2', city: 'Primavera do Leste',
    aliases: ['MT2', 'MATO GROSSO MT2', 'PRIMAVERA DO LESTE', 'PRIMAVERA'],
    area: 'M382 371 C420 377 462 383 510 386 V500 H384 C379 444 379 408 382 371 Z',
    labelX: 432, labelY: 421,
  },
  {
    key: 'PR_MARINGA', state: 'PR', label: 'MAR', city: 'Maringá',
    aliases: ['MARINGA', 'MARINGA E TERMINAIS', 'MARINGÁ', 'MARINGÁ E TERMINAIS'],
    area: 'M386 552 H463 V600 C442 598 418 596 386 596 Z',
    labelX: 437, labelY: 584,
  },
  {
    key: 'PR_LONDRINA', state: 'PR', label: 'LON', city: 'Londrina',
    aliases: ['LONDRINA'],
    area: 'M463 552 H534 V602 C510 602 487 601 463 600 Z',
    labelX: 488, labelY: 587,
  },
  {
    key: 'PR_CASCAVEL', state: 'PR', label: 'CAS', city: 'Cascavel',
    aliases: ['CASCAVEL'],
    area: 'M386 596 C418 596 442 598 463 600 V650 H386 Z',
    labelX: 428, labelY: 617,
  },
  {
    key: 'PR_CURITIBA', state: 'PR', label: 'CTB', city: 'Curitiba',
    aliases: ['CURITIBA', 'PONTA GROSSA', 'PONTA GROSSA PR', 'PARANA CURITIBA', 'PARANÁ CURITIBA'],
    area: 'M463 600 C487 601 510 602 534 602 V650 H463 Z',
    labelX: 487, labelY: 620,
  },
];

const SEGMENT_BY_ALIAS = new Map();
for (const seg of SEGMENTS) {
  for (const alias of seg.aliases) SEGMENT_BY_ALIAS.set(normalizeStr(alias), seg.key);
}

let cachedRegionalData = null;
let cachedRegionalDataAt = 0;
let pendingLoad = null;

function normalizeStr(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function fmtTons(value) {
  return new Intl.NumberFormat('pt-BR').format(Math.round(Number(value) || 0)) + ' t';
}

function resolveRegionalKey(value) {
  const norm = normalizeStr(value);
  if (!norm) return null;
  if (SEGMENT_BY_ALIAS.has(norm)) return SEGMENT_BY_ALIAS.get(norm);

  for (const [alias, key] of SEGMENT_BY_ALIAS.entries()) {
    if (alias.length < 3) continue;
    if (norm.includes(alias) || alias.includes(norm)) return key;
  }
  return null;
}

function ensureRegionalStyles() {
  if (document.getElementById('dbRegionalMapStyles')) return;
  const style = document.createElement('style');
  style.id = 'dbRegionalMapStyles';
  style.textContent = `
    .db-regional-map-legend {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
      margin-top: 8px;
    }
    .db-map-chip {
      min-width: 0;
      border: 1px solid rgba(255,255,255,.07);
      background: rgba(13,13,24,.72);
      border-radius: 10px;
      padding: 7px 8px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 7px;
      color: #94a3b8;
      font-size: 9px;
      line-height: 1.15;
    }
    .db-map-chip b { color: #e2e2f0; font-size: 10px; letter-spacing: .04em; white-space: nowrap; }
    .db-map-chip small { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .db-map-chip strong { color: #6ee7b7; font-size: 10px; white-space: nowrap; }
    @media(max-width: 700px) { .db-regional-map-legend { grid-template-columns: 1fr; } }
  `;
  document.head.appendChild(style);
}

function getPalette(info) {
  const pct = Math.max(0, Math.min(100, Number(info?.pct) || 0));
  const hasData = !!info && (Number(info.meta) > 0 || Number(info.produzido) > 0);
  if (!hasData) {
    return { fill: 'rgba(255,255,255,.08)', stroke: 'rgba(255,255,255,.22)', text: 'rgba(255,255,255,.78)' };
  }
  if (info.onTrack || pct >= 100) {
    const alpha = (0.58 + pct / 100 * 0.32).toFixed(2);
    return { fill: `rgba(0,200,122,${alpha})`, stroke: 'rgba(45,212,160,.95)', text: 'rgba(235,255,246,.98)' };
  }
  const alpha = (0.56 + pct / 100 * 0.28).toFixed(2);
  return { fill: `rgba(253,230,138,${alpha})`, stroke: 'rgba(253,230,138,.90)', text: 'rgba(255,250,226,.98)' };
}

async function fetchAllRows(makeQuery, pageSize = 1000, maxPages = 30) {
  const rows = [];
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await makeQuery().range(from, to);
    if (error) throw error;
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return rows;
}

async function loadRegionalData() {
  const now = Date.now();
  if (cachedRegionalData && now - cachedRegionalDataAt < REGIONAL_MAP_CACHE_MS) return cachedRegionalData;
  if (pendingLoad) return pendingLoad;

  pendingLoad = (async () => {
    const ref = new Date();
    const ano = ref.getFullYear();
    const mes = ref.getMonth() + 1;
    const diaAtual = ref.getDate();
    const diasNoMes = new Date(ano, mes, 0).getDate();
    const dataIni = `${ano}-${String(mes).padStart(2, '0')}-01`;
    const dataFim = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, '0')}-01`;

    const [metaRes, prodRows] = await Promise.all([
      supabase
        .from('metas_producao')
        .select('meta_tons,regional')
        .eq('ano', ano)
        .eq('mes', mes)
        .eq('ativo', true),
      fetchAllRows(() => supabase
        .from('producao_snapshot')
        .select('data,coordenacao,tons')
        .gte('data', dataIni)
        .lt('data', dataFim)
        .order('data', { ascending: true })),
    ]);

    if (metaRes.error) throw metaRes.error;

    const map = Object.fromEntries(SEGMENTS.map((seg) => [seg.key, {
      key: seg.key,
      meta: 0,
      produzido: 0,
      pct: 0,
      ritmo: 0,
      onTrack: false,
    }]));

    for (const row of metaRes.data || []) {
      const key = resolveRegionalKey(row?.regional);
      if (key && map[key]) map[key].meta += Number(row?.meta_tons || 0);
    }

    for (const row of prodRows || []) {
      const key = resolveRegionalKey(row?.coordenacao);
      if (key && map[key]) map[key].produzido += Number(row?.tons || 0);
    }

    Object.values(map).forEach((item) => {
      item.pct = item.meta > 0 ? Math.min(100, item.produzido / item.meta * 100) : 0;
      item.ritmo = item.meta > 0 ? item.meta * diaAtual / diasNoMes : 0;
      item.onTrack = item.produzido >= item.ritmo;
    });

    cachedRegionalData = { ano, mes, segments: map };
    cachedRegionalDataAt = Date.now();
    return cachedRegionalData;
  })();

  try {
    return await pendingLoad;
  } finally {
    pendingLoad = null;
  }
}

function createSegmentLabel(seg, info, palette) {
  const pctText = info?.meta > 0 ? `${Math.round(info.pct)}%` : '—';
  const pctY = seg.state === 'PR' ? seg.labelY + 10 : seg.labelY + 16;
  const labelSize = seg.state === 'PR' ? 13 : 18;
  const pctSize = seg.state === 'PR' ? 12 : 20;
  const strokeW = seg.state === 'PR' ? 4 : 6;

  return `
    <text x="${seg.labelX}" y="${seg.labelY}" text-anchor="middle" dominant-baseline="central"
          style="font-size:${labelSize}px;font-weight:1000;letter-spacing:.05em;fill:${palette.text};paint-order:stroke fill;stroke:rgba(0,0,0,.82);stroke-width:${strokeW}px">${esc(seg.label)}</text>
    <text x="${seg.labelX}" y="${pctY}" text-anchor="middle" dominant-baseline="central"
          style="font-size:${pctSize}px;font-weight:1000;fill:${palette.text};paint-order:stroke fill;stroke:rgba(0,0,0,.82);stroke-width:${strokeW}px">${pctText}</text>
  `;
}

function createOverlay(data) {
  const defs = `
    <defs>
      <clipPath id="dbRegionalClipMT"><path d="${STATE_PATHS.MT}"/></clipPath>
      <clipPath id="dbRegionalClipPR"><path d="${STATE_PATHS.PR}"/></clipPath>
      <filter id="dbRegionalGlow" x="-25%" y="-25%" width="150%" height="150%">
        <feGaussianBlur stdDeviation="2.2" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
  `;

  const coverStates = ['MT', 'PR'].map((uf) => `
    <path d="${STATE_PATHS[uf]}" fill="rgba(13,13,24,.96)" stroke="rgba(255,255,255,.12)" stroke-width="1.1" stroke-linejoin="round"/>
  `).join('');

  const shapes = SEGMENTS.map((seg) => {
    const info = data.segments[seg.key];
    const palette = getPalette(info);
    return `
      <g clip-path="url(#dbRegionalClip${seg.state})">
        <path d="${seg.area}" fill="${palette.fill}" stroke="rgba(2,6,23,.84)" stroke-width="2.4" stroke-linejoin="round"/>
      </g>
      <path d="${STATE_PATHS[seg.state]}" fill="none" stroke="${palette.stroke}" stroke-width="0"/>
      ${createSegmentLabel(seg, info, palette)}
    `;
  }).join('');

  const borders = `
    <path d="${STATE_PATHS.MT}" fill="none" stroke="rgba(45,212,160,.72)" stroke-width="1.8" stroke-linejoin="round" filter="url(#dbRegionalGlow)"/>
    <path d="${STATE_PATHS.PR}" fill="none" stroke="rgba(45,212,160,.72)" stroke-width="1.8" stroke-linejoin="round" filter="url(#dbRegionalGlow)"/>
  `;

  return `${defs}<g class="db-regional-split-layer">${coverStates}${shapes}${borders}</g>`;
}

function createLegend(data) {
  const mtItems = SEGMENTS.filter((seg) => seg.state === 'MT');
  const prItems = SEGMENTS.filter((seg) => seg.state === 'PR');
  const items = [...mtItems, ...prItems];

  return `
    <div class="db-regional-map-legend" aria-label="Regionais separadas no mapa">
      ${items.map((seg) => {
        const info = data.segments[seg.key];
        const pctText = info?.meta > 0 ? `${Math.round(info.pct)}%` : 'sem meta';
        return `
          <div class="db-map-chip" title="${esc(seg.city)} · ${fmtTons(info?.produzido)} produzido${info?.meta > 0 ? ` de ${fmtTons(info.meta)} de meta` : ''}">
            <b>${esc(seg.label)}</b>
            <small>${esc(seg.city)}</small>
            <strong>${esc(pctText)}</strong>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function isMasterBrazilMap(svg) {
  if (!svg) return false;
  if (svg.querySelector('#dbStateClip')) return false;
  const text = svg.textContent || '';
  return text.includes('%') || svg.querySelectorAll('path').length > 10;
}

async function applyRegionalSplit() {
  const svg = document.querySelector('.db-prod-left .db-state-svg');
  if (!isMasterBrazilMap(svg)) return;
  if (svg.dataset.regionalSplitApplied === '1') return;

  try {
    ensureRegionalStyles();
    const data = await loadRegionalData();
    if (!data) return;

    svg.insertAdjacentHTML('beforeend', createOverlay(data));
    svg.dataset.regionalSplitApplied = '1';

    const wrap = svg.closest('.db-state-wrap');
    if (wrap) {
      wrap.querySelector('.db-regional-map-legend')?.remove();
      wrap.insertAdjacentHTML('beforeend', createLegend(data));
    }
  } catch (error) {
    console.warn('[dashboard-regional-map] não foi possível aplicar divisões regionais:', error?.message || error);
  }
}

function scheduleApply() {
  window.requestAnimationFrame(() => {
    applyRegionalSplit();
  });
}

scheduleApply();
setTimeout(scheduleApply, 800);
setTimeout(scheduleApply, 1800);

new MutationObserver(scheduleApply).observe(document.body, {
  childList: true,
  subtree: true,
});
