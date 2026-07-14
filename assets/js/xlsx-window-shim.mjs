// Evita que uma indisponibilidade do CDN do SheetJS impeça todo o módulo
// adm-logistica de iniciar. A biblioteca clássica é carregada separadamente
// pelo HTML e este módulo apenas encaminha as chamadas quando necessário.

function library() {
  const xlsx = globalThis.XLSX;
  if (!xlsx) {
    throw new Error('A biblioteca de planilhas ainda não foi carregada. Aguarde alguns segundos e tente novamente.');
  }
  return xlsx;
}

export function read(...args) {
  return library().read(...args);
}

export function write(...args) {
  return library().write(...args);
}

export function writeFile(...args) {
  return library().writeFile(...args);
}

export function readFile(...args) {
  return library().readFile(...args);
}

export const utils = new Proxy({}, {
  get(_target, property) {
    const value = library().utils?.[property];
    return typeof value === 'function' ? value.bind(library().utils) : value;
  },
});

export const SSF = new Proxy({}, {
  get(_target, property) {
    const value = library().SSF?.[property];
    return typeof value === 'function' ? value.bind(library().SSF) : value;
  },
});

export default new Proxy({}, {
  get(_target, property) {
    const value = library()[property];
    return typeof value === 'function' ? value.bind(library()) : value;
  },
});
