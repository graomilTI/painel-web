// assets/js/modules/frotas-permissoes.js
// Replica a mesma checagem de permissao usada pela sidebar (isItemAllowed +
// buildAllowedCodeSet em assets/js/menuBuilder.js), mas por card dentro de um
// hub: um hub agora agrupa telas com codigos de permissao diferentes (ex.:
// alguem pode ter so FROTAS_VEICULOS e nao FROTAS_MOTORISTAS), entao cada
// card decide sozinho se aparece.

const DIACRITICS_REGEX = new RegExp('[\\u0300-\\u036f]', 'g');

function normalizeCode(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS_REGEX, '');
}

export function temAcessoFrota(ctx, aliases = []) {
  if (ctx?.user?.is_master) return true;

  const allowedCodes = new Set();
  for (const mod of ctx?.modules || []) {
    if (mod?.can_view === false) continue;
    const code = normalizeCode(mod?.code || mod?.codigo);
    if (code) allowedCodes.add(code);
  }

  return aliases.map(normalizeCode).some((code) => allowedCodes.has(code));
}
