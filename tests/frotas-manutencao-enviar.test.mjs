import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { htmlEnvio } from '../assets/js/modules/frotas-manutencao-enviar.js';

const ler = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('envio sem o módulo Manutenção: mostra o veículo, o problema e os itens do checklist, sem UF/cidade', () => {
  const html = htmlEnvio({ placa: 'ABC1D23', marca_modelo: 'Fiat Mobi' }, { descricao: 'Checklist: Freio (Falha)', itens: [{ descricao: 'Freio (Falha)' }], prioridade: 'alta' }, 'João');
  assert.match(html, /ABC1D23 · Fiat Mobi/);
  assert.match(html, /Checklist: Freio \(Falha\)/);
  assert.match(html, /<li>Freio \(Falha\)<\/li>/);
  assert.match(html, /value="João"/);
  assert.match(html, /<option value="alta" selected>/);
  assert.doesNotMatch(html, /UF|Cidade/);
});

test('quem não tem Manutenção envia o pedido em vez de ser levado para a tela de Manutenção', () => {
  const fonte = ler('assets/js/modules/frotas-manutencao.js');
  assert.match(fonte, /!temAcessoFrota\(opts\.auth, \['FROTAS_MANUTENCAO', 'MANUTENCAO'\]\)/);
  assert.match(fonte, /abrirEnvio\(opts, preset\)/);
});

test('o banco aceita o pedido de quem só tem Cadastros (Checklists / Veículos)', () => {
  const sql = ler('supabase/migrations/20261030150000_frotas_manutencao_solicitar_cadastros.sql');
  assert.match(sql, /painel_has_module\(array\['frotas_checklists', 'checklists', 'frotas_veiculos'/);
  assert.match(sql, /frotas_manutencao_solicitar\(\s*p_veiculo_id uuid/);
});
