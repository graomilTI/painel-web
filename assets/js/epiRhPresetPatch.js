// Pré-seleção de EPIs por cargo de contratação no modal do RH > EPI.

const PRESETS_EPI_CARGO = {
  operacional_i: [
    'BOTINA',
    'LUVA MULTITATO PU',
    'CAPACETE',
    'PROTETOR AURICULAR',
  ],
  operacional_ii: [
    'BOTINA',
    'LUVA MULTITATO PU',
    'MASCARA PFF2',
    'CAPACETE',
    'PROTETOR AURICULAR',
    'CINTO DE SEGURANÇA',
    'TALABARTE',
  ],
};

function normalizarEpi(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

function marcarPresetEpi(modal, tipo) {
  if (!modal) return;
  const preset = new Set((PRESETS_EPI_CARGO[tipo] || []).map(normalizarEpi));
  const todosPresets = new Set(Object.values(PRESETS_EPI_CARGO).flat().map(normalizarEpi));

  modal.querySelectorAll('input[type="checkbox"][id^="epiCheck_"]').forEach((checkbox) => {
    const material = normalizarEpi(checkbox.value);
    if (!todosPresets.has(material)) return;
    checkbox.checked = preset.has(material);
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function localizarBlocoEpis(modal) {
  const checkboxes = [...modal.querySelectorAll('input[type="checkbox"][id^="epiCheck_"]')];
  if (!checkboxes.length) return null;

  let node = checkboxes[0];
  while (node && node !== modal) {
    if (node.classList?.contains('mt-20')) return node;
    node = node.parentElement;
  }

  return checkboxes[0].closest('label')?.parentElement?.parentElement || null;
}

function inserirSeletorCargo(modal) {
  if (!modal || modal.querySelector('#epiCargoContratacao')) return;
  if (!modal.querySelector('#solColabInput')) return;

  const blocoEpis = localizarBlocoEpis(modal);
  if (!blocoEpis) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'mt-16';
  wrapper.setAttribute('data-epi-cargo-wrapper', '1');
  wrapper.innerHTML = `
    <label style="display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;font-weight:700">
      Cargo de contratação <span style="color:#fde68a;font-size:11px;text-transform:none;letter-spacing:0">* selecione para pré-marcar os EPIs</span>
      <select id="epiCargoContratacao" style="width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.24);background:#0d0d18;color:#e2e2f0;border-radius:12px;padding:10px 12px;color-scheme:dark;font-size:14px;text-transform:none;letter-spacing:0">
        <option value="">Selecione...</option>
        <option value="operacional_ii">OPERACIONAL I</option>
        <option value="operacional_i">OPERACIONAL II</option>
      </select>
    </label>
  `;

  blocoEpis.parentNode.insertBefore(wrapper, blocoEpis);

  const select = wrapper.querySelector('#epiCargoContratacao');
  select.addEventListener('change', () => marcarPresetEpi(modal, select.value));
}

function iniciarPatchPresetEpi() {
  const aplicar = () => inserirSeletorCargo(document.getElementById('epiModal'));
  const observer = new MutationObserver(aplicar);
  observer.observe(document.body, { childList: true, subtree: true });
  aplicar();
  setInterval(aplicar, 800);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciarPatchPresetEpi, { once: true });
} else {
  iniciarPatchPresetEpi();
}
