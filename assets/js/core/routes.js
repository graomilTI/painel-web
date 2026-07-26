// assets/js/core/routes.js
// Registro central de rotas (fundação P0, itens 1.4 e 2.5).
//
// Origem única: app_modulos (banco) → menuConfig.js → este registro →
// authGuard/router. Este módulo deriva o registro do MENU_CONFIG existente
// (sem duplicar dados) e valida inconsistências em tempo de carga, para que
// rota nova nunca dependa de alias de contingência.

import { MENU_CONFIG } from '../menuConfig.js';

function normalize(value = '') {
  return String(value || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Registro plano: [{ code, label, path, grupo, aliases }]
 * `code` é o código canônico que deve existir em app_modulos.
 */
export const ROUTES = MENU_CONFIG.flatMap((section) =>
  section.itens.map((item) => ({
    code: normalize(item.code),
    label: item.label,
    path: item.path,
    grupo: section.grupo,
    aliases: (item.aliases || []).map(normalize),
  }))
);

const porCodigo = new Map(ROUTES.map((r) => [r.code, r]));
const porPath = new Map();
for (const r of ROUTES) {
  const base = normalize(String(r.path).split('#')[0]);
  if (!porPath.has(base)) porPath.set(base, []);
  porPath.get(base).push(r);
}

export function rotaPorCodigo(code) {
  return porCodigo.get(normalize(code)) || null;
}

export function rotasPorPath(path) {
  const base = normalize(String(path || '').split('#')[0].replace(/\.html$/i, ''));
  return porPath.get(base) || [];
}

/**
 * Valida o registro e devolve a lista de problemas encontrados.
 * Usado por scripts de manutenção e pelo console em desenvolvimento:
 *   import('./assets/js/core/routes.js').then(m => console.table(m.validarRotas()))
 */
export function validarRotas() {
  const problemas = [];
  const vistos = new Map();
  for (const r of ROUTES) {
    if (vistos.has(r.code)) {
      problemas.push({ tipo: 'codigo_duplicado', code: r.code, detalhes: `${vistos.get(r.code)} × ${r.grupo}` });
    }
    vistos.set(r.code, r.grupo);
    if (!r.path) problemas.push({ tipo: 'sem_path', code: r.code });
    if (r.aliases.length > 6) {
      problemas.push({ tipo: 'aliases_excessivos', code: r.code, detalhes: `${r.aliases.length} aliases — normalizar códigos em app_modulos` });
    }
  }
  return problemas;
}
