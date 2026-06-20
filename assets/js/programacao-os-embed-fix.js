// Reforço do painel A de O.S. dentro da Programação do Gestor.
// Mantém o ajuste isolado para não interferir nas demais etapas.

let rendering = false;

function normalizePathTarget(path = '') {
  return String(path || '').replace(/^\/+/, '').replace(/\.html$/i, '');
}

function panelHref(path = '') {
  const target = normalizePathTarget(path);
  const host = String(window.location.hostname || '').toLowerCase();
  const currentPath = String(window.location.pathname || '');

  if (host === 'grao1000.com.br' || host === 'www.grao1000.com.br') {
    return target ? `/painel/${target}`.replace(/([^:]\/)\/+/g, '$1') : '/painel';
  }

  const useHtml = /\.html$/i.test(currentPath);
  const finalTarget = useHtml ? `${target}.html` : target;
  const base = currentPath.includes('/painel/') ? '/painel/' : './';
  return base === './' ? `./${finalTarget}` : `${base}${finalTarget}`.replace(/([^:]\/)\/+/g, '$1');
}

function osUrl() {
  const url = new URL(panelHref('os'), window.location.href);
  const sup = document.getElementById('progSup')?.value || '';
  const data = document.getElementById('progDataRef')?.value || '';
  url.searchParams.set('embedded', '1');
  url.searchParams.set('from', 'programacao');
  url.searchParams.set('_ts', String(Date.now()));
  if (sup) url.searchParams.set('supervisao', sup);
  if (data) url.searchParams.set('data', data);
  return url.pathname + url.search + url.hash;
}

function injectStyle() {
  if (document.getElementById('progOsEmbedFixStyle')) return;
  const style = document.createElement('style');
  style.id = 'progOsEmbedFixStyle';
  style.textContent = `
    .prog-os-embed-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:0 0 12px}
    .prog-os-embed-actions{display:flex;gap:8px;flex-wrap:wrap}
    .prog-os-embed-actions .btn{min-height:36px}
    .prog-os-embed-status{display:flex;align-items:center;gap:8px;color:#cbd5e1;font-size:12px;font-weight:800}
    .prog-os-embed-status::before{content:'';width:8px;height:8px;border-radius:999px;background:#fbbf24;box-shadow:0 0 0 4px rgba(251,191,36,.12)}
    .prog-os-embed-status.is-ok::before{background:#34d399;box-shadow:0 0 0 4px rgba(52,211,153,.12)}
    .prog-os-embed-frame-wrap{border:1px solid rgba(52,211,153,.16);border-radius:18px;overflow:hidden;background:rgba(2,6,23,.18)}
    .prog-os-embed-frame-wrap iframe{width:100%;min-height:980px;border:0;background:transparent;display:block}
    @media(max-width:640px){.prog-os-embed-frame-wrap iframe{min-height:1160px}.prog-os-embed-actions,.prog-os-embed-actions .btn{width:100%}.prog-os-embed-actions .btn{justify-content:center}}
  `;
  document.head.appendChild(style);
}

function setStatus(text, ok = false) {
  const status = document.getElementById('progDistribuicaoOsStatus');
  if (!status) return;
  status.textContent = text;
  status.classList.toggle('is-ok', ok);
}

function shouldRender() {
  const active = document.querySelector('#progSteps .stepbtn.active');
  const hasOldFrame = Boolean(document.getElementById('progDistribuicaoOsFrame'));
  return hasOldFrame || active?.dataset?.uiStep === 'A' || active?.dataset?.step === '__distribuicao';
}

function renderEmbed() {
  if (rendering || !shouldRender()) return;
  const list = document.getElementById('progList');
  if (!list) return;

  rendering = true;
  injectStyle();
  const src = osUrl();
  list.innerHTML = `
    <div class="prog-section-title">
      <h4>Distribuição de O.S.</h4>
      <span class="badge">Etapa A</span>
    </div>
    <div class="prog-empty-section" style="margin-bottom:12px">
      As O.S. que precisam de verificação ficam aqui. Use Recarregar caso troque a supervisão ou a data.
    </div>
    <div class="prog-os-embed-toolbar">
      <div id="progDistribuicaoOsStatus" class="prog-os-embed-status">Carregando distribuição de O.S....</div>
      <div class="prog-os-embed-actions">
        <button class="btn btn-secondary" id="progDistribuicaoReload" type="button">Recarregar</button>
        <a class="btn btn-secondary" id="progDistribuicaoOpen" href="${src}" target="_blank" rel="noopener">Abrir em tela cheia</a>
      </div>
    </div>
    <div class="prog-os-embed-frame-wrap">
      <iframe id="progDistribuicaoOsFrame" title="Distribuição de O.S." src="${src}" loading="eager"></iframe>
    </div>`;

  const frame = document.getElementById('progDistribuicaoOsFrame');
  frame?.addEventListener('load', () => setStatus('Distribuição de O.S. carregada.', true));
  document.getElementById('progDistribuicaoReload')?.addEventListener('click', () => {
    const next = osUrl();
    setStatus('Recarregando distribuição de O.S....', false);
    const open = document.getElementById('progDistribuicaoOpen');
    if (open) open.href = next;
    if (frame) frame.src = next;
  });

  setTimeout(() => { rendering = false; }, 0);
}

function bindReloadTriggers() {
  ['progSup', 'progDataRef', 'progLoadContext'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el || el.dataset.osEmbedFixBound === '1') return;
    el.dataset.osEmbedFixBound = '1';
    el.addEventListener(id === 'progLoadContext' ? 'click' : 'change', () => {
      setTimeout(renderEmbed, id === 'progLoadContext' ? 750 : 80);
    });
  });
}

function tick() {
  bindReloadTriggers();
  renderEmbed();
}

new MutationObserver(tick).observe(document.body, { childList: true, subtree: true });
window.addEventListener('load', tick);
tick();
