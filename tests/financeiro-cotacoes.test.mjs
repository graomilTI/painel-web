import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const ler = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// Financeiro > Cotações: pedidos de aprovação de cotação vindos de Compras.

test('o menu Financeiro tem Cotações, com rota e página', () => {
  assert.match(ler('assets/js/menuConfig.js'), /item\("financeiro_cotacoes", "Cotações", "financeiro-cotacoes"/);
  assert.match(ler('assets/js/router.js'), /\['financeiro-cotacoes', \{ title: 'Cotações', module: \(\) => import\('\.\/financeiroCotacoes\.js\?v=/);
  assert.ok(existsSync(new URL('../financeiro-cotacoes.html', import.meta.url)));
  assert.match(ler('financeiro-cotacoes.html'), /financeiroCotacoes\.js\?v=/);
});

test('a lista mostra código, data, solicitante e as ações visualizar, aprovar e recusar', () => {
  const js = ler('assets/js/financeiroCotacoes.js');
  assert.match(js, /<th>Código<\/th><th>Data<\/th><th>Solicitante<\/th><th>Ações<\/th>/);
  assert.match(js, /data-fc-ver/);
  assert.match(js, /data-fc-aprovar/);
  assert.match(js, /data-fc-recusar/);
  // aprovar e recusar só para o que ainda está pendente
  assert.match(js, /r\.status === 'pendente'\s*\n?\s*\?/);
  // decisão pela RPC (atômica com o status dos itens)
  assert.match(js, /rpc\('compras_decidir_aprovacao'/);
});

test('Compras pede a aprovação pela RPC, só de itens já cotados', () => {
  const js = ler('assets/js/adm-compras.js');
  assert.match(js, /rpc\('compras_solicitar_aprovacao'/);
  assert.match(js, /Só dá para pedir aprovação de itens já cotados/);
  assert.match(js, /situacaoDoItem\(r\.id,state\.cotacaoInfo\)\.codigo==='respostas'\?iconBtn\('aprovar_solicitar'/);
});

test('o código do pedido segue letra do setor + mês + sequência do mês (ex.: COUT23)', () => {
  const sql = ler('supabase/migrations/20261023180000_compras_aprovacao_cotacao.sql');
  assert.match(sql, /array\['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'\]/);
  assert.match(sql, /v_cod := v_letra \|\| v_mes_abrev \|\| lpad\(v_contador::text, 2, '0'\)/);
  assert.match(sql, /values \('APR-' \|\| v_letra, v_ano, v_mes, 1\)/); // contador por setor e mês
  assert.match(sql, /revoke all on function public\.compras_solicitar_aprovacao/);
});

test('o Financeiro escolhe o fornecedor ao aprovar (um que respondeu ou outro informado à mão)', () => {
  const js = ler('assets/js/financeiroCotacoes.js');
  assert.match(js, /name="fcForn"/);
  assert.match(js, /Outro fornecedor \(informar\)/);
  assert.match(js, /Escolha o fornecedor antes de aprovar/);
  assert.match(js, /p_fornecedor_nome: escolha\?\.nome/);
  const sql = ler('supabase/migrations/20261023190000_compras_aprovacao_fornecedor_escolhido.sql');
  assert.match(sql, /raise exception 'Informe o fornecedor escolhido\.'/);
  assert.match(sql, /add column if not exists fornecedor_nome text/);
});

test('Compras destaca o fornecedor aprovado pelo Financeiro', () => {
  const js = ler('assets/js/adm-compras.js');
  assert.match(js, /Comprar do fornecedor aprovado/);
  assert.match(js, /Aprovado pelo Financeiro \(\$\{esc\(aprovado\.codigo\)\}\)/);
});

test('o código do pedido usa sempre C de Compras, qualquer que seja o setor de quem pede', () => {
  const sql = ler('supabase/migrations/20261023200000_compras_aprovacao_codigo_sempre_c.sql');
  assert.match(sql, /v_letra text := 'C';/);
  assert.doesNotMatch(sql, /left\(coalesce\(nullif\(trim\(p_setor\)/);
  assert.match(sql, /set codigo = 'C' \|\| substr\(a\.codigo, 2\)/);
});
