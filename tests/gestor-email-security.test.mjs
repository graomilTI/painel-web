import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('migration isolates every personal mailbox relation by authenticated owner', async () => {
  const sql = await read('supabase/migrations/20260831183742_gestor_email_privado.sql');
  assert.match(sql, /owner_auth_user_id uuid references auth\.users\(id\)/i);
  assert.match(sql, /unique index[^;]+owner_auth_user_id[^;]+where escopo = 'GESTOR'/is);
  for (const relation of ['email_accounts', 'email_messages', 'email_attachments', 'email_mailbox_states', 'email_historico', 'email_outbox']) {
    assert.match(sql, new RegExp(`create policy ${relation}_gestor_`, 'i'), `missing owner policy for ${relation}`);
  }
  assert.match(sql, /security_invoker = true/i);
  assert.match(sql, /drop policy if exists email_attachments_storage_select/i);
  assert.match(sql, /private\.email_storage_owned\(name\)/i);
});

test('account endpoint derives ownership from the authenticated JWT', async () => {
  const source = await read('supabase/functions/gestor-email-account/index.ts');
  assert.match(source, /owner_auth_user_id: auth\.userId/);
  assert.match(source, /eq\("owner_auth_user_id", auth\.userId\)/);
  assert.doesNotMatch(source, /owner_auth_user_id:\s*body\./);
  assert.match(source, /encryptPassword\(password, encryptionSecret\)/);
  assert.doesNotMatch(source, /password_cipher:\s*password/);
});

test('Gestor route is separate from the administrative Central de E-mails', async () => {
  const menu = await read('assets/js/menuConfig.js');
  const desktop = await read('assets/js/gestor-email.js');
  assert.match(menu, /item\("gestor_email", "E-mail", "gestor-email"/);
  assert.doesNotMatch(menu, /item\("(?:email_gestor|gestor_email)", "E-mail", "emails"/);
  assert.match(desktop, /from\('email_accounts_public'\)/);
  assert.doesNotMatch(desktop, /from\('email_accounts'\)/);
});

test('worker disables Central automation for personal Gestor accounts', async () => {
  const worker = await read('email-worker/worker.js');
  assert.match(worker, /account\.escopo === 'GESTOR'/);
  assert.match(worker, /if \(!isGestorMailbox\) await autoForwardEmail/);
  assert.match(worker, /analyze: !isGestorMailbox/);
  assert.match(worker, /mailbox_path: mailboxPath/);
});
