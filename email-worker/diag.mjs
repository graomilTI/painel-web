import 'dotenv/config';
import { createDecipheriv, createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { ImapFlow } from 'imapflow';

const EMAIL_CREDENTIALS_KEY = process.env.EMAIL_CREDENTIALS_KEY || '';

function decryptCredential(value) {
  const encrypted = String(value || '');
  if (!encrypted.startsWith('enc:v1:')) return encrypted;
  const [, , ivBase64, payloadBase64] = encrypted.split(':');
  const payload = Buffer.from(payloadBase64, 'base64');
  const ciphertext = payload.subarray(0, -16);
  const authTag = payload.subarray(-16);
  const key = createHash('sha256').update(EMAIL_CREDENTIALS_KEY).digest();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivBase64, 'base64'));
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function main() {
  const { data: account, error } = await supabase.from('email_accounts').select('*').eq('ativo', true).limit(1).single();
  if (error) throw error;

  console.log('Conta:', account.email, '| pasta_entrada:', account.pasta_entrada || 'INBOX', '| ultima_uid salvo:', account.ultima_uid);

  const client = new ImapFlow({
    host: account.imap_host,
    port: account.imap_port,
    secure: account.imap_secure,
    auth: { user: account.username, pass: decryptCredential(account.password_cipher) },
    tls: { rejectUnauthorized: false },
    logger: false
  });

  await client.connect();
  const lock = await client.getMailboxLock(account.pasta_entrada || 'INBOX');
  try {
    console.log('Mailbox path:', client.mailbox.path);
    console.log('uidValidity:', client.mailbox.uidValidity.toString());
    console.log('uidNext:', client.mailbox.uidNext);
    console.log('exists (total de mensagens):', client.mailbox.exists);

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const uids = await client.search({ since: hoje }, { uid: true });
    console.log(`Mensagens desde ${hoje.toISOString()} (busca por data):`, uids.length);
    if (uids.length) console.log('UIDs encontrados:', uids.join(','));

    const lastUid = Number(account.ultima_uid || 0);
    const range = lastUid > 0 ? `${lastUid + 1}:*` : '1:*';
    console.log('Testando fetch igual ao worker.js, range:', range);
    let count = 0;
    for await (const item of client.fetch(range, { uid: true, source: true, envelope: true, flags: true }, { uid: true })) {
      count++;
      console.log(' ->', item.uid, '|', item.envelope?.date, '|', item.envelope?.subject, '| tamanho source:', item.source?.length);
    }
    console.log('Total retornado pelo fetch (range, igual produção):', count);

    console.log('--- Testando fetch individual por UID (com source) ---');
    for (const u of uids) {
      try {
        let got = 0;
        for await (const item of client.fetch(String(u), { uid: true, source: true, envelope: true, flags: true }, { uid: true })) {
          got++;
          console.log(' uid', u, '-> OK, tamanho source:', item.source?.length, '| assunto:', item.envelope?.subject);
        }
        if (!got) console.log(' uid', u, '-> NADA retornado (sem erro)');
      } catch (err) {
        console.log(' uid', u, '-> ERRO:', err.message);
      }
    }

    console.log('--- Testando fetch individual por UID (SEM source, só envelope) ---');
    for (const u of uids) {
      try {
        let got = 0;
        for await (const item of client.fetch(String(u), { uid: true, envelope: true, flags: true }, { uid: true })) {
          got++;
        }
        console.log(' uid', u, '-> envelope only:', got ? 'OK' : 'NADA');
      } catch (err) {
        console.log(' uid', u, '-> ERRO:', err.message);
      }
    }

    console.log('--- Testando fetch individual por UID (so flags, minimo possivel) ---');
    for (const u of uids) {
      try {
        let got = 0;
        for await (const item of client.fetch(String(u), { uid: true, flags: true }, { uid: true })) {
          got++;
        }
        console.log(' uid', u, '-> flags only:', got ? 'OK' : 'NADA');
      } catch (err) {
        console.log(' uid', u, '-> ERRO:', err.message);
      }
    }

    console.log('--- Testando fetch individual por UID (source + flags, SEM envelope) ---');
    for (const u of uids) {
      try {
        let got = 0;
        for await (const item of client.fetch(String(u), { uid: true, source: true, flags: true }, { uid: true })) {
          got++;
          console.log(' uid', u, '-> OK, tamanho source:', item.source?.length);
        }
        if (!got) console.log(' uid', u, '-> NADA retornado (sem erro)');
      } catch (err) {
        console.log(' uid', u, '-> ERRO:', err.message);
      }
    }

    console.log('--- Testando fetch em RANGE (source + flags, SEM envelope) ---');
    let count2 = 0;
    for await (const item of client.fetch(range, { uid: true, source: true, flags: true }, { uid: true })) {
      count2++;
      console.log(' ->', item.uid, '| tamanho source:', item.source?.length);
    }
    console.log('Total retornado pelo fetch em range (sem envelope):', count2);
  } finally {
    lock.release();
    await client.logout();
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('Erro no diagnóstico:', err);
  process.exit(1);
});
