// Pré-seleção de EPIs por setor (cargo de contratação) no modal do RH > EPI.

const PRESETS_EPI_CARGO = {
  operacional_i: [
    'CAPACETE',
    'OCULOS DE PROTEÇÃO',
    'PROTETOR AURICULAR',
    'MASCARA PFF2',
    'LUVA MULTITATO PU',
    'BOTINA',
    'CINTURAO SEGURANCA TALABARTE',
  ],
  operacional_ii: [
    'CAPACETE',
    'OCULOS DE PROTEÇÃO',
    'PROTETOR AURICULAR',
    'MASCARA PFF2',
    'LUVA MULTITATO PU',
    'BOTINA',
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

// O Setor (OPERACIONAL 1/2) já define o cargo de contratação: ao escolhê-lo na
// nova ficha, pré-marca os EPIs do preset. Na edição não mexe nos EPIs salvos.
const PRESET_POR_SETOR = { 'OPERACIONAL 1': 'operacional_i', 'OPERACIONAL 2': 'operacional_ii' };

function ligarPresetAoSetor(modal) {
  const setor = modal?.querySelector('#solSetor');
  if (!setor || setor.dataset.presetLigado) return;
  if (!modal.querySelector('#solSolicitar')) return;
  setor.dataset.presetLigado = '1';
  setor.addEventListener('change', () => {
    const tipo = PRESET_POR_SETOR[setor.value];
    if (tipo) marcarPresetEpi(modal, tipo);
  });
}

function iniciarPatchPresetEpi() {
  const aplicar = () => ligarPresetAoSetor(document.getElementById('epiModal'));
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
