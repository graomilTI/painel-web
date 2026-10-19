import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  FILTROS, TRANSICOES, acoesDisponiveis, bateFiltro, bateVisao, camposEditaveis, codigoManutencao, categoriaDoGrupo, componentesDoGrupo, componentesDoServico, grupoDaCategoria, nomeDoGrupoDaCategoria, contarPorFiltro, descreverIntervalo,
  filtrarManutencoes, naturezaSugerida, normalizarLinhaHistorico, numeroOuNulo, presetDoChecklist, pendenciasPara, proximoPasso, validarConclusao, validarOrcamento, validarSolicitacao, valorDaManutencao,
} from '../assets/js/modules/frotas-manutencao-regras.js';
import { veiculosDaRegional } from '../assets/js/gestorManutencao.js';
import { htmlComponentes, htmlFicha, htmlFormNova, htmlKpis, htmlLinhas } from '../assets/js/modules/frotas-manutencao-html.js';

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

test('aprovar exige aprovador, orçamento escolhido, responsável e itens (a natureza é sugerida na aprovação)', () => {
  const emAprovacao = m({ status: 'em_aprovacao' });
  const aprovar = (ctx, mm = emAprovacao) => acoesDisponiveis(mm, ctx).find((a) => a.id === 'aprovar');
  assert.match(aprovar({ podeAprovar: false, itens: [item], orcamentos: [orc({ selecionado: true })] }).bloqueio, /aprovadores/);
  assert.match(aprovar({ podeAprovar: true, itens: [item], orcamentos: [orc()] }).bloqueio, /Escolha o orçamento/);
  assert.match(aprovar({ podeAprovar: true, itens: [], orcamentos: [orc({ selecionado: true })] }).bloqueio, /ao menos um item/);
  assert.equal(aprovar({ podeAprovar: true, itens: [item], orcamentos: [orc({ selecionado: true })] }, m({ status: 'em_aprovacao', natureza: null })).bloqueio, null, 'sem natureza não bloqueia: a tela grava a sugerida');
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
  assert.equal(p.length, 2);
  assert.match(p[0], /quem paga/); assert.match(p[1], /item/);
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
  assert.deepEqual(FILTROS.map((f) => f.id), ['orcar', 'aprovar', 'emitir_os', 'na_oficina']);
  assert.equal(c.orcar, 3, 'solicitada, em orçamento e reprovada precisam de orçamento');
  assert.equal(c.aprovar, 0);
  assert.equal(c.emitir_os, 1);
  assert.equal(c.na_oficina, 1);
  assert.equal(bateFiltro(m({ status: 'concluida' }), 'todos'), true);
  // ids antigos continuam valendo
  assert.equal(lista.filter((x) => bateFiltro(x, 'abertas')).length, 4);
  assert.equal(lista.filter((x) => bateFiltro(x, 'sem_servico')).length, 2);
  assert.equal(bateFiltro(m({ status: 'concluida' }), 'concluida'), true);
  // "Ver": em andamento (padrão), encerradas ou todas — cada manutenção cai em exatamente um dos dois grupos
  assert.equal(lista.filter((x) => bateVisao(x, 'andamento')).length, 4);
  assert.equal(lista.filter((x) => bateVisao(x, 'encerradas')).length, 3);
  assert.equal(lista.filter((x) => bateVisao(x, 'todas')).length, lista.length);
  assert.equal(filtrarManutencoes(lista, {}).length, 4, 'padrão = em andamento');
  assert.equal(filtrarManutencoes(lista, { visao: 'encerradas' }).length, 3);
});

test('próximo passo em palavras simples e natureza sugerida na aprovação', () => {
  const passo = (status, extra = {}, ctx = {}) => proximoPasso(m({ status, ...extra }), ctx).rotulo;
  assert.equal(passo('solicitada'), 'Orçar ou aprovar');
  assert.equal(passo('em_aprovacao'), 'Aprovar');
  assert.equal(passo('reprovada'), 'Refazer orçamento');
  assert.equal(passo('aprovada'), 'Emitir OS');
  assert.equal(passo('em_execucao'), 'Concluir');
  assert.equal(passo('concluida'), 'Concluída');
  assert.equal(passo('concluida', {}, { notas: [{ enviada_em: null }] }), 'Enviar notas');
  assert.equal(passo('concluida', { responsavel_pagamento: 'locadora' }, { notas: [{ enviada_em: null }] }), 'Concluída', 'só a empresa envia nota');
  assert.equal(naturezaSugerida(m({ natureza: 'preventiva' }), []), 'preventiva', 'o que já foi definido vale');
  assert.equal(naturezaSugerida(m({ natureza: null }), [{ natureza: 'preventiva' }]), 'preventiva');
  assert.equal(naturezaSugerida(m({ natureza: null }), [{ natureza: 'preventiva' }, { natureza: null }]), 'corretiva');
  assert.equal(naturezaSugerida(m({ natureza: null }), []), 'corretiva');
});

test('componentes do guia: por grupo, por serviço e sem perder o que já foi marcado', () => {
  const catalogo = [
    { grupo_codigo: 2, categoria_codigo: 9, plano_codigo: 'discos_freio', nome: 'Discos de freio', ordem: 2 },
    { grupo_codigo: 2, categoria_codigo: 9, plano_codigo: 'pastilhas_freio', nome: 'Pastilhas de freio', ordem: 1 },
    { grupo_codigo: 2, categoria_codigo: 9, plano_codigo: null, nome: 'Cilindro-mestre', ordem: 4 },
    { grupo_codigo: 1, categoria_codigo: 11, plano_codigo: null, nome: 'Molas helicoidais', ordem: 1 },
  ];
  assert.deepEqual(componentesDoGrupo(catalogo, 2), ['Pastilhas de freio', 'Discos de freio', 'Cilindro-mestre'], 'na ordem do guia');
  assert.deepEqual(componentesDoGrupo(catalogo, '1'), ['Molas helicoidais'], 'aceita o código como texto');
  assert.deepEqual(componentesDoGrupo(catalogo, 2, ['Item antigo']).slice(-1), ['Item antigo'], 'o já marcado não some se o catálogo mudou');
  assert.deepEqual(componentesDoGrupo(undefined, 2), []);
  assert.deepEqual(componentesDoServico(catalogo, 9, 'pastilhas_freio'), ['Pastilhas de freio']);
  assert.deepEqual(componentesDoServico(catalogo, 9, 'fluido_freio'), [], 'serviço sem peças catalogadas');
  assert.deepEqual(componentesDoServico(catalogo, 9, null), []);
  const html = htmlComponentes(['Pastilhas "x"', 'Discos'], ['Discos']);
  assert.match(html, /data-comp value="Discos" checked/);
  assert.doesNotMatch(html, /value="Pastilhas &quot;x&quot;" checked/);
  assert.match(html, /Pastilhas &quot;x&quot;/, 'texto escapado');
  assert.equal(htmlComponentes([], []), '');
});

test('ficha e nova manutenção escolhem o grupo do guia (7 + Outros) e mostram seus componentes', () => {
  const comps = [{ grupo_codigo: 2, categoria_codigo: 9, plano_codigo: null, nome: 'Pastilhas de freio', ordem: 1 }, { grupo_codigo: 2, categoria_codigo: 9, plano_codigo: null, nome: 'Discos de freio', ordem: 2 }];
  const grupos = [{ codigo: 2, nome: 'Freios', categoria_codigo: 9 }, { codigo: 6, nome: 'Óleo e filtros', categoria_codigo: 2 }, { codigo: 8, nome: 'Outros', categoria_codigo: 28 }];
  const b = { ...base, componentes: comps, grupos, categorias: [{ codigo: 9, nome: 'Freios', ativo: true, grupo_codigo: 2 }, { codigo: 2, nome: 'Sistema de lubrificação', ativo: true, grupo_codigo: 6 }, { codigo: 28, nome: 'Revisão geral', ativo: true, grupo_codigo: 8 }] };
  assert.equal(grupoDaCategoria(b.categorias, 9), 2);
  assert.equal(categoriaDoGrupo(grupos, 8), 28, 'Outros grava a categoria representativa');
  assert.equal(nomeDoGrupoDaCategoria(b, 2), 'Óleo e filtros');
  assert.equal(nomeDoGrupoDaCategoria(base, 2), 'Sistema de lubrificação', 'sem grupos cadastrados cai no sistema');
  const nova0 = htmlFormNova(b, {});
  assert.match(nova0, /data-pick-grupos/);
  assert.doesNotMatch(nova0, /Sistema de lubrificação|Revisão geral/, 'os 29 sistemas não aparecem mais para escolher');
  assert.doesNotMatch(nova0, /<option value="2">Freios<\/option>/, 'o seletor novo não usa dropdown de grupo');
  assert.match(nova0, /obrigatório/);
  const it = { ...item, componentes: ['Discos de freio'] };
  const editavel = htmlFicha(m({ status: 'em_orcamento' }), { itens: [it], orcamentos: [], base: b, podeAprovar: false });
  assert.match(editavel, /data-comp value="Pastilhas de freio"/);
  assert.match(editavel, /data-comp value="Discos de freio" checked/);
  assert.match(editavel, /data-nv-comps/, 'a linha de item novo também recebe os componentes');
  const encerrada = htmlFicha(m({ status: 'concluida', custo: 10, data_execucao: '2026-10-10', km_execucao: 1 }), { itens: [it], orcamentos: [], base: b, podeAprovar: false });
  assert.match(encerrada, /Itens: Discos de freio/);
  assert.doesNotMatch(encerrada, /data-comp /, 'encerrada não edita');
  assert.doesNotMatch(htmlFormNova(b, {}), /data-n-comps/);
  assert.match(htmlFormNova(b, { itens: [{ categoria_codigo: 9, descricao: 'Freio', componentes: ['Discos de freio'] }] }), /Itens: Discos de freio/);
});

test('urgentes e altas vêm primeiro na lista em andamento', () => {
  const lista = [m({ id: 'a', prioridade: 'normal' }), m({ id: 'b', prioridade: 'urgente' }), m({ id: 'c', prioridade: 'alta' }), m({ id: 'd', prioridade: 'normal' })];
  assert.deepEqual(filtrarManutencoes(lista, {}).map((x) => x.id), ['b', 'c', 'a', 'd']);
});

test('quem aprova decide direto na solicitação; os demais pedem orçamento', () => {
  assert.deepEqual(ids(acoesDisponiveis(m(), { podeAprovar: true, itens: [item] })), ['aprovar_sem_orcamento', 'iniciar_orcamento', 'cancelar']);
  assert.equal(acoesDisponiveis(m(), { podeAprovar: true, itens: [item] })[0].tom, 'primary');
  assert.deepEqual(ids(acoesDisponiveis(m(), { podeAprovar: false, itens: [item] })), ['iniciar_orcamento', 'aprovar_sem_orcamento', 'cancelar']);
  assert.equal(acoesDisponiveis(m(), { podeAprovar: false, itens: [item] })[0].tom, 'primary');
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
  assert.deepEqual(buscar('', { visao: 'encerradas' }), [], 'nenhuma encerrada nesta lista');
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
  assert.match(validarSolicitacao({ veiculo_id: 'v', descricao: 'x', itens: [] })[0], /ao menos um item/);
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

test('lista e nova manutenção renderizam (botão "Nova manutenção" e campo "Quem pediu" para pedidos do WhatsApp)', () => {
  const lista = [m({ valor_aprovado: 750, prioridade: 'urgente', veiculo_parado: true })];
  const html = htmlLinhas(lista, { itensPorManut: new Map([['m1', [item]]]), orcsPorManut: new Map(), categorias: base.categorias });
  assert.match(html, /MAN-000007/);
  assert.match(html, /Urgente/);
  assert.match(html, /Parado/);
  assert.match(htmlLinhas([], { itensPorManut: new Map(), orcsPorManut: new Map(), categorias: [] }), /Nenhuma manutenção/);
  assert.match(htmlKpis({ aprovar: 3 }, 'aprovar'), /data-filtro="aprovar"/);
  assert.match(html, /Orçar ou aprovar/);
  assert.doesNotMatch(html, />Abrir<\/button>/, 'a linha inteira abre a ficha');
  assert.match(readFileSync(new URL('../assets/js/modules/frotas-manutencao-html.js', import.meta.url), 'utf8'), /data-acao="nova">\+ Nova manutenção<\/button>/);
  const nova = htmlFormNova(base, { veiculo_id: 'v1', itens: [{ categoria_codigo: 2, plano_id: 'p1', natureza: 'preventiva' }] });
  assert.match(nova, /<h3>Nova manutenção<\/h3>/);
  assert.match(nova, /data-n-solicitante/);
  assert.match(nova, /Registrar manutenção/);
  assert.match(nova, /value="ABC1D23 · Fiat Strada"/);
  // Itens: o seletor em dois painéis (obrigatório) e, acima, a lista do que veio pronto do checklist/plano, cada um com ✕.
  assert.match(nova, /data-pick-busca/);
  assert.doesNotMatch(nova, /data-novo-entrada|novo-item-add/, "a linha de entrada com + saiu");
  assert.match(nova, /obrigatório/);
  assert.equal((nova.match(/data-novo-item data-item-json=/g) || []).length, 1, 'o item do preset entra na lista');
  assert.match(nova, /Sistema de lubrificação/);
  assert.match(nova, /Troca de óleo/, 'o plano do guia aparece na linha da lista');
  assert.equal((nova.match(/data-acao="novo-item-remover"/g) || []).length, 1);
  const semItens = htmlFormNova(base, {});
  assert.equal((semItens.match(/data-novo-item data-item-json=/g) || []).length, 0, 'sem preset não há lista de itens prontos');
  assert.match(semItens, /data-pick-painel/);
});

test('todos os módulos da manutenção usam o mesmo ?v= dos demais módulos de lista do Frotas', () => {
  const dir = new URL('../assets/js/modules/', import.meta.url);
  const arquivos = readdirSync(dir).filter((f) => /^frotas-manutencao.*\.js$/.test(f));
  assert.ok(arquivos.length >= 7, `esperava os módulos da manutenção, achei ${arquivos.length}`);
  const tokens = new Set();
  for (const f of arquivos) {
    for (const mt of readFileSync(new URL(f, dir), 'utf8').matchAll(/from '\.\/frotas-[\w-]+\.js\?v=([\w-]+)'/g)) tokens.add(mt[1]);
  }
  // O carregador da aba e as telas que abrem a solicitação (Checklists, Veículos) importam os módulos com o mesmo token.
  for (const f of ['../frotas-manutencao-grupo.js', 'frotas-checklists.js', 'frotas-veiculos.js']) {
    for (const mt of readFileSync(new URL(f, dir), 'utf8').matchAll(/frotas-manutencao[\w-]*\.js\?v=([\w-]+)/g)) tokens.add(mt[1]);
  }
  assert.equal(tokens.size, 1, `tokens diferentes: ${[...tokens].join(', ')}`);
});

test('checklist com falha ou atenção vira pré-preenchimento da solicitação, agrupando por categoria', () => {
  const check = {
    id: 'c1', veiculo_id: 'v1', responsavel: 'Carlos',
    itens: [
      { item: 'Pneus', status: 'OK' },
      { item: 'Freios', status: 'FALHA', observacao: 'ruído' },
      { item: 'Para-brisa/Limpador', status: 'ATENCAO' },
      { item: 'Retrovisores', status: 'ATENCAO', observacao: 'trincado' },
      { item: 'Extintor', status: 'FALHA' },
    ],
  };
  const p = presetDoChecklist(check, { dataBr: '16/10/2026' });
  assert.equal(p.origem, 'checklist');
  assert.equal(p.checklist_id, 'c1');
  assert.equal(p.veiculo_id, 'v1');
  assert.equal(p.prioridade, 'alta');
  assert.match(p.descricao, /^Checklist de 16\/10\/2026 \(Carlos\): Freios \(falha: ruído\)/);
  assert.match(p.descricao, /Extintor \(falha\)/);
  assert.deepEqual(p.itens.map((i) => i.categoria_codigo).sort((a, b) => a - b), [9, 18]);
  assert.equal(p.itens.find((i) => i.categoria_codigo === 18).descricao.includes('Retrovisores'), true);
  assert.ok(p.itens.every((i) => i.natureza === 'corretiva'));
  assert.equal(presetDoChecklist({ itens: [{ item: 'Pneus', status: 'OK' }] }), null);
  assert.equal(presetDoChecklist({ itens: [{ item: 'Extintor', status: 'ATENCAO' }], id: 'c2', veiculo_id: 'v' }).prioridade, 'normal');
});

test('linha da planilha de histórico: cabeçalhos livres, data e km em vários formatos', () => {
  assert.deepEqual(normalizarLinhaHistorico({ PLACA: 'abc-1d23', 'Plano ': 'oleo_motor', Data: '10/05/2026', 'Km': '41.200' }),
    { placa: 'abc-1d23', plano: 'oleo_motor', data: '2026-05-10', km: 41200 });
  assert.equal(normalizarLinhaHistorico({ placa: 'X', plano: 'p', data: new Date(2026, 4, 10, 12), km: 1500.5 }).data, '2026-05-10');
  assert.equal(normalizarLinhaHistorico({ placa: 'X', plano: 'p', data: 46152, km: '' }).data, '2026-05-10');
  assert.equal(normalizarLinhaHistorico({ placa: 'X', plano: 'p', data: '2026-05-10T00:00:00', km: '41200,5' }).km, 41200.5);
  assert.equal(normalizarLinhaHistorico({ Placa: '', Plano: '', Data: '' }), null);
  assert.equal(normalizarLinhaHistorico({ placa: 'X', plano: 'p', data: 'ontem' }).data, 'ontem');
});

test('app do gestor: só veículos ativos da regional liberada (sem acento, caixa ignorada); master vê todos', () => {
  const veiculos = [
    { id: 1, placa: 'A', supervisao: 'Rio Verde', status: 'ATIVO' },
    { id: 2, placa: 'B', supervisao: 'SORRISO', status: 'ATIVO' },
    { id: 3, placa: 'C', supervisao: 'rio verde', status: 'INATIVO' },
    { id: 4, placa: 'D', supervisao: 'RIO VERDE', status: 'MANUTENCAO' },
    { id: 5, placa: 'E', supervisao: null, status: 'ATIVO' },
  ];
  assert.deepEqual(veiculosDaRegional(veiculos, { isMaster: false, supervisoes: ['RIO VERDE'] }).map((v) => v.id), [1, 4]);
  assert.deepEqual(veiculosDaRegional(veiculos, { isMaster: false, supervisoes: [] }), []);
  assert.deepEqual(veiculosDaRegional(veiculos, { isMaster: true, supervisoes: [] }).map((v) => v.id), [1, 2, 4, 5]);
});

test('todo tipo de aviso gravado pela migration está registrado no sino, e o link ?abrir= abre a ficha', () => {
  const sql = ['20261016200000_frotas_manutencao_avisos', '20261016210000_frotas_manutencao_veiculo_parado', '20261016220000_frotas_manutencao_nf_financeiro']
    .map((n) => readFileSync(new URL(`../supabase/migrations/${n}.sql`, import.meta.url), 'utf8')).join('\n');
  const engine = readFileSync(new URL('../assets/js/notificacoes-engine.js', import.meta.url), 'utf8');
  const tipos = [...new Set([...sql.matchAll(/'(frotas_manut_[a-z]+)'/g)].map((m) => m[1]))];
  assert.ok(tipos.length >= 8, `esperava os tipos de aviso, achei ${tipos.length}`);
  for (const t of tipos) assert.match(engine, new RegExp(String.raw`\b${t}:\s*\{`), `${t} não está em NOTIF_META`);
  const grupo = readFileSync(new URL('../assets/js/frotas-manutencao-grupo.js', import.meta.url), 'utf8');
  assert.match(grupo, /get\('abrir'\)/);
  assert.match(grupo, /FROTAS_MANUTENCAO_ABRIR/);
});

test('Programação: veículo parado vale da entrada na oficina até a previsão (ou hoje), nunca antes nem muito depois', async () => {
  const { indisponivelEm, montarMapa, placaNorm } = await import('../assets/js/programacao-veiculos-parados.js');
  const mapa = montarMapa([{ placa: 'ABC-1D23', numero: 21, desde: '2026-10-16T15:00:00Z', previsao_entrega: '2026-10-19' }]);
  const hoje = '2026-10-17';
  assert.equal(placaNorm('abc-1d23'), 'ABC1D23');
  assert.equal(indisponivelEm(mapa, 'ABC1D23', '2026-10-15', hoje), null, 'antes da entrada');
  assert.equal(indisponivelEm(mapa, 'abc1d23', '2026-10-16', hoje)?.numero, 21);
  assert.equal(indisponivelEm(mapa, 'ABC1D23', '2026-10-19', hoje)?.numero, 21, 'no dia da previsão');
  assert.equal(indisponivelEm(mapa, 'ABC1D23', '2026-10-20', hoje), null, 'depois da previsão o veículo pode ter voltado');
  assert.equal(indisponivelEm(mapa, 'XYZ9K88', '2026-10-17', hoje), null, 'outra placa');
  const semPrevisao = montarMapa([{ placa: 'ABC1D23', numero: 5, desde: '2026-10-10T12:00:00Z', previsao_entrega: null }]);
  assert.equal(indisponivelEm(semPrevisao, 'ABC1D23', '2026-10-17', hoje)?.numero, 5, 'sem previsão vale hoje');
  assert.equal(indisponivelEm(semPrevisao, 'ABC1D23', '2026-10-18', hoje), null, 'sem previsão não bloqueia o futuro');
  const atrasada = montarMapa([{ placa: 'ABC1D23', numero: 5, desde: '2026-10-01T12:00:00Z', previsao_entrega: '2026-10-12' }]);
  assert.equal(indisponivelEm(atrasada, 'ABC1D23', '2026-10-17', hoje)?.numero, 5, 'previsão vencida: ainda na oficina hoje');
});

test('Programação, despesas e carona ligam o filtro de veículo parado; ficha mostra as programações afetadas', () => {
  const ler = (c) => readFileSync(new URL(`../${c}`, import.meta.url), 'utf8');
  for (const f of ['assets/js/programacao.js', 'assets/js/programacao-despesas.js', 'assets/js/programacao-carona-motorista.js']) {
    assert.match(ler(f), /programacao-veiculos-parados\.js\?v=20261016-veiculo-parado1/, `${f} deveria importar o filtro de veículos parados`);
  }
  const html = htmlFicha(m({ status: 'em_execucao', veiculo_parado: true }), {
    itens: [item], orcamentos: [], base, podeAprovar: true,
    afetadas: [{ data: '2026-10-17', supervisao: 'SORRISO', colaborador: 'João', uso: 'Carona Frota', placa: 'ABC1D23' }],
  });
  assert.match(html, /Programação \(veículo parado\)/);
  assert.match(html, /João/);
  assert.match(htmlFicha(m({ status: 'em_execucao', veiculo_parado: true }), { itens: [item], orcamentos: [], base, podeAprovar: true }), /Nenhum lançamento da Programação/);
  assert.doesNotMatch(htmlFicha(m({ status: 'aprovada', veiculo_parado: true }), { itens: [item], orcamentos: [], base, podeAprovar: true }), /Programação \(veículo parado\)/);
  const dossie = ler('assets/js/modules/frotas-fh-dossie-html.js');
  assert.match(dossie, /Veículo em manutenção neste dia/);
  assert.match(ler('assets/js/modules/frotas-fh-dados.js'), /frotas_veiculos_parados_periodo/);
});

test('notas fiscais: várias por manutenção, cada uma com seu envio e situação; só a empresa paga', () => {
  const concluida = (extra = {}) => m({ status: 'concluida', custo: 2400, data_execucao: '2026-10-16', km_execucao: 48000, responsavel_pagamento: 'empresa', ...extra });
  const n1 = { id: 'n1', manutencao_id: 'm1', tipo: 'peca', fornecedor: 'Auto Peças X', numero: '111', valor: 900, anexo_url: 'https://x/p.pdf' };
  const n2 = { id: 'n2', manutencao_id: 'm1', tipo: 'servico', fornecedor: 'Oficina A', numero: '222', valor: 1500, anexo_url: 'https://x/s.xml' };
  const ficha = (mm, notas = [], financeiro = null) => htmlFicha(mm, { itens: [item], orcamentos: [], base, podeAprovar: true, notas, financeiro });
  const vazia = ficha(concluida());
  assert.match(vazia, /Notas fiscais \(0\)/);
  assert.match(vazia, /data-nota-entrada/, 'linha de entrada sempre à vista');
  assert.match(vazia, /data-acao="nota-add"[^>]*>\+<\/button>/);
  assert.match(vazia, /Nenhuma nota ainda/);
  assert.doesNotMatch(vazia, /data-acao="notas-enviar"/);

  const duas = ficha(concluida(), [n1, n2]);
  assert.match(duas, /Notas fiscais \(2\)/);
  assert.equal((duas.match(/data-acao="nota-remover"/g) || []).length, 2, 'notas não enviadas têm ✕');
  assert.match(duas, /Auto Peças X/);
  assert.match(duas, /Oficina A/);
  assert.match(duas, /Soma das 2 nota\(s\):/);
  assert.match(duas, /Enviar 2 nota\(s\) ao GRM e ao Financeiro/);

  assert.match(ficha(concluida({ custo: 2000 }), [n1, n2]), /passa do custo final/);

  const enviadas = ficha(concluida(), [{ ...n1, enviada_em: '2026-10-16T12:00:00Z' }, { ...n2, enviada_em: '2026-10-16T12:00:00Z' }], {
    notas: [
      { nota_id: 'n1', enviada: true, nf: { status: 'LANCADO', grm_codigo: '99887', categoria: 'MANUT. VEICULOS PECAS' }, pagamento: { status: 'PAGO', comprovante_url: 'https://x/c.pdf' } },
      { nota_id: 'n2', enviada: true, nf: { status: 'ERRO', erro: 'Fornecedor não encontrado' }, pagamento: { status: 'PENDENTE' } },
    ],
  });
  assert.doesNotMatch(enviadas, /data-acao="nota-remover"/, 'nota enviada não se remove');
  assert.doesNotMatch(enviadas, /data-acao="notas-enviar"/);
  assert.match(enviadas, /Lançada no GRM/);
  assert.match(enviadas, /GRM 99887/);
  assert.match(enviadas, /Erro no GRM/);
  assert.match(enviadas, /Fornecedor não encontrado/);
  assert.match(enviadas, /Ver comprovante/);

  const mista = ficha(concluida(), [{ ...n1, enviada_em: '2026-10-16T12:00:00Z' }, n2]);
  assert.equal((mista.match(/data-acao="nota-remover"/g) || []).length, 1, 'só a pendente tem ✕');
  assert.match(mista, /Enviar 1 nota\(s\)/);

  assert.match(ficha(m({ status: 'em_execucao', responsavel_pagamento: 'empresa' }), [n1]), /enviadas ao GRM e ao Financeiro quando a manutenção for concluída/);
  assert.match(ficha(concluida({ responsavel_pagamento: 'locadora' })), /não vai para a nota fiscal do GRM nem para o Financeiro/);
  assert.doesNotMatch(ficha(m({ status: 'em_orcamento' })), /Notas fiscais/);
  assert.doesNotMatch(ficha(concluida(), [{ ...n1, fornecedor: '<img src=x onerror=alert(1)>' }]), /<img src=x/);
});

test('notas: regras de validação e conferência da soma com o custo', async () => {
  const { conferenciaNotas, somaNotas, validarNota } = await import('../assets/js/modules/frotas-manutencao-regras.js');
  assert.equal(somaNotas([{ valor: '100.10' }, { valor: 200.2 }, {}]), 300.3);
  assert.equal(validarNota({ valor: 10, fornecedor: 'A', arquivo: {} }).length, 0);
  assert.equal(validarNota({ valor: 0, fornecedor: ' ', arquivo: null }).length, 3);
  assert.deepEqual(conferenciaNotas([{ valor: 500 }, { valor: 1000 }], 1500), { soma: 1500, diferenca: 0, situacao: 'igual' });
  assert.equal(conferenciaNotas([{ valor: 1000 }], 1500).situacao, 'abaixo');
  assert.equal(conferenciaNotas([{ valor: 1600 }], 1500).situacao, 'acima');
  assert.equal(conferenciaNotas([{ valor: 1 }], null).situacao, 'sem_custo');
});

test('conclusão: custo vem da soma das notas e o envio só é oferecido à empresa e com notas; item tem tipo; Financeiro ganhou o filtro Frotas', () => {
  const notas = [{ id: 'n1', valor: 500, fornecedor: 'A' }, { id: 'n2', valor: 1000, fornecedor: 'B', enviada_em: '2026-10-16T12:00:00Z' }];
  const conc = (resp, ns = notas) => htmlFicha(m({ status: 'em_execucao', responsavel_pagamento: resp, valor_aprovado: 700 }), { itens: [item], orcamentos: [], base, podeAprovar: true, formAcao: 'conclusao', kmSugerido: null, notas: ns });
  assert.match(conc('empresa'), /data-a-enviar checked/);
  assert.match(conc('empresa'), /Enviar 1 nota\(s\) ao GRM/, 'só as pendentes');
  assert.match(conc('empresa'), /data-a="custo" value="1500"/, 'custo = soma das notas');
  assert.match(conc('empresa'), /Soma das 2 nota\(s\)/);
  assert.match(conc('empresa', []), /data-a="custo" value="700"/, 'sem notas usa o valor aprovado');
  assert.match(conc('empresa', []), /Nenhuma nota fiscal cadastrada/);
  assert.doesNotMatch(conc('empresa', []), /data-a-enviar/);
  assert.doesNotMatch(conc('proprietario'), /data-a-enviar/);
  assert.match(conc('proprietario'), /não vai para NF nem Financeiro/);
  assert.doesNotMatch(conc('empresa'), /data-a-arquivo|data-a="nf_numero"/, 'o arquivo e o número da NF agora são por nota');
  assert.match(htmlFicha(m({ status: 'em_orcamento' }), { itens: [item], orcamentos: [], base, podeAprovar: true }), /data-item="tipo_item"/);
  // o tipo (peça/serviço) vem no seletor da nova manutenção, por grupo
  assert.match(readFileSync(new URL('../assets/js/modules/frotas-manutencao-seletor.js', import.meta.url), 'utf8'), /data-pick-tipo value="\$\{t\.id\}"/);
  const financeiro = readFileSync(new URL('../assets/js/modules/financeiro/html.js', import.meta.url), 'utf8');
  assert.match(financeiro, /data-setor-pay="FROTAS"/);
});

test('custos: só concluída com custo e paga pela empresa; categoria divide o custo entre os itens', async () => {
  const { agrupar, csvDasLinhas, csvDosGrupos, filtrarPeriodo, linhasDeCusto, resumo } = await import('../assets/js/modules/frotas-manutencao-custos-regras.js');
  const veiculos = [{ id: 'v1', placa: 'ABC1D23', marca_modelo: 'Fiat Strada', coordenacao: 'MT', supervisao: 'SORRISO' }, { id: 'v2', placa: 'XYZ9K88', coordenacao: 'GO', supervisao: 'RIO VERDE' }];
  const categorias = [{ codigo: 9, nome: 'Freios' }, { codigo: 13, nome: 'Rodas, pneus e alinhamento' }];
  const man = (id, extra) => ({ id, numero: Number(id.slice(1)), veiculo_id: 'v1', status: 'concluida', natureza: 'corretiva', custo: 1000, data_execucao: '2026-09-10', oficina: 'Oficina A', responsavel_pagamento: 'empresa', ...extra });
  const manutencoes = [
    man('m1'), man('m2', { natureza: 'preventiva', custo: 500, veiculo_id: 'v2', data_execucao: '2026-10-05' }),
    man('m3', { status: 'em_execucao' }), man('m4', { custo: 0 }), man('m5', { responsavel_pagamento: 'locadora' }), man('m6', { custo: 300, data_execucao: '2026-01-15' }),
  ];
  const itens = [{ manutencao_id: 'm1', categoria_codigo: 9 }, { manutencao_id: 'm1', categoria_codigo: 13 }, { manutencao_id: 'm2', categoria_codigo: 9 }];
  const base = { itens, veiculos, categorias };
  const linhas = linhasDeCusto(manutencoes, base);
  assert.deepEqual(linhas.map((l) => l.id), ['m1', 'm2', 'm6'], 'em execução, custo 0 e locadora ficam de fora');
  assert.equal(linhasDeCusto(manutencoes, base, { somenteEmpresa: false }).length, 4, 'sem o filtro entra a da locadora');
  assert.equal(filtrarPeriodo(linhas, { inicio: '2026-09-01', fim: '2026-10-31' }).length, 2);

  const r = resumo(linhas);
  assert.equal(r.total, 1800);
  assert.equal(r.qtd, 3);
  assert.equal(r.medio, 600);
  assert.equal(r.pctPreventiva, 27.8);

  const porPlaca = agrupar(linhas, 'placa');
  assert.deepEqual(porPlaca.map((g) => [g.rotulo, g.total, g.qtd]), [['ABC1D23', 1300, 2], ['XYZ9K88', 500, 1]]);
  assert.equal(agrupar(linhas, 'coordenacao').find((g) => g.chave === 'MT').total, 1300);
  assert.deepEqual(agrupar(linhas, 'mes').map((g) => g.chave), ['2026-01', '2026-09', '2026-10'], 'meses em ordem cronológica');
  const porCat = agrupar(linhas, 'categoria');
  const freios = porCat.find((g) => g.chave === '9');
  assert.equal(freios.total, 1000, 'freios: metade da m1 (500) + a m2 inteira (500)');
  assert.equal(porCat.find((g) => g.chave === '13').total, 500, 'pneus: metade da m1');
  assert.equal(porCat.find((g) => g.chave === '0').total, 300, 'sem itens: (sem categoria)');
  assert.equal(Math.round(porCat.reduce((s, g) => s + g.total, 0)), 1800, 'o rateio não perde nem cria dinheiro');

  const csv = csvDosGrupos(porPlaca, 'Veículo (placa)');
  assert.ok(csv.startsWith('﻿Veículo (placa);Manutenções;Custo total (R$)'));
  assert.match(csv, /ABC1D23;2;1300,00;650,00;0,00;1300,00/);
  assert.match(csvDasLinhas(linhas), /MAN-000001;2026-09-10;ABC1D23;Fiat Strada;MT;SORRISO;corretiva;09 Freios \| 13 Rodas, pneus e alinhamento;Oficina A;1000,00/);
});

test('o histórico mostra a manutenção do fluxo novo (placa, condutor, data do serviço e status em português) e o dashboard de Frotas mostra o custo do mês só das concluídas', () => {
  const ler = (c) => readFileSync(new URL(`../${c}`, import.meta.url), 'utf8');
  const hist = ler('assets/js/modules/frotas-historico-tela.js');
  assert.match(hist, /veiculosPorId/);
  assert.match(hist, /row\.motorista_nome \|\| row\.solicitante_nome/);
  assert.match(hist, /'data_execucao'/);
  assert.match(hist, /concluida: 'Concluída'/);
  const painel = ler('assets/js/frotas-dashboard.js');
  assert.match(painel, /from\('frotas_manutencoes'\)\.select\('custo'\)\.eq\('status', 'concluida'\)\.eq\('responsavel_pagamento', 'empresa'\)/);
  assert.match(ler('assets/js/frotas-manutencao-grupo.js'), /id: 'custos'/);
});

test('os botões das abas ficam fora de .fm-head, que o hub esconde (frotas-hub.css)', () => {
  const ler = (c) => readFileSync(new URL(`../${c}`, import.meta.url), 'utf8');
  const escondidas = ler('assets/css/frotas-hub.css');
  assert.match(escondidas, /\.frotas-hub-tab-body \.fm-head/, 'o hub esconde .fm-head (por isso as ações não podem estar lá)');
  for (const f of ['frotas-manutencao-html', 'frotas-manutencao-preventiva', 'frotas-manutencao-custos', 'frotas-manutencao-oficinas', 'frotas-troca-oleo', 'frotas-checklists']) {
    const src = ler(`assets/js/modules/${f}.js`);
    assert.doesNotMatch(src, /<div class="fm-head">|<div class="fm-head" /, `${f} tem botões dentro de .fm-head (escondido no hub)`);
    assert.match(src, /class="fm-topo"/, `${f} deveria usar .fm-topo para as ações`);
  }
  assert.match(ler('assets/js/modules/frotas-ui-lista.js'), /\.fm-topo\{/);
});

test('placa unificada: dois cadastros com o mesmo RENAVAM aparecem como um só na escolha do veículo', async () => {
  const { veiculosUnicos } = await import('../assets/js/modules/frotas-manutencao-regras.js');
  const antigo = { id: 'a', placa: 'AAR5019', renavam: '284075809', status: 'ATIVO', marca_modelo: null, updated_at: '2026-05-26' };
  const novo = { id: 'b', placa: 'AAR5A19', renavam: '284.075.809', status: 'ATIVO', marca_modelo: 'FIAT/PUNTO ESSENCE 1.6', updated_at: '2026-10-16' };
  const outro = { id: 'c', placa: 'XYZ9K88', renavam: '111', status: 'ATIVO', marca_modelo: 'Toyota Hilux' };
  const semRenavam1 = { id: 'd', placa: 'AAA1A11', renavam: '', status: 'ATIVO' };
  const semRenavam2 = { id: 'e', placa: 'BBB2B22', renavam: null, status: 'ATIVO' };
  assert.deepEqual(veiculosUnicos([antigo, novo, outro, semRenavam1, semRenavam2]).map((v) => v.placa), ['AAR5A19', 'XYZ9K88', 'AAA1A11', 'BBB2B22'], 'fica o cadastro com modelo; sem RENAVAM nada é agrupado');
  assert.deepEqual(veiculosUnicos([novo, antigo]).map((v) => v.placa), ['AAR5A19'], 'a ordem de entrada não importa');
  const empatados = [{ id: 'x', placa: 'AAA0000', renavam: '9', status: 'ATIVO', updated_at: '2026-01-01' }, { id: 'y', placa: 'AAA0A00', renavam: '9', status: 'ATIVO', updated_at: '2026-09-01' }];
  assert.deepEqual(veiculosUnicos(empatados).map((v) => v.placa), ['AAA0A00'], 'empate: o atualizado por último');
  const html = htmlFormNova({ ...base, veiculos: [{ id: 'a', placa: 'AAR5019', renavam: '1', status: 'ATIVO' }, { id: 'b', placa: 'AAR5A19', renavam: '1', status: 'ATIVO', marca_modelo: 'FIAT/PUNTO' }] }, {});
  assert.match(html, /<option value="AAR5A19 · FIAT\/PUNTO">/);
  assert.doesNotMatch(html, /<option value="AAR5019 · ">/);
});

test('veículo sem marca_modelo no cadastro mostra marca/modelo (cadastro, BFleet) ou o nome sem a placa', async () => {
  const { rotuloVeiculo } = await import('../assets/js/modules/frotas-manutencao-regras.js');
  const { modeloDoVeiculo } = await import('../assets/js/gestorManutencao.js');
  assert.equal(rotuloVeiculo({ placa: 'A', marca_modelo: 'FIAT/PUNTO ESSENCE 1.6' }), 'FIAT/PUNTO ESSENCE 1.6');
  assert.equal(rotuloVeiculo({ placa: 'A', marca_modelo: '  ', marca: 'FIAT', modelo: 'MOBI LIKE' }), 'FIAT/MOBI LIKE');
  assert.equal(rotuloVeiculo({ placa: 'A', bfleet_marca: 'Fiat', bfleet_modelo: 'Uno Way 1.4' }), 'FIAT/UNO WAY 1.4');
  assert.equal(rotuloVeiculo({ placa: 'ONT2B22', nome: 'UNO WAY 1.4 - ONT2B22' }), 'UNO WAY 1.4');
  assert.equal(rotuloVeiculo({ placa: 'FWW0B82', nome: 'FWW0B82 CHEVROLET PRISMA BRANCA' }), 'CHEVROLET PRISMA BRANCA');
  assert.equal(rotuloVeiculo({ placa: 'X' }), '');
  assert.equal(modeloDoVeiculo({ bfleet_marca: 'Volkswagen', bfleet_modelo: 'SAVEIRO' }), 'VOLKSWAGEN/SAVEIRO');
  const html = htmlFormNova({ ...base, veiculos: [{ id: 'v9', placa: 'ONT2B22', status: 'MANUTENCAO', marca: 'FIAT', modelo: 'UNO WAY 1.4' }] }, {});
  assert.match(html, /<option value="ONT2B22 · FIAT\/UNO WAY 1\.4">/);
});

test('Quem pediu: vem com o condutor do veículo e aceita outro nome (texto livre com sugestão de colaborador)', () => {
  const comCondutor = { id: 'v1', placa: 'ABC1D23', marca_modelo: 'Fiat Strada', status: 'ATIVO', motorista_atual: 'BRUNO DOS SANTOS MOREIRA' };
  const baseColab = { ...base, veiculos: [comCondutor], colaboradores: ['ANA PAULA', 'BRUNO DOS SANTOS MOREIRA'] };
  const html = htmlFormNova(baseColab, { veiculo_id: 'v1' });
  assert.match(html, /data-n-solicitante data-auto="1" list="fmListaColaboradores"[^>]*value="BRUNO DOS SANTOS MOREIRA"/, 'condutor como padrão');
  assert.match(html, /<datalist id="fmListaColaboradores"><option value="ANA PAULA"><\/option><option value="BRUNO DOS SANTOS MOREIRA"><\/option><\/datalist>/);
  assert.match(htmlFormNova(baseColab, {}), /data-n-solicitante data-auto="1"[^>]*value=""/, 'sem veículo escolhido começa vazio');
  assert.match(htmlFormNova(baseColab, { veiculo_id: 'v1', solicitante_nome: 'Carlos (gestor)' }), /data-auto="0"[^>]*value="Carlos \(gestor\)"/, 'nome informado não é trocado sozinho');
  assert.match(readFileSync(new URL('../assets/js/modules/frotas-manutencao.js', import.meta.url), 'utf8'), /preencherCondutor/);
  assert.match(readFileSync(new URL('../assets/js/modules/frotas-manutencao-dados.js', import.meta.url), 'utf8'), /from\('colaboradores_atuais'\)/);
});
