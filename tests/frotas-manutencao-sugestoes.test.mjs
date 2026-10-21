import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sugerirItens } from '../assets/js/modules/frotas-manutencao-sugestoes.js';

// Sugestão de itens pela descrição do problema (regras de palavras, sem IA): só sugere, quem registra marca.

const grupo = (codigo, nome) => ({ codigo, nome, categoria_codigo: codigo });
const comp = (grupo_codigo, nome, tipo = 'peca') => ({ grupo_codigo, categoria_codigo: grupo_codigo, nome, tipo, ordem: 1 });
const base = {
  categorias: [],
  grupos: [grupo(1, 'Pneus, alinhamento e balanceamento'), grupo(2, 'Freios'), grupo(3, 'Suspensão e direção'), grupo(4, 'Óleo e filtros'), grupo(5, 'Transmissão e embreagem'), grupo(6, 'Ar-condicionado')],
  componentes: [
    comp(1, 'Pneus (novos ou recapados)'), comp(1, 'Geometria / alinhamento de direção', 'servico'),
    comp(2, 'Pastilha de freio'), comp(2, 'Disco de freio'), comp(2, 'Fluido de freio'), comp(2, 'Freio de mão (cabo)'),
    comp(3, 'Amortecedor'), comp(3, 'Bieleta'),
    comp(4, 'Óleo do motor'), comp(4, 'Filtro de óleo'), comp(4, 'Filtro de ar'),
    comp(5, 'Kit de embreagem (disco, platô e rolamento)'), comp(5, 'Óleo e fluido do câmbio'),
    comp(6, 'Filtro de cabine'), comp(6, 'Compressor'),
  ],
};
const nomes = (r) => r.itens.map((i) => i.nome);

test('cita a peça e ela vem sugerida, com o grupo', () => {
  const r = sugerirItens(base, 'Trocar as pastilhas e o disco dianteiro');
  assert.ok(nomes(r).includes('Pastilha de freio'));
  assert.ok(nomes(r).includes('Disco de freio'));
  assert.equal(r.itens.find((i) => i.nome === 'Pastilha de freio').grupoNome, 'Freios');
});

test('o disco de embreagem não vem de graça com o freio: só o que o nome do item cita', () => {
  const r = sugerirItens(base, 'Barulho na embreagem ao trocar a marcha');
  assert.ok(nomes(r).includes('Kit de embreagem (disco, platô e rolamento)'));
  assert.ok(!nomes(r).includes('Pastilha de freio'));
});

test('sem peça citada, o apelido sugere abrir o grupo (barulho ao frear → Freios)', () => {
  const r = sugerirItens(base, 'Barulho ao frear');
  assert.deepEqual(r.itens, []);
  assert.deepEqual(r.grupos.map((g) => g.nome), ['Freios']);
});

test('apelidos de outros grupos: amortecedor batendo, ar gelando, furou o pneu, óleo vazando', () => {
  const grupos = (t) => sugerirItens({ ...base, componentes: [] }, t).grupos.map((g) => g.nome);
  assert.deepEqual(grupos('suspensão batendo em buraco'), ['Suspensão e direção']);
  assert.deepEqual(grupos('o ar condicionado não está gelando'), ['Ar-condicionado']);
  assert.deepEqual(grupos('furou o pneu dianteiro'), ['Pneus, alinhamento e balanceamento']);
  assert.deepEqual(grupos('óleo vazando do motor'), ['Óleo e filtros']);
});

test('o grupo que já tem item sugerido não repete como "abrir grupo"', () => {
  const r = sugerirItens(base, 'barulho ao frear, trocar pastilha');
  assert.ok(nomes(r).includes('Pastilha de freio'));
  assert.deepEqual(r.grupos, []);
});

test('plural, acento e caixa não atrapalham; texto curto ou vazio não sugere nada', () => {
  assert.ok(nomes(sugerirItens(base, 'AMORTECEDORES TRASEIROS')).includes('Amortecedor'));
  assert.ok(nomes(sugerirItens(base, 'Filtros de óleo e de ar')).includes('Filtro de óleo'));
  assert.deepEqual(sugerirItens(base, ''), { itens: [], grupos: [] });
  assert.deepEqual(sugerirItens(base, 'ok'), { itens: [], grupos: [] });
  assert.deepEqual(sugerirItens(base, 'revisão do veículo e conserto do carro'), { itens: [], grupos: [] }, 'palavras genéricas não sugerem item');
});

test('mais palavras do nome batem, mais perto do topo; respeita o limite', () => {
  const r = sugerirItens(base, 'pastilha de freio gasta');
  assert.equal(r.itens[0].nome, 'Pastilha de freio');
  assert.ok(sugerirItens(base, 'filtro freio óleo disco pastilha fluido', { max: 3 }).itens.length <= 3);
});

test('sem grupos cadastrados, cai nas categorias e sugere só o grupo', () => {
  const r = sugerirItens({ categorias: [{ codigo: 9, nome: 'Freios', ativo: true }], grupos: [], componentes: [] }, 'barulho ao frear');
  assert.deepEqual(r.grupos.map((g) => g.nome), ['Freios']);
});

test('a nova manutenção mostra as sugestões e o seletor deixa marcar por fora', () => {
  const ler = (c) => readFileSync(new URL(`../${c}`, import.meta.url), 'utf8');
  assert.match(ler('assets/js/modules/frotas-manutencao-html.js'), /data-sugestoes/);
  assert.match(ler('assets/js/modules/frotas-manutencao.js'), /sugerirItens\(/);
  assert.match(ler('assets/js/modules/frotas-manutencao-seletor.js'), /marcar\(cod, nome\)/);
});
