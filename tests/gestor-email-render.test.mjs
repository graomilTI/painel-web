import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { register } from 'node:module';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

// --- Central de E-mails: regressões de código -------------------------------------------------

test('lista de anexos suspeitos da Central não trata Word/Excel comuns como vírus', async () => {
  const src = await read('assets/js/emails.js');
  const central = new RegExp(src.match(/const DANGEROUS_EXTENSIONS = \/(.+)\/i;/)[1], 'i');
  for (const nome of ['nota.xlsx', 'contrato.docx', 'apresentacao.pptx', 'planilha.xls']) assert.equal(central.test(nome), false, nome);
  for (const nome of ['virus.exe', 'macro.xlsm', 'script.vbs', 'atalho.lnk']) assert.equal(central.test(nome), true, nome);
  // tudo que o worker marca como risco também precisa aparecer como suspeito na tela
  const worker = await read('email-worker/worker.js');
  const workerRe = new RegExp(worker.match(/const dangerousExts = \/(.+)\/i;/)[1], 'i');
  for (const ext of ['exe', 'com', 'bat', 'cmd', 'msi', 'scr', 'vbs', 'jar', 'dll', 'sys', 'drv', 'ps1', 'pif', 'pst', 'reg', 'vsd']) {
    assert.equal(workerRe.test(`a.${ext}`), true, `worker ${ext}`);
    assert.equal(central.test(`a.${ext}`), true, `tela ${ext}`);
  }
});

test('aba PERIGO registra o clique uma única vez (fora de loadPerigo) e volta pra Entrada ao abrir e-mail', async () => {
  const src = await read('assets/js/emails.js');
  const loadPerigo = src.slice(src.indexOf('async function loadPerigo()'), src.indexOf('async function loadOutbox()'));
  assert.doesNotMatch(loadPerigo, /addEventListener/);
  assert.equal(src.match(/getElementById\('emPerigoList'\)\.addEventListener/g)?.length, 1);
  assert.match(src, /setTab\('entrada'\);\s*renderEmails\(\);\s*selectEmail\(row\.dataset\.emailId\)/);
});

test('busca da Central vai pro servidor e fila permite reenviar itens com erro', async () => {
  const src = await read('assets/js/emails.js');
  assert.match(src, /q = q\.or\(/);
  assert.match(src, /data-retry-outbox/);
});

test('worker manda In-Reply-To/References nas respostas', async () => {
  const worker = await read('email-worker/worker.js');
  assert.match(worker, /loadReplyHeaders\(row\.email_id\)/);
  assert.match(worker, /\.\.\.threadHeaders/);
});

test('navegação para e-mails usa página completa (evita perder CSS/modo foco na soft-nav)', async () => {
  const src = await read('assets/js/pageInit.js');
  const set = src.match(/const FULL_PAGE_ROUTES = new Set\(\[([\s\S]*?)\]\)/)[1];
  assert.match(set, /'emails'/);
  assert.match(set, /'gestor-email'/);
});

test('CSS do Gestor mostra o leitor em tela cheia no celular (antes ficava display:none)', async () => {
  const css = await read('assets/css/gestor-email.css');
  assert.match(css, /\.gm-workspace\.reading \.gm-reader\{display:block/);
  assert.match(css, /\.gm-workspace\.reading \.gm-list-col/);
});

// --- Gestor: renderização com stubs ----------------------------------------------------------

register('data:text/javascript,' + encodeURIComponent(`
  const stubs = {
    './pageInit.js': 'export function initProtectedPage(t, fn) { globalThis.__gmRender = fn; }',
    './supabaseClient.js': 'export const supabase = globalThis.__supabase;',
    './auth.js': 'export async function getCurrentUser() { return { id: "u1", email: "gestor@x.com" }; }',
    './paths.js': 'export const toPanelUrl = (p) => "/" + p;',
  };
  export async function resolve(specifier, context, next) {
    if (stubs[specifier]) return { url: 'stub:' + specifier, shortCircuit: true };
    return next(specifier, context);
  }
  export async function load(url, context, next) {
    if (url.startsWith('stub:')) return { format: 'module', source: stubs[url.slice(5)], shortCircuit: true };
    return next(url, context);
  }
`));

function fakeElement() {
  const el = { hidden: false, dataset: {}, value: '', textContent: '', _html: '', listeners: {} };
  el.addEventListener = (type, fn) => { (el.listeners[type] ||= []).push(fn); };
  el.querySelector = () => fakeElement();
  el.querySelectorAll = () => [];
  el.focus = () => {};
  Object.defineProperty(el, 'innerHTML', { get: () => el._html, set: (v) => { el._html = v; } });
  return el;
}

function query(rows) {
  const builder = {
    select: () => builder, eq: () => builder, order: () => builder, limit: () => builder, update: () => builder, in: () => builder,
    maybeSingle: async () => ({ data: rows.account, error: null }),
    then: (resolve) => resolve({ data: rows.data, error: null }),
  };
  return builder;
}

async function renderGestor(messages, folder) {
  const account = { id: 'a1', email: 'gestor@x.com', conexao_status: 'CONECTADA', ultima_sync_em: null, ultima_sync_erro: null };
  globalThis.__supabase = {
    from: (table) => query(table === 'email_accounts_public' ? { account } : { data: messages }),
    functions: { invoke: async () => ({ data: { ok: true } }) },
    storage: {},
  };
  const content = fakeElement();
  globalThis.document = {
    getElementById: (id) => (id === 'pageContent' ? content : fakeElement()),
    createElement: () => { const t = { set innerHTML(v) { this.value = String(v).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'); } }; return t; },
  };
  globalThis.sessionStorage = { setItem() {} };
  await import(`../assets/js/gestor-email.js?t=${Math.random()}`);
  await globalThis.__gmRender();
  return content.innerHTML;
}

const msg = (over) => ({
  id: 'm1', account_id: 'a1', mailbox_path: 'INBOX', remetente_nome: 'Fulano', remetente_email: 'f@x.com', assunto: 'Assunto',
  corpo_texto: 'Olá', corpo_html: null, data_recebimento: '2026-09-30T12:00:00Z', lido: false, favorito: false, arquivado_em: null, excluido_em: null, ...over,
});

test('Gestor: mensagem arquivada sai da Entrada e aparece na aba Arquivo', async () => {
  const html = await renderGestor([msg({ id: 'in' , assunto: 'Na entrada' }), msg({ id: 'arq', assunto: 'Arquivada', mailbox_path: 'Archive', arquivado_em: '2026-09-30T13:00:00Z' })]);
  assert.match(html, /Na entrada/);
  assert.doesNotMatch(html, /Arquivada/, 'arquivada não pode ficar na Entrada');
  assert.match(html, /data-folder="arquivo"/);
  assert.match(html, /class="gm-workspace "/);
});
