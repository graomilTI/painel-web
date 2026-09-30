import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Executa o trecho "Painel -> IMAP" do worker com um servidor IMAP e um Supabase falsos.
const worker = await readFile(new URL('../email-worker/worker.js', import.meta.url), 'utf8');
const start = worker.indexOf('const IMAP_CHANGES_BATCH');
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
    `${block}; return applyImapChanges;`);
  const applyImapChanges = fn(
    { from: query },
    function ImapFlow() { return fakeClient; },
    (v) => v,
    (m) => Array.from(m.flags || []),
    (v) => String(v).toLowerCase(),
  );
  return { applyImapChanges, calls, dbUpdates };
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
