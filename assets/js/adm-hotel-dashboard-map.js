const MAP_VERSION = '20260817-real-map2';
const BRAZIL_MAP_MODULE = 'https://cdn.jsdelivr.net/npm/brazil-map@1.1.8/dist/brazil-map.es.min.js';

let componentPromise = null;
function ensureBrazilMapComponent() {
  if (customElements.get('brazil-component')) return Promise.resolve(true);
  if (!componentPromise) {
    componentPromise = import(BRAZIL_MAP_MODULE)
      .then(() => customElements.whenDefined('brazil-component'))
      .then(() => true)
      .catch((error) => {
        console.error('[hosp-dashboard-map] Falha ao carregar mapa SVG do Brasil', error);
        return false;
      });
  }
  return componentPromise;
}

function injectStyles() {
  if (document.getElementById('hospRdRealMapStyle')) return;
  const style = document.createElement('style');
  style.id = 'hospRdRealMapStyle';
  style.textContent = `
    .hosp-rd-map-shell.hosp-rd-map-shell--real {
      min-height: 366px;
      height: 366px;
      padding: 0 10px 4px;
      display: grid;
      place-items: center;
      overflow: hidden;
    }
    .hosp-rd-real-map {
      width: 100%;
      height: 100%;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 120px;
      align-items: center;
      gap: 14px;
      position: relative;
    }
    .hosp-rd-real-map-stage {
      height: 330px;
      min-width: 0;
      display: grid;
      place-items: center;
      position: relative;
    }
    .hosp-rd-brazil-component {
      display: block;
      width: min(100%, 520px);
      height: 330px;
      --brazil-bg-color: #0d2b20;
      --brazil-bg-color-dark: #0d2b20;
      --brazil-bg-hover-color: #1b6a3d;
      --brazil-bg-hover-color-dark: #1b6a3d;
      --brazil-stroke-color: rgba(102, 190, 134, .28);
      --brazil-stroke-color-dark: rgba(102, 190, 134, .28);
      --brazil-stroke-hover-color: #8df2ae;
      --brazil-stroke-hover-color-dark: #8df2ae;
      --brazil-acronym-color: #79998a;
      --brazil-acronym-color-dark: #79998a;
      --brazil-acronym-hover-color: #effff5;
      --brazil-acronym-hover-color-dark: #effff5;
      filter: drop-shadow(0 18px 32px rgba(0,0,0,.25));
    }
    .hosp-rd-map-summary {
      align-self: stretch;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 6px;
      min-width: 0;
    }
    .hosp-rd-map-summary-title {
      margin-bottom: 2px;
      color: #718f81;
      font-size: 8.5px;
      font-weight: 900;
      letter-spacing: .06em;
      text-transform: uppercase;
    }
    .hosp-rd-map-state-chip {
      appearance: none;
      width: 100%;
      min-height: 30px;
      padding: 5px 8px;
      border: 1px solid rgba(74,222,128,.12);
      border-radius: 9px;
      background: rgba(8,34,24,.72);
      color: #a8c3b4;
      font: inherit;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      cursor: default;
      transition: .15s ease;
    }
    .hosp-rd-map-state-chip strong { color: #eafff1; font-size: 9.5px; }
    .hosp-rd-map-state-chip span {
      min-width: 22px;
      height: 20px;
      padding: 0 5px;
      display: inline-grid;
      place-items: center;
      border-radius: 999px;
      background: var(--chip-color, #1d6a3b);
      color: #f3fff7;
      font-size: 8px;
      font-weight: 950;
      box-shadow: 0 0 16px color-mix(in srgb, var(--chip-color, #1d6a3b) 28%, transparent);
    }
    .hosp-rd-map-state-chip:hover,
    .hosp-rd-map-state-chip.active {
      border-color: rgba(134,239,172,.34);
      background: rgba(16,63,40,.72);
      transform: translateX(-2px);
    }
    .hosp-rd-map-legend {
      position: absolute;
      left: 12px;
      bottom: 0;
      display: flex;
      align-items: center;
      gap: 7px;
      color: #6f9181;
      font-size: 8px;
      pointer-events: none;
    }
    .hosp-rd-map-legend-bar {
      width: 72px;
      height: 6px;
      border-radius: 999px;
      background: linear-gradient(90deg,#123d2b,#1d6b3e,#39bd62);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.04);
    }
    .hosp-rd-map-load-error {
      min-height: 290px;
      display: grid;
      place-items: center;
      color: #87a396;
      font-size: 11px;
      text-align: center;
    }
    @media (max-width: 1250px) {
      .hosp-rd-real-map { grid-template-columns: minmax(0,1fr) 105px; gap: 8px; }
      .hosp-rd-brazil-component { width: min(100%, 470px); }
    }
    @media (max-width: 1100px) {
      .hosp-rd-map-shell.hosp-rd-map-shell--real { min-height: 390px; height: 390px; }
      .hosp-rd-real-map-stage { height: 354px; }
      .hosp-rd-brazil-component { height: 350px; width: min(100%, 560px); }
    }
    @media (max-width: 720px) {
      .hosp-rd-map-shell.hosp-rd-map-shell--real { min-height: 350px; height: auto; padding: 0; }
      .hosp-rd-real-map { grid-template-columns: 1fr; gap: 6px; }
      .hosp-rd-real-map-stage { height: 290px; }
      .hosp-rd-brazil-component { width: min(100%, 430px); height: 290px; }
      .hosp-rd-map-summary { flex-direction: row; flex-wrap: wrap; justify-content: center; padding-bottom: 12px; }
      .hosp-rd-map-summary-title { width: 100%; text-align: center; }
      .hosp-rd-map-state-chip { width: auto; min-width: 54px; }
      .hosp-rd-map-legend { display: none; }
    }
  `;
  document.head.appendChild(style);
}

function readCounts(grid) {
  const counts = {};
  grid.querySelectorAll('.hosp-rd-state').forEach((node) => {
    const uf = (node.querySelector('b')?.textContent || '').trim().toUpperCase();
    if (!uf) return;
    counts[uf] = Number((node.querySelector('em')?.textContent || '0').replace(/[^0-9.-]/g, '')) || 0;
  });
  return counts;
}

function stateColor(value, max) {
  if (!value) return '#0d2b20';
  const ratio = value / Math.max(1, max);
  if (ratio <= .2) return '#16482f';
  if (ratio <= .4) return '#1a6038';
  if (ratio <= .6) return '#217b46';
  if (ratio <= .8) return '#2b9d55';
  return '#3bc567';
}

function stateHoverColor(value, max) {
  if (!value) return '#123426';
  const ratio = value / Math.max(1, max);
  if (ratio <= .4) return '#247847';
  if (ratio <= .8) return '#32a95c';
  return '#52df7c';
}

async function paintMap(component, counts, shell) {
  await component.updateComplete;
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const root = component.shadowRoot;
  if (!root) return;

  const max = Math.max(1, ...Object.values(counts));
  root.querySelectorAll("path[id^='BR-'].land").forEach((path) => {
    const uf = String(path.id || '').replace('BR-', '').toUpperCase();
    const value = Number(counts[uf] || 0);
    const normal = stateColor(value, max);
    const hover = stateHoverColor(value, max);

    path.style.setProperty('fill', normal, 'important');
    path.style.setProperty('stroke', value ? 'rgba(135,239,169,.58)' : 'rgba(96,165,121,.23)', 'important');
    path.style.setProperty('stroke-width', value ? '1.1' : '.65', 'important');
    path.style.setProperty('transition', 'fill .16s ease, stroke .16s ease, filter .16s ease', 'important');
    path.style.setProperty('cursor', value ? 'pointer' : 'default', 'important');
    path.setAttribute('title', `${uf}: ${value} hospedado${value === 1 ? '' : 's'}`);
    path.setAttribute('aria-label', `${uf}: ${value} hospedado${value === 1 ? '' : 's'}`);

    const activate = () => {
      path.style.setProperty('fill', hover, 'important');
      if (value) path.style.setProperty('filter', 'drop-shadow(0 2px 4px rgba(55,201,104,.28))', 'important');
      shell.querySelector(`[data-hosp-map-chip="${uf}"]`)?.classList.add('active');
    };
    const deactivate = () => {
      path.style.setProperty('fill', normal, 'important');
      path.style.removeProperty('filter');
      shell.querySelector(`[data-hosp-map-chip="${uf}"]`)?.classList.remove('active');
    };
    path.addEventListener('mouseenter', activate);
    path.addEventListener('mouseleave', deactivate);
  });

  root.querySelectorAll('text').forEach((text) => {
    const uf = String(text.textContent || '').trim().toUpperCase();
    const value = Number(counts[uf] || 0);
    text.style.setProperty('fill', value ? '#f1fff6' : '#789587', 'important');
    text.style.setProperty('font-weight', value ? '800' : '600', 'important');
    text.style.setProperty('pointer-events', 'none', 'important');
  });

  shell.querySelectorAll('[data-hosp-map-chip]').forEach((chip) => {
    const uf = chip.dataset.hospMapChip;
    const path = root.querySelector(`#BR-${uf}`);
    if (!path) return;
    chip.addEventListener('mouseenter', () => path.dispatchEvent(new Event('mouseenter')));
    chip.addEventListener('mouseleave', () => path.dispatchEvent(new Event('mouseleave')));
  });
}

async function renderRealMap(grid) {
  const shell = grid.closest('.hosp-rd-map-shell');
  if (!shell || shell.dataset.realMapVersion === MAP_VERSION) return;

  const counts = readCounts(grid);
  const max = Math.max(1, ...Object.values(counts));
  const activeStates = Object.entries(counts)
    .filter(([, value]) => Number(value) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]));

  shell.dataset.realMapVersion = MAP_VERSION;
  shell.classList.add('hosp-rd-map-shell--real');
  shell.innerHTML = `
    <div class="hosp-rd-real-map" data-version="${MAP_VERSION}">
      <div class="hosp-rd-real-map-stage">
        <brazil-component class="hosp-rd-brazil-component" static aria-label="Mapa real do Brasil com distribuição de colaboradores hospedados por estado"></brazil-component>
      </div>
      <div class="hosp-rd-map-summary">
        <div class="hosp-rd-map-summary-title">Hospedados por UF</div>
        ${activeStates.length ? activeStates.map(([uf, value]) => `<button type="button" class="hosp-rd-map-state-chip" data-hosp-map-chip="${uf}" style="--chip-color:${stateColor(Number(value), max)}" title="${uf}: ${value} hospedado${Number(value) === 1 ? '' : 's'}"><strong>${uf}</strong><span>${value}</span></button>`).join('') : '<span style="color:#708f80;font-size:9px">Sem hospedagens ativas</span>'}
      </div>
      <div class="hosp-rd-map-legend"><span>menor</span><span class="hosp-rd-map-legend-bar"></span><span>maior concentração</span></div>
    </div>`;

  const loaded = await ensureBrazilMapComponent();
  if (!loaded) {
    shell.innerHTML = '<div class="hosp-rd-map-load-error">Não foi possível carregar o mapa do Brasil.<br>Atualize a página para tentar novamente.</div>';
    return;
  }

  const component = shell.querySelector('brazil-component');
  if (component) paintMap(component, counts, shell);
}

function upgradeDashboardMap() {
  injectStyles();
  const panel = document.querySelector('#hospRdDashboard');
  if (!panel) return;
  const grid = panel.querySelector('.hosp-rd-map-grid');
  if (grid) renderRealMap(grid);
}

let queued = false;
function queueUpgrade() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    upgradeDashboardMap();
  });
}

const observer = new MutationObserver(queueUpgrade);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('hashchange', queueUpgrade);
window.addEventListener('load', queueUpgrade, { once: true });
document.addEventListener('DOMContentLoaded', queueUpgrade, { once: true });
queueUpgrade();
