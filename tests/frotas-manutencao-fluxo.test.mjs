import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  FILTROS, TRANSICOES, acoesDisponiveis, bateFiltro, camposEditaveis, codigoManutencao, contarPorFiltro, descreverIntervalo,
  filtrarManutencoes, numeroOuNulo, pendenciasPara, validarConclusao, validarOrcamento, validarSolicitacao, valorDaManutencao,
} from '../assets/js/modules/frotas-manutencao-regras.js';
import { htmlFicha, htmlFormNova, htmlKpis, htmlLinhas } from '../assets/js/modules/frotas-manutencao-html.js';

// Fluxo de manutenção (solicitação → orçamento → aprovação → OS → conclusão). As regras da tela espelham o trigger
// frotas_manutencoes_fluxo; quem decide é o banco, aqui se evita oferecer o que ele recusaria.

const m = (extra = {}) => ({ id: 'm1', numero: 7, veiculo_id: 'v1', status: 'solicitada', natureza: 'corretiva', responsavel_pagamento: 'empresa', descricao: 'Freio com ruído', __placa: 'ABC1D23', __modelo: 'Fiat Strada', ...extra });
const item = { id: 'i1', manutencao_id: 'm1', categoria_codigo: 9, descricao: 'Pastilhas' };
const orc = (extra = {}) => ({ id: 'o1', manutencao_id: 'm1', fornecedor: 'Oficina A', valor_total: 750, selecionado: false, ...extra });
const ids = (acoes) => acoes.map((a) => a.id);

test('as transições espelham as do banco', () => {
  assert.deepEqual(TRANSICOES.solicitada, ['em_orcamento', 'aprovada', 'cancelada']);
  assert.deepEqual(TRANSICOES.em_aprovacao, ['aprovada', 'reprovada', 'em_orcamento', 'cancelada']);
  assert.deepEqual(TRANSICOES.concluida, []);
  assert.deepEqual(TRANSICOES.cancelada, []);
});

test('cada etapa oferece só ações que levam a uma transição válida', () => {
  for (const status of Object.keys(TRANSICOES)) {
    for (const a of acoesDisponiveis(m({ status }), { podeAprovar: true, itens: [item], orcamentos: [orc({ selecionado: true })] })) {
      assert.ok(TRANSICOES[status].includes(a.para), `${status} → ${a.para} (${a.id}) não existe no banco`);
    }
  }
  assert.deepEqual(acoesDisponiveis(m({ status: 'concluida' })), []);
  assert.deepEqual(acoesDisponiveis(m({ status: 'cancelada' })), []);
});

test('aprovar exige aprovador, orçamento escolhido, natureza, responsável e itens', () => {
  const emAprovacao = m({ status: 'em_aprovacao' });
  const aprovar = (ctx, mm = emAprovacao) => acoesDisponiveis(mm, ctx).find((a) => a.id === 'aprovar');
  assert.match(aprovar({ podeAprovar: false, itens: [item], orcamentos: [orc({ selecionado: true })] }).bloqueio, /aprovadores/);
  assert.match(aprovar({ podeAprovar: true, itens: [item], orcamentos: [orc()] }).bloqueio, /Escolha o orçamento/);
  assert.match(aprovar({ podeAprovar: true, itens: [], orcamentos: [orc({ selecionado: true })] }).bloqueio, /ao menos um item/);
  assert.match(aprovar({ podeAprovar: true, itens: [item], orcamentos: [orc({ selecionado: true })] }, m({ status: 'em_aprovacao', natureza: null })).bloqueio, /natureza/);
  assert.match(aprovar({ podeAprovar: true, itens: [item], orcamentos: [orc({ selecionado: true })] }, m({ status: 'em_aprovacao', responsavel_pagamento: null })).bloqueio, /quem paga/);
  assert.equal(aprovar({ podeAprovar: true, itens: [item], orcamentos: [orc({ selecionado: true })] }).bloqueio, null);
});

test('enviar para aprovação precisa de orçamento; aprovar sem orçamento só para aprovador', () => {
  const emOrc = m({ status: 'em_orcamento' });
  const enviar = (orcamentos) => acoesDisponiveis(emOrc, { podeAprovar: false, itens: [item], orcamentos }).find((a) => a.id === 'enviar_aprovacao');
  assert.match(enviar([]).bloqueio, /orçamento/);
  assert.equal(enviar([orc()]).bloqueio, null);
  const sem = acoesDisponiveis(m(), { podeAprovar: false, itens: [item] }).find((a) => a.id === 'aprovar_sem_orcamento');
  assert.match(sem.bloqueio, /aprovadores/);
  assert.equal(sem.formulario, 'sem_orcamento');
});

test('reprovar e cancelar pedem motivo; concluir abre o formulário de conclusão', () => {
  const emAprov = acoesDisponiveis(m({ status: 'em_aprovacao' }), { podeAprovar: true, itens: [item], orcamentos: [orc({ selecionado: true })] });
  assert.equal(emAprov.find((a) => a.id === 'reprovar').exigeMotivo, true);
  assert.equal(emAprov.find((a) => a.id === 'cancelar').exigeMotivo, true);
  assert.equal(acoesDisponiveis(m({ status: 'em_execucao' }), {}).find((a) => a.id === 'concluir').formulario, 'conclusao');
  assert.deepEqual(ids(acoesDisponiveis(m({ status: 'reprovada' }), {})), ['reabrir_orcamento', 'cancelar']);
  assert.deepEqual(ids(acoesDisponiveis(m({ status: 'aprovada' }), {})), ['emitir_os', 'cancelar']);
});

test('pendências para aprovar listam o que falta, na ordem do trigger', () => {
  const p = pendenciasPara(m({ natureza: null, responsavel_pagamento: null }), 'aprovada', { itens: [], orcamentos: [] });
  assert.equal(p.length, 3);
  assert.match(p[0], /natureza/); assert.match(p[1], /quem paga/); assert.match(p[2], /item/);
  assert.deepEqual(pendenciasPara(m(), 'em_orcamento', {}), []);
});

test('campos editáveis por etapa: orçamento só antes da aprovação, nada depois de encerrar', () => {
  assert.equal(camposEditaveis('em_orcamento').orcamentos, true);
  assert.equal(camposEditaveis('aprovada').orcamentos, false);
  assert.equal(camposEditaveis('em_execucao').itens, true);
  assert.deepEqual(camposEditaveis('concluida'), { cabecalho: false, itens: false, orcamentos: false, execucao: false });
  assert.equal(camposEditaveis('cancelada').cabecalho, false);
});

test('filtros da lista e contagem por cartão', () => {
  const lista = ['solicitada', 'em_orcamento', 'aprovada', 'em_execucao', 'concluida', 'reprovada', 'cancelada'].map((status, i) => m({ id: `m${i}`, status }));
  const c = contarPorFiltro(lista);
  assert.equal(c.abertas, 4);
  assert.equal(c.sem_servico, 2);
  assert.equal(c.concluida, 1);
  assert.equal(c.todos, 7);
  assert.equal(bateFiltro(m({ status: 'reprovada' }), 'abertas'), false);
  assert.equal(FILTROS.find((f) => f.id === 'todos') !== undefined, true);
});

test('busca encontra por placa, código, categoria e descrição do item', () => {
  const lista = [m({ id: 'a' }), m({ id: 'b', numero: 8, __placa: 'XYZ9K88', descricao: 'Troca de óleo' })];
  const itens = new Map([['a', [{ categoria_codigo: 9, descricao: 'Pastilhas' }]], ['b', [{ categoria_codigo: 2, descricao: 'Óleo 5W30' }]]]);
  const cats = [{ codigo: 9, nome: 'Freios' }, { codigo: 2, nome: 'Sistema de lubrificação' }];
  const buscar = (busca, extra = {}) => filtrarManutencoes(lista, { filtro: 'todos', busca, ...extra }, itens, cats).map((x) => x.id);
  assert.deepEqual(buscar('xyz9k88'), ['b']);
  assert.deepEqual(buscar('freios'), ['a']);
  assert.deepEqual(buscar('lubrificacao'), ['b']);
  assert.deepEqual(buscar('MAN-000008'), ['b']);
  assert.deepEqual(buscar('', { natureza: 'preventiva' }), []);
});

test('valor mostrado: final > aprovado > menor orçamento', () => {
  assert.deepEqual(valorDaManutencao(m({ status: 'concluida', custo: 760, valor_aprovado: 750 })), { rotulo: 'Final', valor: 760 });
  assert.deepEqual(valorDaManutencao(m({ valor_aprovado: 750 })), { rotulo: 'Aprovado', valor: 750 });
  assert.deepEqual(valorDaManutencao(m(), [orc({ valor_total: 900 }), orc({ id: 'o2', valor_total: 700 })]), { rotulo: 'Menor orçamento', valor: 700 });
  assert.equal(valorDaManutencao(m(), []), null);
});

test('validações dos formulários', () => {
  assert.equal(validarSolicitacao({ veiculo_id: 'v', descricao: 'x', itens: [{ categoria_codigo: 9 }] }).length, 0);
  assert.equal(validarSolicitacao({ veiculo_id: '', descricao: ' ', itens: [{}] }).length, 3);
  assert.equal(validarOrcamento({ fornecedor: 'A', valor_total: 0 }).length, 0);
  assert.equal(validarOrcamento({ fornecedor: '', valor_total: null }).length, 2);
  assert.equal(validarConclusao({ data_execucao: '2026-10-16', km_execucao: 48000, custo: 760 }).length, 0);
  assert.equal(validarConclusao({ data_execucao: '', km_execucao: 0, custo: null }).length, 3);
  assert.equal(numeroOuNulo('12,5'), 12.5);
  assert.equal(numeroOuNulo(''), null);
  assert.equal(codigoManutencao({ numero: 12 }), 'MAN-000012');
});

test('intervalo do plano é descrito com faixa quando o guia dá uma', () => {
  assert.equal(descreverIntervalo({ intervalo_km: 5000, intervalo_km_max: 10000, intervalo_meses: 6, intervalo_meses_max: 12 }), '5.000–10.000 km ou 6–12 meses');
  assert.equal(descreverIntervalo({ intervalo_dias: 15 }), '15 dias');
  assert.equal(descreverIntervalo({ intervalo_meses: 1 }), '1 mês');
});

const base = {
  categorias: [{ codigo: 9, nome: 'Freios', ativo: true }, { codigo: 2, nome: 'Sistema de lubrificação', ativo: true }],
  planos: [{ id: 'p1', codigo: 'oleo_motor', nome: 'Troca de óleo', categoria_codigo: 2, intervalo_km: 5000, intervalo_km_max: 10000, ativo: true }],
  oficinas: [{ id: 'of1', nome: 'Oficina A', ativo: true }],
  veiculos: [{ id: 'v1', placa: 'ABC1D23', marca_modelo: 'Fiat Strada', status: 'ATIVO' }],
};

test('a ficha renderiza em todas as etapas, com os botões certos e sem HTML solto', () => {
  const xss = '<img src=x onerror=alert(1)>';
  for (const status of Object.keys(TRANSICOES)) {
    const html = htmlFicha(m({ status, descricao: xss, linha_tempo: [{ em: '2026-10-16T12:00:00Z', de: null, para: 'solicitada', por: xss }] }),
      { itens: [item], orcamentos: [orc({ selecionado: true })], base, podeAprovar: true, orcForm: null, formAcao: null, kmSugerido: null });
    assert.doesNotMatch(html, /<img src=x/, `${status}: HTML não escapado`);
    assert.match(html, /MAN-000007/);
  }
  const aprovacao = htmlFicha(m({ status: 'em_aprovacao' }), { itens: [item], orcamentos: [orc({ selecionado: true })], base, podeAprovar: true });
  assert.match(aprovacao, /data-etapa="aprovar"(?! disabled)/);
  const semPermissao = htmlFicha(m({ status: 'em_aprovacao' }), { itens: [item], orcamentos: [orc({ selecionado: true })], base, podeAprovar: false });
  assert.match(semPermissao, /data-etapa="aprovar" disabled/);
  assert.match(semPermissao, /Aguardando decisão de um aprovador|Só aprovadores/);
  const concluida = htmlFicha(m({ status: 'concluida', custo: 760, data_execucao: '2026-10-16', km_execucao: 48000 }), { itens: [item], orcamentos: [], base, podeAprovar: true });
  assert.doesNotMatch(concluida, /data-acao="item-adicionar"/);
  assert.doesNotMatch(concluida, /data-etapa=/);
});

test('formulários: conclusão sugere km e custo; orçamento só aparece quando editável', () => {
  const conclusao = htmlFicha(m({ status: 'em_execucao', valor_aprovado: 750 }), { itens: [item], orcamentos: [], base, podeAprovar: true, formAcao: 'conclusao', kmSugerido: 48123.6 });
  assert.match(conclusao, /data-a="km_execucao" value="48124"/);
  assert.match(conclusao, /data-a="custo" value="750"/);
  const orcForm = htmlFicha(m({ status: 'em_orcamento' }), { itens: [item], orcamentos: [], base, podeAprovar: false, orcForm: true });
  assert.match(orcForm, /data-orc-form/);
  const aprovada = htmlFicha(m({ status: 'aprovada' }), { itens: [item], orcamentos: [orc({ selecionado: true })], base, podeAprovar: false, orcForm: true });
  assert.doesNotMatch(aprovada, /data-acao="orc-novo"/);
});

test('lista e nova solicitação renderizam', () => {
  const lista = [m({ valor_aprovado: 750, prioridade: 'urgente', veiculo_parado: true })];
  const html = htmlLinhas(lista, { itensPorManut: new Map([['m1', [item]]]), orcsPorManut: new Map(), categorias: base.categorias });
  assert.match(html, /MAN-000007/);
  assert.match(html, /Urgente/);
  assert.match(html, /Parado/);
  assert.match(htmlLinhas([], { itensPorManut: new Map(), orcsPorManut: new Map(), categorias: [] }), /Nenhuma manutenção/);
  assert.match(htmlKpis({ abertas: 3 }, 'abertas'), /data-filtro="abertas"/);
  const nova = htmlFormNova(base, { veiculo_id: 'v1', itens: [{ categoria_codigo: 2, plano_id: 'p1', natureza: 'preventiva' }] });
  assert.match(nova, /value="ABC1D23 · Fiat Strada"/);
  assert.match(nova, /<option value="p1" selected>Troca de óleo \(5\.000–10\.000 km\)<\/option>/);
});

test('todos os módulos da manutenção usam o mesmo ?v= dos demais módulos de lista do Frotas', () => {
  const dir = new URL('../assets/js/modules/', import.meta.url);
  const arquivos = readdirSync(dir).filter((f) => /^frotas-manutencao.*\.js$/.test(f));
  assert.ok(arquivos.length >= 7, `esperava os módulos da manutenção, achei ${arquivos.length}`);
  const tokens = new Set();
  for (const f of arquivos) {
    for (const mt of readFileSync(new URL(f, dir), 'utf8').matchAll(/from '\.\/frotas-[\w-]+\.js\?v=([\w-]+)'/g)) tokens.add(mt[1]);
  }
  const grupo = readFileSync(new URL('../frotas-manutencao-grupo.js', dir), 'utf8');
  for (const mt of grupo.matchAll(/frotas-manutencao[\w-]*\.js\?v=([\w-]+)/g)) tokens.add(mt[1]);
  assert.equal(tokens.size, 1, `tokens diferentes: ${[...tokens].join(', ')}`);
});
