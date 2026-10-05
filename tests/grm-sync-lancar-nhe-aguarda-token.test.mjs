import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const aqui = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_NHE = path.join(aqui, '..', 'agentes-grm-sync', 'grm-sync-lancar-nhe.js');
const CACHE_JS = path.join(aqui, '..', 'agentes-grm-sync', 'grm-token-cache.js');

function jwt(expSegundos) {
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${b64({ alg: 'HS256' })}.${b64({ exp: expSegundos })}.assinatura`;
}

// grm-token-cache lê o diretório e o usuário na carga do módulo: cada cenário usa um processo/env próprio.
function carregarCache(dir, extraEnv = {}) {
  const guardado = { ...process.env };
  Object.assign(process.env, { GRM_TOKEN_CACHE_DIR: dir, GRMSERVER_USER: 'teste-nhe', GRM_TOKEN_CACHE: '' }, extraEnv);
  delete require.cache[require.resolve(CACHE_JS)];
  const modulo = require(CACHE_JS);
  return { modulo, restaurar: () => { for (const k of Object.keys(process.env)) if (!(k in guardado)) delete process.env[k]; Object.assign(process.env, guardado); } };
}

// o cache nomeia o arquivo pelo hash (sha1, 12 primeiros hex) de GRMSERVER_USER
const NOME_TOKEN = `.grm-token-${createHash('sha1').update('teste-nhe').digest('hex').slice(0, 12)}.json`;

function arquivoDoToken(dir) {
  return fs.readdirSync(dir).map((n) => path.join(dir, n)).find((f) => path.basename(f).startsWith('.grm-token-'));
}

function dirTemp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'grm-token-')); }

test('sem token em cache nao ha token valido', async () => {
  const dir = dirTemp();
  const { modulo, restaurar } = carregarCache(dir);
  try {
    assert.equal(await modulo.tokenGrmEmCacheValido({ validar: async () => true }), false);
  } finally { restaurar(); }
});

test('token em cache dentro da validade e aceito pelo GRM vale', async () => {
  const dir = dirTemp();
  const { modulo, restaurar } = carregarCache(dir);
  try {
    fs.writeFileSync(path.join(dir, NOME_TOKEN), JSON.stringify({ token: jwt(Math.floor(Date.now() / 1000) + 3600), savedAt: Date.now() }));
    assert.equal(await modulo.tokenGrmEmCacheValido({ validar: async () => true }), true);
  } finally { restaurar(); }
});

test('token expirado nao vale e e apagado do cache', async () => {
  const dir = dirTemp();
  const { modulo, restaurar } = carregarCache(dir);
  try {
    fs.writeFileSync(path.join(dir, NOME_TOKEN), JSON.stringify({ token: jwt(Math.floor(Date.now() / 1000) - 60), savedAt: Date.now() - 86400000 }));
    assert.equal(await modulo.tokenGrmEmCacheValido({ validar: async () => true }), false);
    assert.equal(arquivoDoToken(dir), undefined);
  } finally { restaurar(); }
});

test('token recusado pelo GRM nao vale', async () => {
  const dir = dirTemp();
  const { modulo, restaurar } = carregarCache(dir);
  try {
    fs.writeFileSync(path.join(dir, NOME_TOKEN), JSON.stringify({ token: jwt(Math.floor(Date.now() / 1000) + 3600), savedAt: Date.now() }));
    assert.equal(await modulo.tokenGrmEmCacheValido({ validar: async () => false }), false);
  } finally { restaurar(); }
});

test('GRM_TOKEN_CACHE=off nao exige token em cache', async () => {
  const dir = dirTemp();
  const { modulo, restaurar } = carregarCache(dir, { GRM_TOKEN_CACHE: 'off' });
  try {
    assert.equal(await modulo.tokenGrmEmCacheValido({ validar: async () => false }), true);
  } finally { restaurar(); }
});

test('agente NHE sem token adia: sai 0 com o marcador e sem tocar no Supabase', () => {
  const dir = dirTemp();
  const r = spawnSync(process.execPath, [SCRIPT_NHE], {
    encoding: 'utf8',
    timeout: 60000,
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      // se o agente chegasse a falar com o Supabase, falharia (porta fechada) e sairia com 1
      SUPABASE_URL: 'http://127.0.0.1:9',
      SUPABASE_SERVICE_ROLE_KEY: 'teste',
      GRMSERVER_USER: 'teste-nhe',
      GRMSERVER_PASSWORD: 'teste',
      GRM_TOKEN_CACHE_DIR: dir,
    },
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /\[NHE_AGUARDANDO_TOKEN\]/);
  assert.doesNotMatch(r.stdout, /Recalculando|pendente\(s\)|ERROR/);
});
