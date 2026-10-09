import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

process.env.SUPABASE_URL ||= 'http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'teste-chave-local';

const require = createRequire(import.meta.url);
const { escolherGestorRegional } = require('../agentes-grm-sync/grm-sync-lancar-nhe.js');

// Gestores ativos em 09/10/2026 (cargo Supervisor/Coordenador, situacao Ativo).
const gestores = [
  { nome: 'JADSON TEIXEIRA SARAIVA', cargo: 'Supervisor', coordenacao: 'PARA', supervisao: 'PARA - Sul' },
  { nome: 'SERGIO LEANDRO BORCHARDT', cargo: 'Supervisor', coordenacao: 'RIO GRANDE DO SUL', supervisao: 'RIO GRANDE DO SUL - Norte' },
  { nome: 'DILMAR ANTONIO THOMET', cargo: 'Supervisor', coordenacao: 'RIO GRANDE DO SUL', supervisao: 'RIO GRANDE DO SUL - Norte' },
  { nome: 'ALEXANDRO LAMBERTES BRANDAO', cargo: 'Supervisor', coordenacao: 'RIO GRANDE DO SUL', supervisao: 'RIO GRANDE DO SUL - Palmeira das Missões' },
];

test('supervisao com Supervisor ativo continua usando o dele (sem marcar fora da regional)', () => {
  const g = escolherGestorRegional(gestores, 'PARA', 'PARA - Sul');
  assert.equal(g.nome, 'JADSON TEIXEIRA SARAIVA');
  assert.equal(g.foraDaRegional, undefined);
});

test('RS - Santa Rosa sem gestor ativo cai num gestor ativo da mesma Coordenacao, escolha estavel', () => {
  const g = escolherGestorRegional(gestores, 'RIO GRANDE DO SUL', 'RIO GRANDE DO SUL - Santa Rosa');
  assert.equal(g.nome, 'ALEXANDRO LAMBERTES BRANDAO');
  assert.equal(g.foraDaRegional, true);
  assert.equal(escolherGestorRegional([...gestores].reverse(), 'RIO GRANDE DO SUL', 'RIO GRANDE DO SUL - Cruz Alta').nome, g.nome);
});

test('PARA - Norte (coordenador inativo) usa o Supervisor ativo da Coordenacao PARA', () => {
  const g = escolherGestorRegional(gestores, 'PARA', 'PARA - Norte');
  assert.equal(g.nome, 'JADSON TEIXEIRA SARAIVA');
  assert.equal(g.foraDaRegional, true);
});

test('Coordenador ativo da Coordenacao tem prioridade sobre Supervisor no fallback', () => {
  const comCoord = [...gestores, { nome: 'ZELIA COORD', cargo: 'Coordenador', coordenacao: 'RIO GRANDE DO SUL', supervisao: 'RIO GRANDE DO SUL - Geral' }];
  const g = escolherGestorRegional(comCoord, 'RIO GRANDE DO SUL', 'RIO GRANDE DO SUL - Santa Rosa');
  assert.equal(g.nome, 'ZELIA COORD');
  assert.equal(g.foraDaRegional, undefined); // Coordenador da Coordenacao ja era o caminho antigo
});

test('Coordenacao sem nenhum gestor ativo continua sem gestor (fica FORA_DO_RAIO)', () => {
  assert.equal(escolherGestorRegional(gestores, 'MATO GROSSO MT9', 'MATO GROSSO MT9 - Geral'), null);
});
