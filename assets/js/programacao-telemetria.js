// Telemetria TEMPORÁRIA da Programação (criada em 15/10/2026).
//
// Mede quais funções de renderContent() (assets/js/programacao.js) realmente executam em produção, para
// decidir com evidência quais pertencem à tela clássica de etapas A–E (substituída pela UI nova) e podem
// ser apagadas. Cada sessão envia { nomeDaFuncao: nº de chamadas } — nada de dado de colaborador, O.S. ou valor.
//
// REMOVER depois da coleta (~22/10/2026): este arquivo, o import e o bloco "TELEMETRIA TEMPORÁRIA" em
// programacao.js, e `drop table public.programacao_telemetria_funcoes;`.
//
// Regra de ouro: a telemetria nunca altera o comportamento da tela. Tudo aqui é protegido por try/catch,
// o retorno e o `this` da função original são preservados e o envio é assíncrono e sem espera.

const instancias = new Set();
let ouvintesInstalados = false;

function enviarTodas() {
  for (const t of instancias) t.enviar();
}

function instalarOuvintes() {
  if (ouvintesInstalados || typeof window === 'undefined') return;
  ouvintesInstalados = true;
  try {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') enviarTodas(); });
    window.addEventListener('pagehide', enviarTodas);
  } catch {
    // sem DOM (testes): segue sem ouvintes
  }
}

function novoIdSessao() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    // cai no fallback
  }
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @param {{ versao: string, inserir: (linha: { sessao: string, versao: string, funcoes: Record<string, number> }) => unknown,
 *           primeiroEnvioMs?: number, intervaloMs?: number, maxEnvios?: number }} opcoes
 */
export function criarTelemetria({ versao, inserir, primeiroEnvioMs = 5000, intervaloMs = 30000, maxEnvios = 20 }) {
  const sessao = novoIdSessao();
  let pendente = {};
  let envios = 0;
  let timer = null;

  function enviar() {
    try {
      if (timer) { clearTimeout(timer); timer = null; }
      const nomes = Object.keys(pendente);
      if (!nomes.length || envios >= maxEnvios) return;
      const funcoes = pendente;
      pendente = {};
      envios += 1;
      Promise.resolve(inserir({ sessao, versao, funcoes })).catch(() => {});
    } catch {
      // a telemetria nunca interfere na tela
    }
  }

  function agendar() {
    if (timer || envios >= maxEnvios) return;
    timer = setTimeout(enviar, envios === 0 ? primeiroEnvioMs : intervaloMs);
  }

  function registrar(nome) {
    try {
      pendente[nome] = (pendente[nome] || 0) + 1;
      agendar();
    } catch {
      // a telemetria nunca interfere na tela
    }
  }

  /** Devolve uma função equivalente à original que, antes de executá-la, conta a chamada. */
  function envolver(nome, fn) {
    return function funcaoComTelemetria(...args) {
      registrar(nome);
      return fn.apply(this, args);
    };
  }

  const api = { envolver, registrar, enviar, sessao };
  instancias.add(api);
  instalarOuvintes();
  return api;
}
