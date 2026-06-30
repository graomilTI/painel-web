const CASA_ICON = '<svg viewBox="0 0 48 48"><path d="M7 24L24 10l17 14"/><path d="M13 22v17h22V22"/><path d="M20 39V28h8v11"/></svg>';

function routeName() {
  return String(window.location.pathname || '')
    .split('/')
    .filter(Boolean)
    .pop()
    ?.replace(/\.html$/i, '')
    .toLowerCase() || '';
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function injectStyles() {
  if (document.getElementById('programacaoRuntimeFixesStyles')) return;
  const style = document.createElement('style');
  style.id = 'programacaoRuntimeFixesStyles';
  style.textContent = `
    .prog-estadia-selector{grid-template-columns:repeat(4,minmax(72px,1fr))!important;min-width:340px!important}
    @media(max-width:680px){.prog-estadia-selector{grid-template-columns:repeat(2,minmax(96px,1fr))!important;min-width:220px!important}}
  `;
  document.head.appendChild(style);
}

function field(tr, name) {
  return tr?.querySelector(`[data-field="${name}"]`) || null;
}

function clearCasaFields(tr) {
  ['cidade', 'uf', 'alojamento_id', 'alojamento_nome', 'checkin', 'checkout'].forEach((name) => {
    const input = field(tr, name);
    if (input) input.value = '';
  });
}

function ensureCasaButton(selector) {
  const tr = selector.closest('tr[data-table="programacao_estadia"]');
  const hidden = field(tr, 'tipo_estadia');
  if (!tr || !hidden) return;

  const blocked = Boolean(selector.querySelector('.prog-estadia-card:disabled'));
  let casa = selector.querySelector('[data-estadia-tipo="CASA"]');
  if (!casa) {
    casa = document.createElement('button');
    casa.type = 'button';
    casa.className = 'prog-estadia-card';
    casa.dataset.estadiaTipo = 'CASA';
    casa.innerHTML = `${CASA_ICON}<span>Casa</span>`;
    selector.insertBefore(casa, selector.firstElementChild);
  }
  casa.disabled = blocked;

  if (!normalize(hidden.value)) hidden.value = 'CASA';
  const current = normalize(hidden.value) || 'CASA';
  selector.querySelectorAll('.prog-estadia-card[data-estadia-tipo]').forEach((btn) => {
    btn.classList.toggle('active', normalize(btn.dataset.estadiaTipo) === current);
  });

  const note = tr.querySelector('.prog-required-note');
  if (note && /Casa \(nenhuma op(?:ç|c)ão selecionada\)/i.test(note.textContent || '')) {
    note.textContent = 'Casa selecionada: não gera hospedagem.';
  }
}

function patchEstadiaRows(content) {
  content.querySelectorAll('.prog-estadia-selector').forEach(ensureCasaButton);
}

function bindClickGuard(content) {
  if (content.dataset.programacaoRuntimeFixesClickGuard === '1') return;
  content.dataset.programacaoRuntimeFixesClickGuard = '1';

  content.addEventListener('click', (event) => {
    const btn = event.target.closest('.prog-estadia-card[data-estadia-tipo]');
    if (!btn || !content.contains(btn)) return;

    const tr = btn.closest('tr[data-table="programacao_estadia"]');
    const hidden = field(tr, 'tipo_estadia');
    if (!tr || !hidden) return;

    const tipo = normalize(btn.dataset.estadiaTipo) || 'CASA';

    // O script original alternava o botão ativo para vazio ao clicar de novo.
    // Isso deixava "Casa" sem valor real e fazia a validação travar a etapa B.
    if (!btn.classList.contains('active')) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    hidden.value = tipo;
    tr.querySelectorAll('.prog-estadia-card[data-estadia-tipo]').forEach((card) => {
      card.classList.toggle('active', card === btn);
    });

    if (tipo === 'CASA') clearCasaFields(tr);
    const note = tr.querySelector('.prog-required-note');
    if (note) note.textContent = tipo === 'CASA' ? 'Casa selecionada: não gera hospedagem.' : '';

    hidden.dispatchEvent(new Event('input', { bubbles: true }));
  }, true);
}

export function initProgramacaoRuntimeFixes(content = document.getElementById('pageContent')) {
  if (!content || routeName() !== 'programacao') return;

  injectStyles();
  patchEstadiaRows(content);
  bindClickGuard(content);

  if (content.dataset.programacaoRuntimeFixesObserver === '1') return;
  content.dataset.programacaoRuntimeFixesObserver = '1';

  const observer = new MutationObserver(() => patchEstadiaRows(content));
  observer.observe(content, { childList: true, subtree: true });
}
