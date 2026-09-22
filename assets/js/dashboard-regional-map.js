import { supabase } from './supabaseClient.js';

const REGIONAL_MAP_CACHE_MS = 1000 * 60 * 15;
const MAP_MODE_KEY = 'grao1000:dashboard-map-mode';

const STATE_PATHS = {
  MT: 'M278.20,387.30L294.39,360.23L294.54,335.13L261.17,334.75L261.32,292.49L322.05,292.04L326.84,263.61L354.21,304.06L480.99,312.53L471.03,343.45L474.07,369.84L464.04,412.25L454.00,413.92L449.75,428.43L441.31,429.79L426.94,448.17L422.31,463.67L425.50,470.62L406.42,470.70L413.72,463.82L413.80,454.97L405.66,463.44L386.28,463.89L369.63,454.44L355.50,457.77L340.37,469.26L323.88,456.48L323.88,437.05L287.93,437.13L287.70,422.31L280.10,413.84L286.48,414.14L286.10,404.77L283.59,393.50Z',
  PR: 'M425.27,559.61L489.95,568.76L500.82,598.10L523.70,610.95L512.53,625.47L501.43,625.47L494.59,629.85L487.22,626.22L473.99,626.37L471.33,630.23L460.84,631.67L458.56,638.09L414.71,630.91L408.70,618.89L396.31,617.98L402.93,587.74L408.63,576.09L415.70,566.34Z',
};

// Coordenações reais (campo "Coordenação" do GRM) dentro de cada estado.
// Fonte: operacional_pontos_embarque (5.041 locais geocodificados, seed
// "Locais de Serviço"), cruzando cidade -> coordenação sem nenhum conflito
// (cada cidade pertence a exatamente 1 coordenação — 90 cidades em MT,
// 241 em PR). Os aliases antigos ("CURITIBA", "MT3" solto, etc.) foram
// mantidos para não perder metas já cadastradas com esses nomes.
const REGIONS = {
  MT1: { state: 'MT', name: 'Sinop', aliases: ['MT1', 'MATO GROSSO MT1', 'SINOP'] },
  MT2: { state: 'MT', name: 'Primavera do Leste', aliases: ['MT2', 'MATO GROSSO MT2', 'PRIMAVERA DO LESTE', 'PRIMAVERA'] },
  MT3_CONFRESA: { state: 'MT', name: 'Confresa', aliases: ['MATO GROSSO MT3 - CONFRESA', 'MATO GROSSO MT3 CONFRESA', 'CONFRESA'] },
  MT3_QUERENCIA: { state: 'MT', name: 'Querência', aliases: ['MATO GROSSO MT3 - QUERENCIA', 'MATO GROSSO MT3 QUERENCIA', 'QUERENCIA'] },
  MT4: { state: 'MT', name: 'Campo Novo do Parecis', aliases: ['MT4', 'MATO GROSSO MT4', 'CAMPO NOVO DO PARECIS', 'CAMPO NOVO', 'PARECIS'] },
  PR_CASCAVEL: { state: 'PR', name: 'Cascavel', aliases: ['CASCAVEL'] },
  PR_LONDRINA: { state: 'PR', name: 'Londrina', aliases: ['LONDRINA'] },
  PR_MARINGA: { state: 'PR', name: 'Maringá', aliases: ['MARINGA', 'MARINGÁ', 'MARINGA E TERMINAIS', 'MARINGÁ E TERMINAIS'] },
  PR_PONTA_GROSSA: { state: 'PR', name: 'Ponta Grossa', aliases: ['PONTA GROSSA', 'PONTA GROSSA PR', 'CURITIBA', 'PARANA CURITIBA', 'PARANÁ CURITIBA'] },
};

// Mosaico geográfico por coordenação: grade de 5x5 (unidades do viewBox
// 800x796) recortada dentro do contorno real de cada estado, rotulando
// cada célula pela coordenação da cidade mais próxima (equivalente a um
// diagrama de Voronoi discretizado — mesma técnica de "vizinho mais
// próximo", só que pré-computada em vez de calculada no navegador).
// Gerado a partir das 331 cidades reais de MT/PR em operacional_pontos_embarque;
// script de geração em docs (analisar novamente se a base de locais mudar
// significativamente). Linhas mescladas horizontalmente para reduzir a
// quantidade de retângulos.
const MOSAIC = {
  MT: [
    [326.2,268.6,5,5,'MT1'],[326.2,273.6,10,5,'MT1'],[326.2,278.6,15,5,'MT1'],[321.2,283.6,5,5,'MT4'],[326.2,283.6,15,5,'MT1'],[321.2,288.6,5,5,'MT4'],[326.2,288.6,20,5,'MT1'],[261.2,293.6,65,5,'MT4'],[326.2,293.6,25,5,'MT1'],[261.2,298.6,65,5,'MT4'],[326.2,298.6,25,5,'MT1'],[261.2,303.6,60,5,'MT4'],[321.2,303.6,65,5,'MT1'],[261.2,308.6,45,5,'MT4'],[306.2,308.6,110,5,'MT1'],[416.2,308.6,45,5,'MT3_CONFRESA'],[261.2,313.6,50,5,'MT4'],[311.2,313.6,105,5,'MT1'],[416.2,313.6,15,5,'MT3_CONFRESA'],[431.2,313.6,10,5,'MT3_QUERENCIA'],[441.2,313.6,5,5,'MT3_CONFRESA'],[446.2,313.6,5,5,'MT3_QUERENCIA'],[451.2,313.6,30,5,'MT3_CONFRESA'],[261.2,318.6,55,5,'MT4'],[316.2,318.6,105,5,'MT1'],[421.2,318.6,45,5,'MT3_QUERENCIA'],[466.2,318.6,10,5,'MT3_CONFRESA'],[261.2,323.6,60,5,'MT4'],[321.2,323.6,95,5,'MT1'],[416.2,323.6,60,5,'MT3_QUERENCIA'],[261.2,328.6,60,5,'MT4'],[321.2,328.6,85,5,'MT1'],[406.2,328.6,70,5,'MT3_QUERENCIA'],[296.2,333.6,30,5,'MT4'],[326.2,333.6,75,5,'MT1'],[401.2,333.6,70,5,'MT3_QUERENCIA'],[296.2,338.6,35,5,'MT4'],[331.2,338.6,70,5,'MT1'],[401.2,338.6,70,5,'MT3_QUERENCIA'],[296.2,343.6,40,5,'MT4'],[336.2,343.6,60,5,'MT1'],[396.2,343.6,75,5,'MT3_QUERENCIA'],[296.2,348.6,40,5,'MT4'],[336.2,348.6,60,5,'MT1'],[396.2,348.6,40,5,'MT3_QUERENCIA'],[436.2,348.6,10,5,'MT2'],[446.2,348.6,25,5,'MT3_QUERENCIA'],[296.2,353.6,45,5,'MT4'],[341.2,353.6,55,5,'MT1'],[396.2,353.6,35,5,'MT3_QUERENCIA'],[431.2,353.6,20,5,'MT2'],[451.2,353.6,20,5,'MT3_CONFRESA'],[296.2,358.6,40,5,'MT4'],[336.2,358.6,65,5,'MT1'],[401.2,358.6,30,5,'MT3_QUERENCIA'],[431.2,358.6,20,5,'MT2'],[451.2,358.6,20,5,'MT3_CONFRESA'],[291.2,363.6,45,5,'MT4'],[336.2,363.6,75,5,'MT1'],[411.2,363.6,20,5,'MT3_QUERENCIA'],[431.2,363.6,15,5,'MT2'],[446.2,363.6,25,5,'MT3_CONFRESA'],[286.2,368.6,55,5,'MT4'],[341.2,368.6,75,5,'MT1'],[416.2,368.6,35,5,'MT3_QUERENCIA'],[451.2,368.6,25,5,'MT3_CONFRESA'],[286.2,373.6,60,5,'MT4'],[346.2,373.6,35,5,'MT1'],[381.2,373.6,5,5,'MT2'],[386.2,373.6,30,5,'MT1'],[416.2,373.6,10,5,'MT2'],[426.2,373.6,30,5,'MT3_QUERENCIA'],[456.2,373.6,15,5,'MT3_CONFRESA'],[281.2,378.6,75,5,'MT4'],[356.2,378.6,15,5,'MT1'],[371.2,378.6,20,5,'MT2'],[391.2,378.6,20,5,'MT1'],[411.2,378.6,15,5,'MT2'],[426.2,378.6,30,5,'MT3_QUERENCIA'],[456.2,378.6,15,5,'MT3_CONFRESA'],[281.2,383.6,55,5,'MT4'],[336.2,383.6,25,5,'MT1'],[361.2,383.6,30,5,'MT2'],[391.2,383.6,15,5,'MT1'],[406.2,383.6,25,5,'MT2'],[431.2,383.6,25,5,'MT3_QUERENCIA'],[456.2,383.6,15,5,'MT3_CONFRESA'],[281.2,388.6,55,5,'MT4'],[336.2,388.6,5,5,'MT2'],[341.2,388.6,20,5,'MT1'],[361.2,388.6,30,5,'MT2'],[391.2,388.6,10,5,'MT1'],[401.2,388.6,30,5,'MT2'],[431.2,388.6,20,5,'MT3_QUERENCIA'],[451.2,388.6,20,5,'MT3_CONFRESA'],[286.2,393.6,45,5,'MT4'],[331.2,393.6,20,5,'MT2'],[351.2,393.6,10,5,'MT1'],[361.2,393.6,70,5,'MT2'],[431.2,393.6,35,5,'MT3_CONFRESA'],[286.2,398.6,40,5,'MT4'],[326.2,398.6,25,5,'MT2'],[351.2,398.6,10,5,'MT1'],[361.2,398.6,70,5,'MT2'],[431.2,398.6,25,5,'MT3_CONFRESA'],[456.2,398.6,10,5,'MT3_QUERENCIA'],[286.2,403.6,40,5,'MT4'],[326.2,403.6,15,5,'MT2'],[341.2,403.6,20,5,'MT1'],[361.2,403.6,75,5,'MT2'],[436.2,403.6,10,5,'MT3_CONFRESA'],[446.2,403.6,20,5,'MT3_QUERENCIA'],[286.2,408.6,40,5,'MT4'],[326.2,408.6,20,5,'MT2'],[346.2,408.6,15,5,'MT1'],[361.2,408.6,80,5,'MT2'],[441.2,408.6,25,5,'MT3_QUERENCIA'],[281.2,413.6,40,5,'MT4'],[321.2,413.6,35,5,'MT2'],[356.2,413.6,5,5,'MT1'],[361.2,413.6,80,5,'MT2'],[441.2,413.6,10,5,'MT3_QUERENCIA'],[286.2,418.6,30,5,'MT4'],[316.2,418.6,65,5,'MT2'],[381.2,418.6,10,5,'MT1'],[391.2,418.6,55,5,'MT2'],[446.2,418.6,5,5,'MT3_QUERENCIA'],[286.2,423.6,25,5,'MT4'],[311.2,423.6,65,5,'MT2'],[376.2,423.6,10,5,'MT1'],[386.2,423.6,60,5,'MT2'],[446.2,423.6,5,5,'MT3_QUERENCIA'],[286.2,428.6,25,5,'MT4'],[311.2,428.6,60,5,'MT2'],[371.2,428.6,10,5,'MT1'],[381.2,428.6,60,5,'MT2'],[286.2,433.6,20,5,'MT4'],[306.2,433.6,60,5,'MT2'],[366.2,433.6,5,5,'MT1'],[371.2,433.6,65,5,'MT2'],[326.2,438.6,105,5,'MT2'],[326.2,443.6,100,5,'MT2'],[326.2,448.6,100,5,'MT2'],[326.2,453.6,35,5,'MT2'],[371.2,453.6,40,5,'MT2'],[416.2,453.6,10,5,'MT2'],[331.2,458.6,20,5,'MT2'],[381.2,458.6,25,5,'MT2'],[416.2,458.6,5,5,'MT2'],[336.2,463.6,10,5,'MT2'],[411.2,463.6,10,5,'MT2']
  ],
  PR: [
    [421.3,559.6,20,5,'PR_MARINGA'],[416.3,564.6,40,5,'PR_MARINGA'],[456.3,564.6,20,5,'PR_LONDRINA'],[411.3,569.6,50,5,'PR_MARINGA'],[461.3,569.6,15,5,'PR_LONDRINA'],[476.3,569.6,5,5,'PR_CASCAVEL'],[481.3,569.6,10,5,'PR_LONDRINA'],[406.3,574.6,20,5,'PR_CASCAVEL'],[426.3,574.6,30,5,'PR_MARINGA'],[456.3,574.6,35,5,'PR_LONDRINA'],[406.3,579.6,20,5,'PR_CASCAVEL'],[426.3,579.6,45,5,'PR_MARINGA'],[471.3,579.6,20,5,'PR_LONDRINA'],[491.3,579.6,5,5,'PR_CASCAVEL'],[401.3,584.6,40,5,'PR_CASCAVEL'],[441.3,584.6,30,5,'PR_MARINGA'],[471.3,584.6,5,5,'PR_LONDRINA'],[476.3,584.6,10,5,'PR_PONTA_GROSSA'],[486.3,584.6,10,5,'PR_LONDRINA'],[401.3,589.6,45,5,'PR_CASCAVEL'],[446.3,589.6,30,5,'PR_MARINGA'],[476.3,589.6,15,5,'PR_PONTA_GROSSA'],[491.3,589.6,5,5,'PR_LONDRINA'],[401.3,594.6,50,5,'PR_CASCAVEL'],[451.3,594.6,20,5,'PR_MARINGA'],[471.3,594.6,25,5,'PR_PONTA_GROSSA'],[496.3,594.6,5,5,'PR_LONDRINA'],[401.3,599.6,55,5,'PR_CASCAVEL'],[456.3,599.6,10,5,'PR_MARINGA'],[466.3,599.6,10,5,'PR_CASCAVEL'],[476.3,599.6,25,5,'PR_PONTA_GROSSA'],[501.3,599.6,5,5,'PR_LONDRINA'],[396.3,604.6,70,5,'PR_CASCAVEL'],[466.3,604.6,45,5,'PR_PONTA_GROSSA'],[511.3,604.6,5,5,'PR_CASCAVEL'],[396.3,609.6,70,5,'PR_CASCAVEL'],[466.3,609.6,45,5,'PR_PONTA_GROSSA'],[511.3,609.6,10,5,'PR_CASCAVEL'],[396.3,614.6,70,5,'PR_CASCAVEL'],[466.3,614.6,45,5,'PR_PONTA_GROSSA'],[511.3,614.6,10,5,'PR_CASCAVEL'],[411.3,619.6,55,5,'PR_CASCAVEL'],[466.3,619.6,45,5,'PR_PONTA_GROSSA'],[511.3,619.6,5,5,'PR_CASCAVEL'],[411.3,624.6,60,5,'PR_CASCAVEL'],[491.3,624.6,10,5,'PR_PONTA_GROSSA'],[421.3,629.6,40,5,'PR_CASCAVEL'],[451.3,634.6,10,5,'PR_CASCAVEL']
  ],
};

// Posição do rótulo (%) de cada coordenação = centroide (ponderado por
// área) das células do mosaico daquela coordenação.
const LABEL_POS = {
  MT1: { x: 365, y: 342.6 },
  MT4: { x: 303.8, y: 358.6 },
  MT3_CONFRESA: { x: 454, y: 359.7 },
  MT3_QUERENCIA: { x: 437.6, y: 354.2 },
  MT2: { x: 383.4, y: 421.2 },
  PR_MARINGA: { x: 446.2, y: 579.6 },
  PR_LONDRINA: { x: 478.4, y: 578.8 },
  PR_CASCAVEL: { x: 436.5, y: 608.5 },
  PR_PONTA_GROSSA: { x: 488, y: 609.9 },
};

const SEGMENT_BY_ALIAS = new Map();
for (const [key, region] of Object.entries(REGIONS)) {
  for (const alias of region.aliases) {
    SEGMENT_BY_ALIAS.set(normalizeStr(alias), key);
  }
}

let cachedRegionalData = null;
let cachedRegionalDataAt = 0;
let pendingLoad = null;
let pendingApply = false;

function normalizeStr(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
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
    .db-state-svg .db-regional-overlay text,
    .db-state-svg .db-regional-overlay rect {
      transition: all .25s ease;
    }

    @media(max-width: 700px) {
      .db-map-mode-toggle { width: 100%; justify-content: space-between; }
      .db-map-mode-btn { flex: 1; }
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
      fill: 'rgba(255,255,255,.055)',
      stroke: 'rgba(255,255,255,.12)',
      text: 'rgba(255,255,255,.78)',
    };
  }

  if (info.onTrack || pct >= 100) {
    const alpha = (0.30 + (pct / 100) * 0.42).toFixed(2);
    return {
      fill: `rgba(0,200,122,${alpha})`,
      stroke: 'rgba(45,212,160,.76)',
      text: 'rgba(238,255,246,.96)',
    };
  }

  const alpha = (0.27 + (pct / 100) * 0.34).toFixed(2);
  return {
    fill: `rgba(253,230,138,${alpha})`,
    stroke: 'rgba(253,230,138,.70)',
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
      Object.keys(REGIONS).map((key) => [key, {
        key,
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

function createRegionalLabel(key, uf, info, palette) {
  const hasData = !!info && (Number(info.meta) > 0 || Number(info.produzido) > 0);
  if (!hasData) return '';

  const pos = LABEL_POS[key];
  if (!pos) return '';

  const fontSize = uf === 'PR' ? 12 : 18;
  const strokeWidth = uf === 'PR' ? 4 : 6;

  return `
    <text
      x="${pos.x}"
      y="${pos.y}"
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
      fill="rgba(13,13,24,.96)"
      stroke="rgba(255,255,255,.11)"
      stroke-width="1"
      stroke-linejoin="round"
    />
  `).join('');

  const mosaics = ['MT', 'PR'].map((uf) => {
    // Agrupa as células do mosaico por coordenação para poder colocar
    // um único <title> (tooltip) por região sobre o conjunto de retângulos.
    const byKey = {};
    for (const [x, y, w, h, key] of MOSAIC[uf]) {
      (byKey[key] ||= []).push([x, y, w, h]);
    }

    const groups = Object.entries(byKey).map(([key, cells]) => {
      const region = REGIONS[key];
      const info = data.segments[key];
      const palette = getPalette(info);
      const rects = cells.map(([x, y, w, h]) => `
        <rect x="${x}" y="${y}" width="${w}" height="${h}"
          fill="${palette.fill}" stroke="${palette.fill}" stroke-width="0.6" />
      `).join('');

      return `
        <g class="db-regional-segment">
          <title>${region?.name || key} — ${fmtPct(info?.pct || 0)}</title>
          ${rects}
        </g>
        ${createRegionalLabel(key, uf, info, palette)}
      `;
    }).join('');

    return `<g clip-path="url(#dbRegionalClip${uf})">${groups}</g>`;
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
      ${mosaics}
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
