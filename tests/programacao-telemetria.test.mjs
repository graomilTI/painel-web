import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { criarTelemetria } from '../assets/js/programacao-telemetria.js';

// Telemetria TEMPORÁRIA (15/10/2026): conta quais funções de renderContent() executam em produção.
// Apagar este arquivo junto com assets/js/programacao-telemetria.js quando a coleta terminar.

const nova = (extra = {}) => {
  const linhas = [];
  const t = criarTelemetria({ versao: 'v-teste', inserir: (l) => { linhas.push(l); }, primeiroEnvioMs: 5, intervaloMs: 5, ...extra });
  return { t, linhas };
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

test('envolver preserva retorno, argumentos e this', () => {
  const { t } = nova();
  const objeto = { base: 10, somar(a, b) { return this.base + a + b; } };
  objeto.somar = t.envolver('somar', objeto.somar);
  assert.equal(objeto.somar(1, 2), 13);
});

test('envolver preserva funções assíncronas e erros', async () => {
  const { t } = nova();
  const ok = t.envolver('ok', async (x) => x * 2);
  assert.equal(await ok(4), 8);
  const falha = t.envolver('falha', () => { throw new Error('original'); });
  assert.throws(() => falha(), /original/);
  const rejeita = t.envolver('rejeita', async () => { throw new Error('assíncrono'); });
  await assert.rejects(rejeita(), /assíncrono/);
});

test('conta as chamadas e envia só o que mudou desde o último envio', async () => {
  const { t, linhas } = nova();
  const a = t.envolver('a', () => 1);
  const b = t.envolver('b', () => 2);
  a(); a(); b();
  t.enviar();
  assert.equal(linhas.length, 1);
  assert.deepEqual(linhas[0].funcoes, { a: 2, b: 1 });
  assert.equal(linhas[0].versao, 'v-teste');
  assert.ok(linhas[0].sessao);
  t.enviar(); // nada novo: não envia linha vazia
  assert.equal(linhas.length, 1);
  a();
  t.enviar();
  assert.deepEqual(linhas[1].funcoes, { a: 1 });
  assert.equal(linhas[1].sessao, linhas[0].sessao, 'mesma sessão em todos os envios');
});

test('envia sozinho depois do primeiro intervalo', async () => {
  const { t, linhas } = nova();
  t.envolver('x', () => 0)();
  assert.equal(linhas.length, 0);
  await esperar(40);
  assert.equal(linhas.length, 1);
  assert.deepEqual(linhas[0].funcoes, { x: 1 });
});

test('respeita o limite de envios por sessão', () => {
  const { t, linhas } = nova({ maxEnvios: 2 });
  const f = t.envolver('f', () => 0);
  for (let i = 0; i < 5; i++) { f(); t.enviar(); }
  assert.equal(linhas.length, 2);
});

test('falha ao enviar (síncrona ou assíncrona) nunca chega à tela', async () => {
  const sincrona = criarTelemetria({ versao: 'v', inserir: () => { throw new Error('banco fora'); } });
  const f1 = sincrona.envolver('f1', () => 'ok');
  assert.equal(f1(), 'ok');
  assert.doesNotThrow(() => sincrona.enviar());
  const assincrona = criarTelemetria({ versao: 'v', inserir: () => Promise.reject(new Error('rede')) });
  const f2 = assincrona.envolver('f2', () => 'ok2');
  assert.equal(f2(), 'ok2');
  assert.doesNotThrow(() => assincrona.enviar());
  await esperar(10); // sem rejeição não tratada
});

// ---- o bloco de programacao.js ----
const fonte = readFileSync(new URL('../assets/js/programacao.js', import.meta.url), 'utf8');

test('o bloco de telemetria envolve TODAS as funções de primeiro nível de renderContent', () => {
  // Enquanto a telemetria existir, uma função nova sem contador deixaria um ponto cego na análise.
  const inicio = fonte.indexOf('export function renderContent');
  assert.ok(inicio > 0);
  const corpo = fonte.slice(inicio);
  const declaradas = [...corpo.matchAll(/^ {2}(?:async )?function (\w+)\(/gm)].map((m) => m[1]);
  const bloco = corpo.slice(corpo.indexOf('TELEMETRIA TEMPORÁRIA'), corpo.indexOf('eslint-enable no-func-assign'));
  const envolvidas = [...bloco.matchAll(/^ {4}(\w+) = tm\.envolver\('(\w+)', (\w+)\);$/gm)];
  assert.ok(envolvidas.length > 50, `esperava dezenas de funções envolvidas, achei ${envolvidas.length}`);
  for (const [, esquerda, nome, direita] of envolvidas) assert.ok(esquerda === nome && nome === direita, `linha inconsistente para ${nome}`);
  const nomesEnvolvidos = new Set(envolvidas.map((m) => m[1]));
  const faltando = declaradas.filter((n) => !nomesEnvolvidos.has(n));
  assert.deepEqual(faltando, [], `funções sem telemetria: ${faltando.join(', ')}`);
  const inexistentes = [...nomesEnvolvidos].filter((n) => !declaradas.includes(n));
  assert.deepEqual(inexistentes, [], `telemetria de funções que não existem mais: ${inexistentes.join(', ')}`);
});

test('o bloco fica imediatamente antes de init() (as funções são envolvidas antes de qualquer uso)', () => {
  const posBloco = fonte.indexOf('eslint-enable no-func-assign');
  const posInit = fonte.indexOf('\n  init();\n');
  assert.ok(posBloco > 0 && posInit > posBloco, 'init() deve vir depois do bloco');
  assert.equal(fonte.slice(posBloco, posInit).split('\n').filter((l) => l.trim() && !l.includes('eslint-enable')).length, 0, 'nada entre o bloco e init()');
});
