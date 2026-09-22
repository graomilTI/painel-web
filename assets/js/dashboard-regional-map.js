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

// Contorno real de cada coordenação: diagrama de Voronoi (vizinho mais
// próximo) das 331 cidades reais de MT/PR em operacional_pontos_embarque,
// recortado no contorno exato do estado e com as células da mesma
// coordenação unidas num polígono só (arestas internas compartilhadas
// canceladas). Arestas retas como as do STATE_PATHS — nada de grade/pixel.
// Um valor pode ter mais de um subpolígono (ex.: MT3_CONFRESA/QUERENCIA
// têm um 2º bloco genuíno, pois têm poucas cidades e ficam espalhadas).
const REGION_PATHS = {
  MT4: 'M290.42,366.88L294.39,360.23L294.40,357.68L294.54,335.78L294.54,335.13L293.80,335.12L284.36,326.68L304.63,344.81L294.54,335.78L293.80,335.12L261.17,334.75L261.20,326.45L261.29,300.77L261.32,292.49L276.02,292.38L288.06,292.29L305.35,292.17L320.82,278.99L300.14,296.59L305.35,292.17L322.05,292.04L323.92,280.94L325.28,281.79L324.04,304.32L304.66,312.05L320.73,326.44L320.17,331.93L329.39,337.18L340.12,355.77L338.33,357.90L337.71,369.90L356.86,381.71L346.01,385.30L334.66,381.21L334.32,390.13L326.87,402.85L325.45,410.04L304.37,437.10L289.54,437.13L287.93,437.13L287.70,422.31L280.10,413.84L286.48,414.14L286.10,404.77L283.59,393.50L278.20,387.30L282.98,379.31L290.42,366.88Z',
  MT1: 'M404.31,333.60L396.75,349.11L395.89,355.98L417.54,373.13L398.24,395.00L393.65,395.11L386.31,372.17L363.00,385.29L363.39,393.95L360.53,397.85L361.91,420.12L361.44,421.57L339.57,405.19L352.99,399.75L340.59,389.09L334.32,390.13L334.66,381.21L346.01,385.30L356.86,381.71L337.71,369.90L338.33,357.90L340.12,355.77L329.39,337.18L320.17,331.93L320.73,326.44L304.66,312.05L324.04,304.32L325.28,281.79L323.92,280.94L326.84,263.61L337.99,280.08L352.74,301.89L354.00,303.75L354.21,304.06L358.68,304.36L373.38,305.34L385.26,306.13L414.09,308.06L419.56,320.23L417.81,323.65L404.31,333.60Z',
  MT3_QUERENCIA: 'M476.27,327.18L471.54,341.88L471.03,343.45L472.27,354.23L451.93,356.18L441.70,349.02L436.01,348.50L427.29,370.71L447.63,366.38L458.02,381.11L456.73,385.37L457.54,389.06L433.65,395.46L427.00,376.66L424.28,374.02L420.69,374.15L417.54,373.13L395.89,355.98L396.75,349.11L404.31,333.60L417.81,323.65L419.56,320.23L436.36,315.17L442.41,316.52L446.94,315.27L473.38,323.00L476.27,327.18Z M466.72,400.92L464.04,412.25L454.00,413.92L449.75,428.43L449.10,428.54L441.74,417.65L441.91,409.86L462.27,398.25L466.72,400.92Z',
  MT2: 'M432.49,403.31L441.91,409.86L441.74,417.65L449.10,428.54L441.31,429.79L438.79,433.02L428.40,446.30L426.94,448.17L422.73,462.27L422.31,463.67L425.50,470.62L406.42,470.70L413.72,463.82L413.73,462.68L413.80,454.97L407.31,461.73L405.66,463.44L386.28,463.89L372.79,456.24L371.56,455.54L369.63,454.44L355.50,457.77L340.85,468.89L340.37,469.26L323.88,456.48L323.88,437.05L304.37,437.10L325.45,410.04L326.87,402.85L334.32,390.13L340.59,389.09L352.99,399.75L339.57,405.19L361.44,421.57L361.91,420.12L360.53,397.85L363.39,393.95L363.00,385.29L386.31,372.17L393.65,395.11L398.24,395.00L417.54,373.13L420.69,374.15L424.28,374.02L427.00,376.66L433.65,395.46L432.49,403.31Z',
  MT3_CONFRESA: 'M473.35,363.53L474.07,369.84L466.72,400.92L462.27,398.25L441.91,409.86L432.49,403.31L433.65,395.46L457.54,389.06L456.73,385.37L458.02,381.11L447.63,366.38L451.93,356.18L472.27,354.23L473.35,363.53Z M437.94,309.65L452.92,310.65L472.80,311.99L480.99,312.53L476.27,327.18L473.38,323.00L446.94,315.27L442.41,316.52L436.36,315.17L419.56,320.23L414.09,308.06L437.94,309.65Z',
  PR_CASCAVEL: 'M433.86,586.18L437.98,583.26L439.17,583.78L439.54,587.54L444.04,588.83L444.28,589.15L444.35,590.12L446.61,592.51L448.77,593.06L450.56,598.49L450.39,599.59L458.11,601.92L458.13,602.00L460.92,604.83L465.71,606.89L464.38,611.63L468.17,622.72L468.56,622.70L475.32,625.47L475.83,626.35L473.99,626.37L471.33,630.23L460.92,631.66L460.84,631.67L460.75,631.90L459.67,633.55L465.70,624.44L460.92,631.66L460.75,631.90L459.87,634.40L458.56,638.09L444.58,635.80L438.68,634.84L435.27,634.27L432.95,633.89L430.30,633.46L430.28,633.46L425.39,632.66L422.98,632.26L416.21,631.15L415.37,631.02L414.71,630.91L413.75,629.00L413.36,628.20L411.73,624.94L411.10,623.69L410.18,621.85L408.70,618.89L406.89,618.75L401.35,618.35L399.16,618.19L396.31,617.98L397.06,614.56L397.44,612.85L398.53,607.85L399.32,604.23L400.31,599.72L401.70,593.33L402.93,587.74L404.33,584.88L404.62,584.28L408.63,576.09L409.02,575.55L415.25,577.42L421.18,575.89L426.36,576.77L426.68,577.29L427.11,581.78L430.61,585.74L432.10,586.25L433.86,586.18Z',
  PR_MARINGA: 'M458.44,577.26L463.65,578.83L464.65,577.98L467.32,578.29L468.93,578.11L469.56,578.22L470.46,579.16L471.45,581.68L471.29,586.97L475.99,588.68L476.95,591.37L471.79,597.33L468.38,597.77L468.06,598.09L467.13,605.21L465.90,606.77L465.71,606.89L460.92,604.83L458.13,602.00L458.11,601.92L450.39,599.59L450.56,598.49L448.77,593.06L446.61,592.51L444.35,590.12L444.28,589.15L444.04,588.83L439.54,587.54L439.17,583.78L437.98,583.26L433.86,586.18L432.10,586.25L430.61,585.74L427.11,581.78L426.68,577.29L426.36,576.77L421.18,575.89L415.25,577.42L409.02,575.55L415.70,566.34L416.56,565.74L421.76,562.08L425.27,559.61L436.61,561.22L450.82,563.23L450.76,563.48L451.83,564.82L454.02,566.04L455.90,568.07L455.50,569.78L456.39,570.83L460.06,572.62L459.96,572.89L460.13,574.62L458.44,577.26Z',
  PR_LONDRINA: 'M469.56,578.22L468.93,578.11L467.32,578.29L464.65,577.98L463.65,578.83L458.44,577.26L460.13,574.62L459.96,572.89L460.06,572.62L456.39,570.83L455.50,569.78L455.90,568.07L454.02,566.04L451.83,564.82L450.76,563.48L450.82,563.23L456.43,564.01L459.45,564.45L459.22,566.47L463.06,567.80L464.13,566.17L463.61,565.03L466.79,565.49L472.33,566.27L474.92,566.63L478.85,567.19L481.30,567.53L485.19,568.09L488.36,568.53L489.95,568.76L490.66,570.67L491.77,573.67L492.39,575.36L494.23,580.30L491.24,581.43L489.86,583.36L491.21,588.57L495.50,583.76L497.35,588.74L497.52,589.21L497.98,590.42L500.82,598.10L510.58,603.59L504.99,604.47L494.68,595.28L491.85,594.35L490.40,589.63L486.44,589.50L482.25,583.85L480.60,584.17L475.99,588.68L471.29,586.97L471.45,581.68L470.46,579.16L469.56,578.22Z',
  PR_PONTA_GROSSA: 'M476.37,604.85L478.63,602.90L478.26,601.67L471.79,597.33L476.95,591.37L475.99,588.68L480.60,584.17L482.25,583.85L486.44,589.50L490.40,589.63L491.85,594.35L494.68,595.28L504.99,604.47L510.58,603.59L513.55,605.25L512.37,625.47L511.17,625.47L501.43,625.47L496.99,628.32L494.59,629.85L489.90,627.54L487.22,626.22L475.83,626.35L475.32,625.47L468.56,622.70L468.17,622.72L464.38,611.63L465.71,606.89L465.90,606.77L467.13,605.21L476.37,604.85Z',
};

// Posição do rótulo (%) de cada coordenação = centroide da maior peça do
// polígono acima.
const LABEL_POS = {
  MT4: { x: 303.3, y: 357.4 },
  MT1: { x: 364.2, y: 340.6 },
  MT3_QUERENCIA: { x: 436.4, y: 348.2 },
  MT2: { x: 381.6, y: 424.2 },
  MT3_CONFRESA: { x: 457.5, y: 381.4 },
  PR_CASCAVEL: { x: 431.9, y: 609.2 },
  PR_MARINGA: { x: 446, y: 579.9 },
  PR_LONDRINA: { x: 479.2, y: 578.4 },
  PR_PONTA_GROSSA: { x: 489, y: 610.5 },
};

// Bbox real de cada estado dentro do viewBox 800x796 do mapa do Brasil
// (calculado a partir dos vértices de STATE_PATHS).
const STATE_BBOX = {
  MT: { minX: 261.17, minY: 263.61, w: 219.82, h: 207.09 },
  PR: { minX: 396.31, minY: 559.61, w: 127.39, h: 78.48 },
};

// Ponto de "foco da lupa" em cada estado no mapa do Brasil inteiro: o
// centro vertical do lado que encosta na caixa de zoom (borda oeste de
// MT, que aponta pra esquerda; borda leste de PR, pra direita).
const ZOOM_ANCHOR = {
  MT: { x: 261.17, y: 367.16 },
  PR: { x: 523.70, y: 598.85 },
};

// O viewBox do mapa do Brasil (originalmente "0 0 800 796") ganha uma
// faixa extra dos DOIS LADOS — não embaixo — pra caber as caixas de zoom
// de MT/PR ao lado do mapa, do jeito pedido. As coordenadas do mapa em si
// (STATE_PATHS, REGION_PATHS, 0-800) não mudam nada: só o min-x e a
// largura do viewBox mudam, abrindo espaço nas laterais sem deslocar
// nenhum path existente. Tudo no MESMO <svg>, um só sistema de
// coordenadas, sem precisar medir pixel de elementos diferentes em
// runtime (foi isso que causou os bugs das tentativas anteriores com
// painéis HTML separados: mapa encolhido demais, cone esticando errado).
// Alargar o viewBox encolhe TUDO proporcionalmente (o mapa e os % que já
// existiam nele). Painéis maiores (pedido do usuário) do que a primeira
// versão — mapa fica um pouco menor em troca, mas ainda bem maior que a
// tentativa original com painéis HTML.
const OVERLAY_VIEWBOX = { x: -210, y: 0, w: 1220, h: 796 };
// y mais baixo que o centro vertical do mapa (398) pra encaixar a caixa
// na reentrância/curva do contorno de MT e PR (pedido do usuário: "ocupar
// a curva do Brasil" em vez de ficar reto no meio da lateral).
const ZOOM_BOX = {
  MT: { x: -210, y: 380, w: 210, h: 280 },
  PR: { x: 800, y: 380, w: 210, h: 280 },
};

function zoomTransform(uf) {
  const bbox = STATE_BBOX[uf];
  const box = ZOOM_BOX[uf];
  const scale = Math.min(box.w / bbox.w, box.h / bbox.h);
  const bboxCenterX = bbox.minX + bbox.w / 2;
  const bboxCenterY = bbox.minY + bbox.h / 2;
  const boxCenterX = box.x + box.w / 2;
  const boxCenterY = box.y + box.h / 2;
  return {
    scale,
    tx: boxCenterX - bboxCenterX * scale,
    ty: boxCenterY - bboxCenterY * scale,
  };
}

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

    /* Tudo (mapa + destaque + caixas de zoom de MT/PR) é desenhado dentro
       do mesmo <svg> do mapa do Brasil (viewBox esticado pros lados) —
       não precisa de layout flex/grid próprio nem medir pixel em runtime.
       Isso evitou os bugs das versões anteriores (painéis HTML ao lado
       encolhendo o mapa; cone esticando pela altura da grid pai). */
    .db-state-svg .db-regional-highlight path,
    .db-state-svg .db-regional-zoom-box path {
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

    // .db-section-head usa justify-content:space-between esperando 2
    // filhos (grupo do período à esquerda, botão "Atualizar" à direita).
    // Um appendChild simples criava um 3º filho e o space-between
    // empurrava o botão de atualizar pro meio do cabeçalho — agrupa os
    // dois num wrapper só em vez de soltar o toggle como filho direto.
    const lastChild = head.lastElementChild;
    if (lastChild) {
      const rightGroup = document.createElement('div');
      rightGroup.style.cssText = 'display:flex;align-items:center;gap:10px';
      head.insertBefore(rightGroup, lastChild);
      rightGroup.appendChild(lastChild);
      rightGroup.appendChild(wrap);
    } else {
      head.appendChild(wrap);
    }

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
  // Restaura o viewBox original (a versão regional estica ele pros
  // lados pra caber as caixas de zoom de MT/PR).
  if (svg.dataset.dbOriginalViewBox) {
    svg.setAttribute('viewBox', svg.dataset.dbOriginalViewBox);
  }
}

function createRegionalLabel(key, pos, info, palette, fontSize = 20) {
  const hasData = !!info && (Number(info.meta) > 0 || Number(info.produzido) > 0);
  if (!hasData || !pos) return '';

  const strokeWidth = Math.max(1.5, +(fontSize / 6.5).toFixed(1));

  return `
    <text
      x="${pos.x}"
      y="${pos.y}"
      text-anchor="middle"
      dominant-baseline="central"
      style="
        font-size:${fontSize}px;
        font-weight:800;
        letter-spacing:-.02em;
        fill:${palette.text};
        paint-order:stroke fill;
        stroke:rgba(0,0,0,.85);
        stroke-width:${strokeWidth}px;
        stroke-linejoin:round;
      "
    >${fmtPct(info.pct)}</text>
  `;
}

// Destaque discreto de MT/PR no mapa do Brasil inteiro (tamanho normal,
// sem encolher) sinalizando que a divisão por coordenação está ampliada
// na caixa de zoom logo abaixo — sem repetir o mosaico em cima do
// estadinho minúsculo (era isso que "manchava" nas tentativas anteriores).
function createStateHighlight() {
  const paths = ['MT', 'PR'].map((uf) => `
    <path
      d="${STATE_PATHS[uf]}"
      fill="rgba(110,231,183,.10)"
      stroke="rgba(110,231,183,.85)"
      stroke-width="1.6"
      stroke-dasharray="4 3"
      stroke-linejoin="round"
    />
    <circle cx="${ZOOM_ANCHOR[uf].x}" cy="${ZOOM_ANCHOR[uf].y}" r="6" fill="rgba(110,231,183,.95)" />
    <circle cx="${ZOOM_ANCHOR[uf].x}" cy="${ZOOM_ANCHOR[uf].y}" r="12" fill="none" stroke="rgba(110,231,183,.35)" stroke-width="2" />
  `).join('');

  return `<g class="db-regional-highlight">${paths}</g>`;
}

// Caixa de zoom de um estado: os polígonos de REGION_PATHS reaproveitados
// tal como são (mesmas coordenadas do mapa grande), só que envoltos num
// <g transform="translate(...) scale(...)"> que os reposiciona/redimensiona
// pra dentro de ZOOM_BOX[uf] — sem duplicar geometria, sem medir pixel em
// runtime. vector-effect="non-scaling-stroke" mantém o traço fino e
// constante mesmo com a escala diferente de cada estado.
function createZoomBox(uf, data) {
  const box = ZOOM_BOX[uf];
  const t = zoomTransform(uf);
  const transform = `translate(${t.tx.toFixed(2)},${t.ty.toFixed(2)}) scale(${t.scale.toFixed(4)})`;
  const clipId = `dbZoomClip${uf}`;

  let regionsHtml = '';
  let labelsHtml = '';
  for (const [key, region] of Object.entries(REGIONS)) {
    if (region.state !== uf) continue;
    const d = REGION_PATHS[key];
    if (!d) continue;
    const info = data.segments[key];
    const palette = getPalette(info);

    regionsHtml += `
      <path
        d="${d}"
        fill="${palette.fill}"
        stroke="rgba(255,255,255,.30)"
        stroke-width="1"
        stroke-linejoin="round"
        vector-effect="non-scaling-stroke"
      >
        <title>${region.name} — ${fmtPct(info?.pct || 0)}</title>
      </path>
    `;

    // Rótulo fora do <g transform>, já na coordenada final da tela — um
    // texto dentro do clip/transform pode ser cortado sem aviso quando o
    // centroide da região cai perto de uma reentrância da borda.
    const pos = LABEL_POS[key];
    const hasData = !!info && (Number(info.meta) > 0 || Number(info.produzido) > 0);
    if (pos && hasData) {
      labelsHtml += createRegionalLabel(
        key,
        { x: pos.x * t.scale + t.tx, y: pos.y * t.scale + t.ty },
        info,
        palette,
        uf === 'PR' ? 14 : 15
      );
    }
  }

  const title = uf === 'MT' ? 'Mato Grosso' : 'Paraná';
  // As linhas conectam no lado da caixa que encosta no mapa: a borda
  // direita da caixa de MT (que fica à esquerda do mapa) e a borda
  // esquerda da caixa de PR (que fica à direita).
  const nearX = uf === 'MT' ? box.x + box.w : box.x;

  return `
    <g class="db-regional-zoom-box" data-uf="${uf}">
      <line x1="${ZOOM_ANCHOR[uf].x}" y1="${ZOOM_ANCHOR[uf].y}" x2="${nearX}" y2="${box.y}" stroke="rgba(110,231,183,.45)" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="${ZOOM_ANCHOR[uf].x}" y1="${ZOOM_ANCHOR[uf].y}" x2="${nearX}" y2="${box.y + box.h}" stroke="rgba(110,231,183,.45)" stroke-width="1.5" stroke-linecap="round"/>
      <text x="${box.x + box.w / 2}" y="${box.y - 10}" text-anchor="middle" style="font-size:13px;font-weight:950;letter-spacing:.08em;text-transform:uppercase;fill:#94a3b8;">${title}</text>
      <!-- O clip-path NÃO leva o transform aqui: o <g> logo abaixo já tem
           esse mesmo transform, e clipPathUnits="userSpaceOnUse" (padrão)
           já avalia o clip no espaço de coordenadas de quem o referencia.
           Aplicar dos dois lados dobrava o transform e descasava o recorte
           da geometria real — era por isso que o preenchimento das
           coordenações sumia (ficava tudo recortado fora). -->
      <defs>
        <clipPath id="${clipId}"><path d="${STATE_PATHS[uf]}"/></clipPath>
      </defs>
      <path d="${STATE_PATHS[uf]}" transform="${transform}" fill="rgba(13,13,24,.96)" stroke="rgba(255,255,255,.14)" vector-effect="non-scaling-stroke"/>
      <g clip-path="url(#${clipId})" transform="${transform}">${regionsHtml}</g>
      <path d="${STATE_PATHS[uf]}" transform="${transform}" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="1.3" vector-effect="non-scaling-stroke"/>
      ${labelsHtml}
    </g>
  `;
}

function createRegionalOverlay(data) {
  const highlight = createStateHighlight();
  const zoomBoxes = Object.keys(ZOOM_BOX).map((uf) => createZoomBox(uf, data)).join('');
  return `<g class="db-regional-overlay">${highlight}${zoomBoxes}</g>`;
}

async function applyMapMode() {
  ensureStyles();
  ensureToggle();

  // dashboard.js renderiza o mapa dentro de .db-prod-center (a classe
  // .db-prod-left só existe no painel do gestor-app.js, que nem importa
  // este módulo) — era por isso que a sobreposição regional nunca prendia.
  const svg = document.querySelector('.db-prod-center .db-state-svg');
  if (!isMasterBrazilMap(svg)) return;

  removeRegionalOverlay(svg);

  const mode = getCurrentMode();
  if (mode !== 'regional') return;

  try {
    const data = await loadRegionalData();

    // dashboard.js pode re-renderizar .db-prod-center enquanto os dados
    // carregam (await acima); se isso trocou o <svg> por um novo, o que
    // capturamos no início já não está mais na página — inserir nele não
    // dá erro nenhum, só fica invisível pra sempre. A próxima mutação já
    // dispara scheduleApply() de novo pro <svg> atual.
    if (!svg.isConnected) return;

    if (!svg.dataset.dbOriginalViewBox) {
      svg.dataset.dbOriginalViewBox = svg.getAttribute('viewBox') || '0 0 800 796';
    }
    svg.setAttribute('viewBox', `${OVERLAY_VIEWBOX.x} ${OVERLAY_VIEWBOX.y} ${OVERLAY_VIEWBOX.w} ${OVERLAY_VIEWBOX.h}`);
    svg.insertAdjacentHTML('beforeend', createRegionalOverlay(data));
  } catch (error) {
    console.warn('[dashboard-regional-map] erro ao aplicar modo regional:', error?.message || error);
  }
}

function scheduleApply() {
  if (pendingApply) return;
  pendingApply = true;

  // setTimeout, não requestAnimationFrame: rAF fica suspenso em abas sem
  // foco/não visíveis (o Chrome joga a prioridade lá embaixo pra
  // economizar recurso) — era por isso que a sobreposição regional só
  // aparecia depois de um clique manual no toggle (o clique "acordava" a
  // aba o suficiente pra 1 frame rodar), nunca sozinha em segundo plano.
  // Confirmado ao vivo: com rAF, nenhuma das 3 chamadas automáticas do
  // carregamento da página chegava a rodar o callback.
  setTimeout(async () => {
    pendingApply = false;
    await applyMapMode();
  }, 0);
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
