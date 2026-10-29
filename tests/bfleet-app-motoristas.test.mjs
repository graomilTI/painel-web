import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aparelhosDoRelatorio, chaveNome, lerArrayLiteral } from '../supabase/functions/_shared/bfleet-relatorio-regras.js';

// Frotas > Motoristas > App: o relatório "Equipamentos sem relatório" (OnReports) é lido pelo portal web e os celulares
// com o app (ID Android de 16 hex) são casados com o motorista pelo nome completo.

const RESPOSTA = "[['ASC8F72 ','16255ceec7c17054','2026-10-26 09:45:16',' 3 dias, 6 hrs.','2026-10-26 10:45:23'],"
  + "['GOL 1.0L MC4 - BED6F03','868022031225605','2026-10-29 16:01:43',' 13 min, 35 seg.','2026-10-29 16:13:09'],"
  + "['edevaldo Sampaio','66df3d59ecf2bf95','2026-03-10 16:14:10','7 months, 1 sem.','2026-03-10 16:14:15'],"
  + "['Antonio  Henrique  Alves de Souza','306c4c9bbab6c3db','2026-03-14 12:29:10','7 months,  .','2026-03-14 12:29:16'],"
  + String.raw`['O\'Brien','abcdef0123456789','2026-03-14 12:29:10','x','sem data']]`;

test('lerArrayLiteral lê o array JavaScript do portal sem executar nada', () => {
  const linhas = lerArrayLiteral(RESPOSTA);
  assert.equal(linhas.length, 5);
  assert.deepEqual(linhas[2], ['edevaldo Sampaio', '66df3d59ecf2bf95', '2026-03-10 16:14:10', '7 months, 1 sem.', '2026-03-10 16:14:15']);
  assert.equal(linhas[4][0], "O'Brien");
  assert.deepEqual(lerArrayLiteral('[]'), []);
  assert.deepEqual(lerArrayLiteral("[['a',1,null,true]]"), [['a', 1, null, true]]);
});

test('lerArrayLiteral recusa o que não é só array de valores simples', () => {
  assert.equal(lerArrayLiteral('{"a":1}'), null);
  assert.equal(lerArrayLiteral('Page not found 404'), null);
  assert.equal(lerArrayLiteral("[['a','b']"), null);
  assert.equal(lerArrayLiteral("[process.exit(1)]"), null);
  assert.equal(lerArrayLiteral("[(()=>1)()]"), null);
  assert.equal(lerArrayLiteral("[['a']] ; alert(1)"), null);
  assert.equal(lerArrayLiteral("[['sem fim]]"), null);
});

test('aparelhosDoRelatorio separa celulares (não 15 dígitos) e ignora rastreador e veículo com app', () => {
  const aparelhos = aparelhosDoRelatorio(lerArrayLiteral(RESPOSTA));
  assert.deepEqual(aparelhos.map((a) => a.ativo), ['edevaldo Sampaio', 'Antonio Henrique Alves de Souza', "O'Brien"]);
  assert.equal(aparelhos[0].equipo, '66df3d59ecf2bf95');
  assert.equal(aparelhos[0].ultima_conexao, '2026-03-10 16:14:15');
  assert.equal(aparelhos[2].ultima_conexao, null);
  assert.equal(aparelhos[2].atraso, 'x');
});

test('aparelhosDoRelatorio: o mesmo celular repetido vira um só e entrada inválida não quebra', () => {
  const l = [['Ana Lima', 'aaaaaaaaaaaaaaaa', '', '', ''], ['Ana Lima Silva', 'aaaaaaaaaaaaaaaa', '', '', ''], null, ['só um'], ['', 'bbbbbbbbbbbbbbbb']];
  const r = aparelhosDoRelatorio(l);
  assert.equal(r.length, 1);
  assert.equal(r[0].ativo, 'Ana Lima Silva');
  assert.deepEqual(aparelhosDoRelatorio(null), []);
});

test('chaveNome ignora acento, caixa, pontuação e espaços repetidos, mas exige o nome completo', () => {
  assert.equal(chaveNome('  José  da Silva-Júnior '), 'jose da silva junior');
  assert.equal(chaveNome('JOSE DA SILVA JUNIOR'), chaveNome('José da Silva Júnior'));
  assert.notEqual(chaveNome('Elias'), chaveNome('Elias Luiz da Silva Alexandre'));
});

test('a tela de Motoristas casa pelo nome completo e mostra App como coluna própria', () => {
  const src = readFileSync(new URL('../assets/js/modules/frotas-motoristas.js', import.meta.url), 'utf8');
  assert.match(src, /from\('frotas_bfleet_apps'\)/);
  assert.match(src, /state\.apps\.get\(chaveNome\(m\.nome\)\)/);
  assert.match(src, /key: 'sem_app'/);
  assert.match(src, /key: 'com_app'/);
  // a chave de nome da tela é a mesma das regras do servidor
  const noModulo = src.match(/function chaveNome\(v\)\{ return norm\(v\)\.replace\(\/\[\^a-z0-9\]\+\/g,' '\)\.trim\(\); \}/);
  assert.ok(noModulo, 'chaveNome da tela mudou: confira se ainda é igual à das regras');
});

test('o sync agenda, protege a chamada e não apaga celulares que sumirem do relatório', () => {
  const fn = readFileSync(new URL('../supabase/functions/sync-bfleet-app-motoristas/index.ts', import.meta.url), 'utf8');
  assert.match(fn, /authorizeRequest\(req, \["frotas"\]\)/);
  assert.match(fn, /bearer === serviceKey/);
  assert.doesNotMatch(fn, /\.delete\(/);
  const mig = readFileSync(new URL('../supabase/migrations/20261029210000_frotas_bfleet_apps.sql', import.meta.url), 'utf8');
  assert.match(mig, /enable row level security/);
  assert.match(mig, /\(select public\.frotas_usuario_tem_acesso\(\)\)/);
  assert.match(mig, /cron\.schedule\(\s*'sync-bfleet-app-motoristas'/);
});
