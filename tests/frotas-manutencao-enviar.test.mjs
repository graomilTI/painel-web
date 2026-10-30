import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { descricaoDoPedido, htmlEnvio } from '../assets/js/modules/frotas-manutencao-enviar.js';

const ler = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('janela de envio: placa, veículo, solicitante e motorista à vista; a descrição vem vazia (quem envia digita) e o checklist é referência', () => {
  const html = htmlEnvio({ placa: 'ABC1D23', marca_modelo: 'Fiat Mobi' }, { referencia: 'Checklist de 28/10: Freio (Falha)', itens: [{ descricao: 'Freio (Falha)' }], prioridade: 'alta' }, { usuario: 'Maria', motorista: 'João' });
  assert.match(html, /<b>Placa<\/b>ABC1D23/);
  assert.match(html, /<b>Veículo<\/b>Fiat Mobi/);
  assert.match(html, /<b>Solicitante<\/b>Maria/);
  assert.match(html, /<b>Motorista<\/b>João/);
  assert.match(html, /<textarea[^>]*data-e-descricao[^>]*><\/textarea>/, 'descrição vazia');
  assert.match(html, /Checklist de 28\/10: Freio \(Falha\)/);
  assert.match(html, /<option value="alta" selected>/);
  assert.doesNotMatch(html, /UF|Cidade/);
});

test('a descrição do cartão é o que a pessoa escreveu, com a condição do checklist embaixo', () => {
  assert.equal(descricaoDoPedido('  Pneu careca ', 'Checklist: pneu (Atenção)'), 'Pneu careca\n\nChecklist: pneu (Atenção)');
  assert.equal(descricaoDoPedido('Pneu careca'), 'Pneu careca');
});

test('Enviar para manutenção (Checklist) cria o pedido para todos, sem abrir a tela de Manutenção; sem o módulo, abrirNova também envia', () => {
  const fonte = ler('assets/js/modules/frotas-manutencao.js');
  assert.match(fonte, /enviarPedido = async \(opts, preset = \{\}, \{ aoEnviar \} = \{\}\)/);
  assert.match(fonte, /!temAcessoFrota\(opts\.auth, \['FROTAS_MANUTENCAO', 'MANUTENCAO'\]\)/);
  assert.match(ler('assets/js/modules/frotas-checklist-app.js'), /FROTAS_MANUTENCAO\.enviarPedido\(state\.opts, preset, \{ aoEnviar/);
  assert.match(ler('assets/js/modules/frotas-checklists.js'), /FROTAS_MANUTENCAO\.enviarPedido\(opts, preset\)/);
});

test('o banco aceita o pedido de quem só tem Cadastros e grava o motorista', () => {
  const sql = ler('supabase/migrations/20261030150000_frotas_manutencao_solicitar_cadastros.sql');
  assert.match(sql, /painel_has_module\(array\['frotas_checklists', 'checklists', 'frotas_veiculos'/);
  assert.match(sql, /p_motorista_nome text default null/);
  assert.match(sql, /solicitante_nome, motorista_nome\)/);
});

test('pedido em Solicitações: o cartão mostra solicitante, motorista, placa/veículo e a descrição (escapados)', async () => {
  const { htmlCard } = await import('../assets/js/modules/frotas-manutencao-cards.js');
  const m = { id: 'm1', numero: 7, status: 'solicitada', solicitante_nome: 'Maria', motorista_nome: 'João', __placa: 'ABC1D23', __modelo: 'Fiat Mobi', descricao: 'Freio <img src=x> ruidoso', linha_tempo: [] };
  const html = htmlCard(m, { itensPorManut: new Map(), orcsPorManut: new Map(), notasPorManut: new Map(), base: {}, etapa: 'solicitacoes', aberto: null, podeAprovar: true });
  assert.match(html, /<b>Solicitante<\/b> Maria/);
  assert.match(html, /<b>Motorista<\/b> João/);
  assert.match(html, /<b>Veículo<\/b> ABC1D23 · Fiat Mobi/);
  assert.match(html, /Freio &lt;img src=x&gt; ruidoso/);
  assert.doesNotMatch(htmlCard({ ...m, status: 'em_orcamento' }, { itensPorManut: new Map(), orcsPorManut: new Map(), notasPorManut: new Map(), base: {}, etapa: 'cotacoes', aberto: null, podeAprovar: true }), /fm-mc-resumo/);
});
