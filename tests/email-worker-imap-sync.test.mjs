import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Executa o trecho "Painel -> IMAP" do worker com um servidor IMAP e um Supabase falsos.
const worker = await readFile(new URL('../email-worker/worker.js', import.meta.url), 'utf8');
const start = worker.indexOf('const FLAG_MAP_MAX_MESSAGES');
const end = worker.indexOf('async function runOnce()');
assert.ok(start > 0 && end > start, 'trecho do worker não encontrado');
const block = worker.slice(start, end);

function build({ rows, folders, messagesByFolder }) {
  const calls = [];
  const dbUpdates = [];
  const fakeClient = {
    connect: async () => {},
    logout: async () => {},
    list: async () => folders.map((path) => ({ path, flags: new Set(path === 'INBOX.Trash' ? ['\\Trash'] : []) })),
    mailboxCreate: async (path) => { calls.push(['create', path]); },
    getMailboxLock: async (path) => {
      if (!messagesByFolder[path]) throw new Error('no such mailbox');
      calls.push(['lock', path]);
      return { release: () => calls.push(['release', path]), path };
    },
    search: async (query) => {
      const id = query.header['message-id'];
      const found = [];
      for (const [path, ids] of Object.entries(messagesByFolder)) {
        if (calls.filter((c) => c[0] === 'lock').at(-1)?.[1] === path && ids.includes(id)) found.push(7);
      }
      return found;
    },
    messageFlagsAdd: async (uids, flags) => calls.push(['add', flags[0]]),
    messageFlagsRemove: async (uids, flags) => calls.push(['remove', flags[0]]),
    messageMove: async (uids, dest) => calls.push(['move', dest]),
  };
  const query = (table) => {
    const b = { filters: [], patch: null };
    const chain = new Proxy({}, {
      get: (_, name) => {
        if (name === 'then') return (resolve) => resolve({ data: b.rows, error: null });
        if (name === 'update') return (patch) => { b.patch = patch; return chain; };
        if (name === 'select') return () => { b.rows = rows; return chain; };
        return (...args) => { b.filters.push([name, ...args]); if (b.patch) dbUpdates.push({ patch: b.patch, filters: b.filters }); return chain; };
      },
    });
    return chain;
  };
  const fn = new Function('supabase', 'ImapFlow', 'decryptCredential', 'mailboxFlagList', 'mailboxKey',
    `${block}; return { applyImapChanges, relocateKnownMessage, fetchFlagMap, reconcileFlagsFromServer };`);
  const api = fn(
    { from: query },
    function ImapFlow() { return fakeClient; },
    (v) => v,
    (m) => Array.from(m.flags || []),
    (v) => String(v).toLowerCase(),
  );
  return { ...api, calls, dbUpdates };
}

const account = { id: 'a1', email: 'g@x.com', imap_host: 'h', imap_port: 993, imap_secure: true, username: 'g', password_cipher: 'x' };
const row = (over) => ({ id: 'm1', message_id: 'abc@x', mailbox_path: 'INBOX', imap_mailbox: null, lido: true, favorito: false, arquivado_em: null, excluido_em: null, raw: { mailbox: 'INBOX' }, ...over });

test('lido/favorito viram flags \\Seen/\\Flagged no servidor, sem mover a mensagem', async () => {
  const { applyImapChanges, calls, dbUpdates } = build({ rows: [row({ lido: true, favorito: true })], folders: ['INBOX', 'INBOX.Trash'], messagesByFolder: { INBOX: ['abc@x'] } });
  await applyImapChanges(account);
  assert.deepEqual(calls.filter((c) => ['add', 'remove', 'move'].includes(c[0])), [['add', '\\Seen'], ['add', '\\Flagged']]);
  assert.ok(dbUpdates.some((u) => u.patch.imap_pendente === false), 'limpa a marca de pendente');
});

test('marcar como não lido remove \\Seen', async () => {
  const { applyImapChanges, calls } = build({ rows: [row({ lido: false })], folders: ['INBOX'], messagesByFolder: { INBOX: ['abc@x'] } });
  await applyImapChanges(account);
  assert.deepEqual(calls.filter((c) => c[0] === 'remove'), [['remove', '\\Seen'], ['remove', '\\Flagged']]);
});

test('excluir move para a Lixeira do servidor (nunca apaga)', async () => {
  const { applyImapChanges, calls, dbUpdates } = build({ rows: [row({ excluido_em: '2026-09-30T10:00:00Z', mailbox_path: 'Trash' })], folders: ['INBOX', 'INBOX.Trash'], messagesByFolder: { INBOX: ['abc@x'], 'INBOX.Trash': [] } });
  await applyImapChanges(account);
  assert.deepEqual(calls.filter((c) => c[0] === 'move'), [['move', 'INBOX.Trash']]);
  assert.ok(dbUpdates.some((u) => u.patch.imap_mailbox === 'INBOX.Trash'));
});

test('arquivar cria a pasta Archive (com prefixo INBOX.) quando não existe', async () => {
  const { applyImapChanges, calls } = build({ rows: [row({ arquivado_em: '2026-09-30T10:00:00Z', mailbox_path: 'Archive' })], folders: ['INBOX', 'INBOX.Sent'], messagesByFolder: { INBOX: ['abc@x'] } });
  await applyImapChanges(account);
  assert.deepEqual(calls.filter((c) => c[0] === 'create'), [['create', 'INBOX.Archive']]);
  assert.deepEqual(calls.filter((c) => c[0] === 'move'), [['move', 'INBOX.Archive']]);
});

test('restaurar volta para a pasta de origem, achando a mensagem onde ela está agora', async () => {
  const { applyImapChanges, calls } = build({ rows: [row({ mailbox_path: 'INBOX', imap_mailbox: 'INBOX.Trash' })], folders: ['INBOX', 'INBOX.Trash'], messagesByFolder: { INBOX: [], 'INBOX.Trash': ['abc@x'] } });
  await applyImapChanges(account);
  assert.deepEqual(calls.filter((c) => c[0] === 'move'), [['move', 'INBOX']]);
});

test('mensagem que sumiu do servidor registra o erro e não trava a fila', async () => {
  const { applyImapChanges, calls, dbUpdates } = build({ rows: [row()], folders: ['INBOX'], messagesByFolder: { INBOX: [] } });
  await applyImapChanges(account);
  assert.equal(calls.some((c) => c[0] === 'move'), false);
  assert.ok(dbUpdates.some((u) => /não encontrada/.test(u.patch.imap_erro || '')));
  assert.ok(dbUpdates.some((u) => u.patch.imap_pendente === false));
});

test('painel só marca imap_pendente e o worker só roda isso para caixas GESTOR', async () => {
  const web = await readFile(new URL('../assets/js/gestor-email.js', import.meta.url), 'utf8');
  assert.match(web, /update\.imap_pendente=true/);
  assert.match(web, /lido:true,imap_pendente:true/);
  assert.match(worker, /account\.escopo === 'GESTOR'\) await applyImapChanges/);
});

// --- IMAP -> painel -------------------------------------------------------------------------

const dbRow = (over) => ({ id: 'm1', mailbox_path: 'INBOX', imap_pendente: false, imap_mailbox: null, arquivado_em: null, excluido_em: null, raw: { mailbox: 'INBOX' }, ...over });

test('apagou no webmail: mensagem que reaparece na Lixeira vira excluída no painel', async () => {
  const { relocateKnownMessage, dbUpdates } = build({ rows: [], folders: [], messagesByFolder: {} });
  await relocateKnownMessage(dbRow(), 'INBOX.Trash', { uid: 44, flags: new Set(['\\Seen']) }, '99');
  const patch = dbUpdates.at(-1).patch;
  assert.equal(patch.mailbox_path, 'INBOX.Trash');
  assert.equal(patch.imap_uid, 44);
  assert.equal(patch.lido, true);
  assert.ok(patch.excluido_em);
  assert.equal(patch.arquivado_em, null);
});

test('arquivou no webmail: vira arquivada e sai da Lixeira se estava nela', async () => {
  const { relocateKnownMessage, dbUpdates } = build({ rows: [], folders: [], messagesByFolder: {} });
  await relocateKnownMessage(dbRow({ excluido_em: '2026-09-29T10:00:00Z', mailbox_path: 'Trash' }), 'INBOX.Archive', { uid: 5, flags: new Set() }, '99');
  const patch = dbUpdates.at(-1).patch;
  assert.ok(patch.arquivado_em);
  assert.equal(patch.excluido_em, null);
  assert.equal(patch.lido, false);
});

test('restaurou no webmail: volta pra Entrada e limpa lixeira/arquivo', async () => {
  const { relocateKnownMessage, dbUpdates } = build({ rows: [], folders: [], messagesByFolder: {} });
  await relocateKnownMessage(dbRow({ excluido_em: '2026-09-29T10:00:00Z', mailbox_path: 'INBOX.Trash', imap_mailbox: 'INBOX.Trash' }), 'INBOX', { uid: 90, flags: new Set(['\\Seen']) }, '7');
  const patch = dbUpdates.at(-1).patch;
  assert.equal(patch.excluido_em, null);
  assert.equal(patch.mailbox_path, 'INBOX');
});

test('cópia da mesma mensagem entre Entrada e Enviados não é tratada como movimentação', async () => {
  const { relocateKnownMessage, dbUpdates } = build({ rows: [], folders: [], messagesByFolder: {} });
  await relocateKnownMessage(dbRow({ mailbox_path: 'INBOX.Sent', raw: { mailbox: 'INBOX.Sent' } }), 'INBOX', { uid: 3, flags: new Set() }, '7');
  assert.equal(dbUpdates.length, 0);
});

test('alteração do painel ainda pendente nunca é sobrescrita pelo servidor', async () => {
  const { relocateKnownMessage, dbUpdates } = build({ rows: [], folders: [], messagesByFolder: {} });
  await relocateKnownMessage(dbRow({ imap_pendente: true }), 'INBOX.Trash', { uid: 44, flags: new Set() }, '99');
  assert.equal(dbUpdates.length, 0);
});

test('lido/favorito mudados no webmail atualizam o painel; linhas sem mudança ficam quietas', async () => {
  const rows = [
    { id: 'a', uid: 10, lido: false, favorito: false, imap_mailbox: null, imap_uid: null, imap_uid_validity: null, origem: 'INBOX', origem_validade: '5' },
    { id: 'b', uid: 11, lido: true, favorito: false, imap_mailbox: null, imap_uid: null, imap_uid_validity: null, origem: 'INBOX', origem_validade: '5' },
    { id: 'c', uid: 12, lido: false, favorito: false, imap_mailbox: 'INBOX.Trash', imap_uid: 3, imap_uid_validity: '9', origem: 'INBOX', origem_validade: '5' },
    { id: 'd', uid: 13, lido: false, favorito: false, imap_mailbox: 'INBOX.Archive', imap_uid: null, imap_uid_validity: null, origem: 'INBOX', origem_validade: '5' },
    { id: 'e', uid: 14, lido: false, favorito: false, imap_mailbox: null, imap_uid: null, imap_uid_validity: null, origem: 'INBOX', origem_validade: '999' },
  ];
  const { reconcileFlagsFromServer, dbUpdates } = build({ rows, folders: [], messagesByFolder: {} });
  const flagMaps = new Map([
    ['INBOX', { validity: '5', map: new Map([[10, { seen: true, flagged: true }], [11, { seen: true, flagged: false }], [14, { seen: true, flagged: false }]]) }],
    ['INBOX.Trash', { validity: '9', map: new Map([[3, { seen: true, flagged: false }]]) }],
  ]);
  const changed = await reconcileFlagsFromServer(account, flagMaps);
  const seen = new Set();
  const patches = dbUpdates.filter((u) => 'lido' in u.patch && !seen.has(u.patch) && seen.add(u.patch));
  assert.equal(changed, 2);
  assert.deepEqual(patches.map((u) => u.filters.find((f) => f[0] === 'eq' && f[1] === 'id')[2]), ['a', 'c']);
  assert.deepEqual(patches[0].patch, { lido: true, favorito: true });
  // d (mudou de pasta, UID ainda desconhecido) e e (UIDVALIDITY diferente) não podem ser tocadas
});

test('fetchFlagMap lê UID -> \Seen/\Flagged da pasta e libera o lock', async () => {
  const { fetchFlagMap } = build({ rows: [], folders: [], messagesByFolder: {} });
  const released = [];
  const client = {
    mailbox: { uidValidity: 42n, exists: 2 },
    getMailboxLock: async () => ({ release: () => released.push(true) }),
    fetch: async function* () { yield { uid: 1, flags: new Set(['\\Seen']) }; yield { uid: 2, flags: new Set(['\\Flagged']) }; },
  };
  const result = await fetchFlagMap(client, 'INBOX');
  assert.equal(result.validity, '42');
  assert.deepEqual([...result.map], [[1, { seen: true, flagged: false }], [2, { seen: false, flagged: true }]]);
  assert.equal(released.length, 1);
});

test('worker só reconcilia caixas GESTOR e o import chama relocateKnownMessage para e-mails já conhecidos', async () => {
  assert.match(worker, /if \(account\.escopo === 'GESTOR'\) await relocateKnownMessage/);
  assert.match(worker, /reconcileFlagsFromServer\(account, flagMaps\)/);
});
