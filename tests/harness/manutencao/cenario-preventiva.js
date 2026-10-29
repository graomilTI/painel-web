// Cenário de regressão da Preventiva no navegador (veja cenario.js): lista, janela do veículo com os ícones dos grupos, seleção,
// histórico, assistente de registro (passos 1 e 2) e solicitação. Fotos do DOM a cada passo, para comparar antes e depois.
import { criarDb, criarSupabase, log } from './mock-supabase.js';

const AGORA = '2026-10-29T15:00:00-03:00';
const DataReal = Date;
globalThis.Date = class extends DataReal {
  constructor(...a) { if (a.length) super(...a); else super(AGORA); }
  static now() { return new DataReal(AGORA).getTime(); }
};

const quieto = (ms = 80) => new Promise((r) => setTimeout(r, ms));

function foto(nome) {
  const copia = document.body.cloneNode(true);
  copia.querySelectorAll('script,style,#dsToastHost,link').forEach((e) => e.remove());
  const html = copia.innerHTML.replace(/\s+/g, ' ').replace(/> </g, '><').trim();
  let h = 5381;
  for (let i = 0; i < html.length; i += 1) h = ((h << 5) + h + html.charCodeAt(i)) | 0;
  return { nome, hash: h, tamanho: html.length, html };
}

const sel = (s, escopo = document) => escopo.querySelector(s);
async function achar(s, escopo = document) {
  for (let i = 0; i < 40; i += 1) { const el = sel(s, escopo); if (el) return el; await quieto(50); }
  return null;
}
async function clicar(s, escopo = document) {
  const el = await achar(s, escopo);
  if (!el) throw new Error(`não achei ${s}`);
  el.click();
  await quieto();
}
async function digitar(s, valor, evento = 'input') {
  const el = await achar(s);
  if (!el) throw new Error(`não achei ${s}`);
  el.value = valor;
  el.dispatchEvent(new Event(evento, { bubbles: true }));
  if (evento === 'input') el.dispatchEvent(new Event('change', { bubbles: true }));
  await quieto(20);
}

export async function rodar(app) {
  const db = criarDb();
  const supabase = criarSupabase(db);
  await import('/assets/js/modules/frotas-manutencao-preventiva.js');
  const passos = [];
  window.__passos = passos;
  const f = (nome) => passos.push(foto(nome));
  const erros = [];
  window.__erros = erros; window.__log = log;
  window.addEventListener('error', (e) => erros.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => erros.push(String(e.reason?.message || e.reason)));

  await window.FROTAS_MANUT_PREVENTIVA.openHome(app, { supabase, auth: { user: { is_master: true } } });
  await achar('[data-abrir-veic="v1"]'); await quieto(500);
  f('01 lista (serviços)');

  f('02 lista (de novo)');
  await digitar('[data-tipo]', 'todos', 'change'); f('03 tipo: todos');
  await digitar('[data-tipo]', 'servico', 'change');
  await digitar('[data-busca]', 'aaa'); f('04 busca por placa');
  await digitar('[data-busca]', '');

  await clicar('[data-abrir-veic="v1"]'); f('05 janela do veículo (grupos)');
  await clicar('[data-pgrupo="2"]'); f('06 grupo Freios aberto');
  await clicar('[data-card="p1"]'); f('07 serviço marcado');
  await clicar('[data-pgrupo="7"]'); f('08 troca para o grupo Pneus');
  await clicar('[data-pgrupo="7"]'); f('09 grupo fechado (segundo clique)');
  await clicar('[data-sel-pendentes]'); f('10 vencidas e próximas marcadas');
  await clicar('[data-sel-limpar]'); f('11 seleção limpa');
  await clicar('[data-card="p2"]').catch(() => {});
  await clicar('[data-pgrupo="2"]'); await clicar('[data-card="p2"]'); f('12 outro serviço marcado');
  await clicar('[data-reg-painel]'); await achar('[data-passo="1"]'); await quieto(250); f('13 assistente de registro (passo 1)');
  await clicar('[data-acao="proximo"]'); await quieto(200); f('14 passo 2 (prazos)');
  await clicar('[data-acao="voltar"]'); await quieto(60); await clicar('[data-acao="voltar"]'); await quieto(120); f('15 registro cancelado');
  await clicar('[data-fechar-painel]'); f('16 janela do veículo fechada');

  await clicar('[data-hist-prev="v1"]'); await quieto(150); f('17 histórico de preventivas');
  await clicar('[data-hist-fechar]');
  await clicar('[data-abrir-veic="v1"]'); await quieto(150);
  await clicar('[data-sol-painel]'); await quieto(200); f('18 solicitação aberta');
  f('19 final');

  return { passos, log: log.map((l) => l.join('|')), db: { manut: db.frotas_manutencoes.map((m) => `${m.id}:${m.status}`) }, erros };
}
