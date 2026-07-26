// assets/js/core/state.js
// Mini-store por módulo (fundação P0, item 2.4).
//
// Cada módulo cria seu estado com createState(inicial) e assina mudanças com
// subscribe(fn). set() faz merge raso e notifica; get() devolve o snapshot.
// Evita o padrão antigo de objetos soltos mutados por vários arquivos.

export function createState(inicial = {}) {
  let estado = { ...inicial };
  const ouvintes = new Set();

  return {
    get() { return estado; },
    set(parcial) {
      const proximo = typeof parcial === 'function' ? parcial(estado) : parcial;
      estado = { ...estado, ...proximo };
      for (const fn of ouvintes) {
        try { fn(estado); } catch (error) { console.error('[state] ouvinte falhou:', error); }
      }
      return estado;
    },
    subscribe(fn) {
      ouvintes.add(fn);
      return () => ouvintes.delete(fn);
    },
    reset() {
      estado = { ...inicial };
      for (const fn of ouvintes) {
        try { fn(estado); } catch { /* noop */ }
      }
    },
  };
}
