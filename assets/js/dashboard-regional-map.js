import { supabase } from './supabaseClient.js';

const REGIONAL_MAP_CACHE_MS = 1000 * 60 * 15;
const MAP_MODE_KEY = 'grao1000:dashboard-map-mode';

const STATE_PATHS = {
  MT: 'M278.20,387.30L294.39,360.23L294.54,335.13L261.17,334.75L261.32,292.49L322.05,292.04L326.84,263.61L354.21,304.06L480.99,312.53L471.03,343.45L474.07,369.84L464.04,412.25L454.00,413.92L449.75,428.43L441.31,429.79L426.94,448.17L422.31,463.67L425.50,470.62L406.42,470.70L413.72,463.82L413.80,454.97L405.66,463.44L386.28,463.89L369.63,454.44L355.50,457.77L340.37,469.26L323.88,456.48L323.88,437.05L287.93,437.13L287.70,422.31L280.10,413.84L286.48,414.14L286.10,404.77L283.59,393.50Z',
  PR: 'M425.27,559.61L489.95,568.76L500.82,598.10L523.70,610.95L512.53,625.47L501.43,625.47L494.59,629.85L487.22,626.22L473.99,626.37L471.33,630.23L460.84,631.67L458.56,638.09L414.71,630.91L408.70,618.89L396.31,617.98L402.93,587.74L408.63,576.09L415.70,566.34Z',
};

const SEGMENTS = [
  {
    key: 'MT1',
    state: 'MT',
    name: 'Sinop',
    aliases: ['MT1', 'MATO GROSSO MT1', 'SINOP'],
    path: 'M279 312 C300 298 326 289 355 289 C370 309 377 338 380 369 C356 375 329 378 298 378 C289 358 283 337 279 312 Z',
    labelX: 322,
    labelY: 344,
  },
  {
    key: 'MT3',
    state: 'MT',
    name: 'Confresa',
    aliases: ['MT3', 'MATO GROSSO MT3', 'MATO GROSSO MT3 CONFRESA', 'MATO GROSSO MT3 QUERENCIA', 'CONFRESA', 'QUERENCIA'],
    path: 'M355 289 C392 286 432 294 470 313 C467 335 458 355 443 375 C421 378 401 376 380 369 C377 338 370 309 355 289 Z',
    labelX: 422,
    labelY: 346,
  },
  {
    key: 'MT4',
    state: 'MT',
    name: 'Campo Novo do Parecis',
    aliases: ['MT4', 'MATO GROSSO MT4', 'CAMPO NOVO DO PARECIS', 'CAMPO NOVO', 'PARECIS'],
    path: 'M298 378 C329 378 356 375 380 369 C378 396 379 424 386 458 C366 464 344 468 321 466 C304 447 295 425 290 403 C287 394 287 386 298 378 Z',
    labelX: 321,
    labelY: 424,
  },
  {
    key: 'MT2',
    state: 'MT',
    name: 'Primavera do Leste',
    aliases: ['MT2', 'MATO GROSSO MT2', 'PRIMAVERA DO LESTE', 'PRIMAVERA'],
    path: 'M380 369 C401 376 421 378 443 375 C455 394 460 417 459 442 C451 458 439 468 425 472 C410 469 398 465 386 458 C379 424 378 396 380 369 Z',
    labelX: 421,
    labelY: 424,
  },

  {
    key: 'PR_MARINGA',
    state: 'PR',
    name: 'Maringá',
    aliases: ['MARINGA', 'MARINGÁ', 'MARINGA E TERMINAIS', 'MARINGÁ E TERMINAIS'],
    path: 'M414 566 C430 560 446 558 463 560 C462 573 462 587 463 600 C446 600 429 599 412 595 C411 585 412 575 414 566 Z',
    labelX: 438,
    labelY: 584,
  },
  {
    key: 'PR_LONDRINA',
    state: 'PR',
    name: 'Londrina',
    aliases: ['LONDRINA'],
    path: 'M463 560 C482 558 501 558 520 562 C523 573 524 587 523 600 C503 601 483 601 463 600 C462 587 462 573 463 560 Z',
    labelX: 492,
    labelY: 585,
  },
  {
    key: 'PR_CASCAVEL',
    state: 'PR',
    name: 'Cascavel',
    aliases: ['CASCAVEL'],
    path: 'M412 595 C429 599 446 600 463 600 C464 615 463 629 458 640 C442 641 426 638 411 631 C408 619 409 607 412 595 Z',
    labelX: 437,
    labelY: 620,
  },
  {
    key: 'PR_CURITIBA',
    state: 'PR',
    name: 'Curitiba',
    aliases: ['CURITIBA', 'PONTA GROSSA', 'PONTA GROSSA PR', 'PARANA CURITIBA', 'PARANÁ CURITIBA'],
    path: 'M463 600 C483 601 503 601 523 600 C521 613 516 625 503 635 C488 637 473 638 458 640 C463 629 464 615 463 600 Z',
    labelX: 492,
    labelY: 622,
  },
];

const SEGMENT_BY_ALIAS = new Map();
for (const segment of SEGMENTS) {
  for (const alias of segment.aliases) {
    SEGMENT_BY_ALIAS.set(normalizeStr(alias), segment.key);
  }
}

let cachedRegionalData = null;
let cachedRegionalDataAt = 0;
let pendingLoad = null;
let pendingApply = false;

function normalizeStr(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function getCurrentMode() {
  const saved = localStorage.getItem(MAP_MODE_KEY);
  return saved === 'regional' ? 'regional' : 'estado';
}

function setCurrentMode(mode) {
  localStorage.setItem(MAP_MODE_KEY, mode === 'regional' ? 'regional' : 'estado');
}

function fmtPct(value) {
  return `${Math.round(Number(value) || 0)}%`;
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

function ensureStyles() {
  if (document.getElementById('dbRegionalMapStyles')) return;

  const style = document.createElement('style');
  style.id = 'dbRegionalMapStyles';
  style.textContent = `
    .db-map-mode-toggle {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px;
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 12px;
      background: rgba(13,13,24,.72);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.03);
    }

    .db-map-mode-btn {
      border: 0;
      background: transparent;
      color: #94a3b8;
      border-radius: 9px;
      padding: 8px 12px;
      font-size: 10px;
      font-weight: 900;
      letter-spacing: .08em;
      text-transform: uppercase;
      cursor: pointer;
      transition: .18s ease;
    }

    .db-map-mode-btn:hover {
      color: #e2e8f0;
      background: rgba(255,255,255,.04);
    }

    .db-map-mode-btn.is-active {
      background: rgba(0,200,122,.14);
      color: #6ee7b7;
      box-shadow: 0 0 0 1px rgba(45,212,160,.18) inset;
    }

    .db-state-svg .db-regional-overlay path,
    .db-state-svg .db-regional-overlay text {
      transition: all .25s ease;
    }
  `;
  document.head.appendChild(style);
}

function ensureToggle() {
  const head = document.querySelector('.db-section .db-section-head');
  if (!head) return;

  let wrap = head.querySelector('.db-map-mode-toggle');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'db-map-mode-toggle';
    wrap.innerHTML = `
      <button type="button" class="db-map-mode-btn" data-mode="estado">Estado</button>
      <button type="button" class="db-map-mode-btn" data-mode="regional">Regional</button>
    `;
    head.appendChild(wrap);

    wrap.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-mode]');
      if (!btn) return;
      const mode = btn.dataset.mode;
      setCurrentMode(mode);
      updateToggleUI();
      scheduleApply();
    });
  }

  updateToggleUI();
}

function updateToggleUI() {
  const mode = getCurrentMode();
  document.querySelectorAll('.db-map-mode-btn').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.mode === mode);
  });
}

function getPalette(info) {
  const pct = Math.max(0, Math.min(100, Number(info?.pct) || 0));
  const hasData = !!info && (Number(info.meta) > 0 || Number(info.produzido) > 0);

  if (!hasData) {
    return {
      fill: 'rgba(255,255,255,.06)',
      stroke: 'rgba(255,255,255,.12)',
      text: 'rgba(255,255,255,.78)',
    };
  }

  if (info.onTrack || pct >= 100) {
    const alpha = (0.32 + (pct / 100) * 0.42).toFixed(2);
    return {
      fill: `rgba(0,200,122,${alpha})`,
      stroke: 'rgba(45,212,160,.78)',
      text: 'rgba(238,255,246,.96)',
    };
  }

  const alpha = (0.28 + (pct / 100) * 0.34).toFixed(2);
  return {
    fill: `rgba(253,230,138,${alpha})`,
    stroke: 'rgba(253,230,138,.72)',
    text: 'rgba(255,248,220,.95)',
  };
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
  const nowMs = Date.now();
  if (cachedRegionalData && (nowMs - cachedRegionalDataAt) < REGIONAL_MAP_CACHE_MS) {
    return cachedRegionalData;
  }

  if (pendingLoad) return pendingLoad;

  pendingLoad = (async () => {
    const ref = new Date();
    const ano = ref.getFullYear();
    const mes = ref.getMonth() + 1;
    const diaAtual = ref.getDate();
    const diasNoMes = new Date(ano, mes, 0).getDate();
    const dataIni = `${ano}-${String(mes).padStart(2, '0')}-01`;
    const dataFim = mes === 12
      ? `${ano + 1}-01-01`
      : `${ano}-${String(mes + 1).padStart(2, '0')}-01`;

    const [metaRes, prodRows] = await Promise.all([
      supabase
        .from('metas_producao')
        .select('meta_tons,regional')
        .eq('ano', ano)
        .eq('mes', mes)
        .eq('ativo', true),

      fetchAllRows(() =>
        supabase
          .from('producao_snapshot')
          .select('data,coordenacao,tons')
          .gte('data', dataIni)
          .lt('data', dataFim)
          .order('data', { ascending: true })
      ),
    ]);

    if (metaRes.error) throw metaRes.error;

    const map = Object.fromEntries(
      SEGMENTS.map((seg) => [seg.key, {
        key: seg.key,
        meta: 0,
        produzido: 0,
        pct: 0,
        ritmo: 0,
        onTrack: false,
      }])
    );

    for (const row of (metaRes.data || [])) {
      const key = resolveRegionalKey(row?.regional);
      if (key && map[key]) {
        map[key].meta += Number(row?.meta_tons || 0);
      }
    }

    for (const row of (prodRows || [])) {
      const key = resolveRegionalKey(row?.coordenacao);
      if (key && map[key]) {
        map[key].produzido += Number(row?.tons || 0);
      }
    }

    Object.values(map).forEach((item) => {
      item.pct = item.meta > 0 ? Math.min(100, (item.produzido / item.meta) * 100) : 0;
      item.ritmo = item.meta > 0 ? (item.meta * diaAtual / diasNoMes) : 0;
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

function isMasterBrazilMap(svg) {
  if (!svg) return false;
  if (svg.querySelector('#dbStateClip')) return false;
  return svg.querySelectorAll('path').length > 20;
}

function removeRegionalOverlay(svg) {
  if (!svg) return;
  svg.querySelectorAll('.db-regional-overlay').forEach((el) => el.remove());
}

function createRegionalLabel(seg, info, palette) {
  const hasData = !!info && (Number(info.meta) > 0 || Number(info.produzido) > 0);
  if (!hasData) return '';

  const fontSize = seg.state === 'PR' ? 12 : 18;
  const strokeWidth = seg.state === 'PR' ? 4 : 6;

  return `
    <text
      x="${seg.labelX}"
      y="${seg.labelY}"
      text-anchor="middle"
      dominant-baseline="central"
      style="
        font-size:${fontSize}px;
        font-weight:1000;
        letter-spacing:-.02em;
        fill:${palette.text};
        paint-order:stroke fill;
        stroke:rgba(0,0,0,.78);
        stroke-width:${strokeWidth}px;
      "
    >${fmtPct(info.pct)}</text>
  `;
}

function createRegionalOverlay(data) {
  const defs = `
    <defs>
      <clipPath id="dbRegionalClipMT"><path d="${STATE_PATHS.MT}"/></clipPath>
      <clipPath id="dbRegionalClipPR"><path d="${STATE_PATHS.PR}"/></clipPath>
    </defs>
  `;

  const stateCovers = ['MT', 'PR'].map((uf) => `
    <path
      d="${STATE_PATHS[uf]}"
      fill="rgba(13,13,24,.92)"
      stroke="rgba(255,255,255,.12)"
      stroke-width="1"
      stroke-linejoin="round"
    />
  `).join('');

  const segments = SEGMENTS.map((seg) => {
    const info = data.segments[seg.key];
    const palette = getPalette(info);

    return `
      <g class="db-regional-segment" clip-path="url(#dbRegionalClip${seg.state})">
        <title>${seg.name} — ${fmtPct(info?.pct || 0)}</title>
        <path
          d="${seg.path}"
          fill="${palette.fill}"
          stroke="rgba(15,23,42,.72)"
          stroke-width="1.6"
          stroke-linejoin="round"
        />
      </g>
      ${createRegionalLabel(seg, info, palette)}
    `;
  }).join('');

  const outlines = ['MT', 'PR'].map((uf) => `
    <path
      d="${STATE_PATHS[uf]}"
      fill="none"
      stroke="rgba(255,255,255,.22)"
      stroke-width="1.1"
      stroke-linejoin="round"
    />
  `).join('');

  return `
    <g class="db-regional-overlay">
      ${defs}
      ${stateCovers}
      ${segments}
      ${outlines}
    </g>
  `;
}

async function applyMapMode() {
  ensureStyles();
  ensureToggle();

  const svg = document.querySelector('.db-prod-left .db-state-svg');
  if (!isMasterBrazilMap(svg)) return;

  removeRegionalOverlay(svg);

  const mode = getCurrentMode();
  if (mode !== 'regional') return;

  try {
    const data = await loadRegionalData();
    svg.insertAdjacentHTML('beforeend', createRegionalOverlay(data));
  } catch (error) {
    console.warn('[dashboard-regional-map] erro ao aplicar modo regional:', error?.message || error);
  }
}

function scheduleApply() {
  if (pendingApply) return;
  pendingApply = true;

  requestAnimationFrame(async () => {
    pendingApply = false;
    await applyMapMode();
  });
}

ensureStyles();
ensureToggle();

scheduleApply();
setTimeout(scheduleApply, 600);
setTimeout(scheduleApply, 1600);

new MutationObserver(() => {
  ensureToggle();
  updateToggleUI();
  scheduleApply();
}).observe(document.body, {
  childList: true,
  subtree: true,
});
