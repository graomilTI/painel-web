import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  FILTROS, TRANSICOES, acoesDisponiveis, bateFiltro, camposEditaveis, codigoManutencao, contarPorFiltro, descreverIntervalo,
  filtrarManutencoes, normalizarLinhaHistorico, numeroOuNulo, presetDoChecklist, pendenciasPara, validarConclusao, validarOrcamento, validarSolicitacao, valorDaManutencao,
} from '../assets/js/modules/frotas-manutencao-regras.js';
import { veiculosDaRegional } from '../assets/js/gestorManutencao.js';
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
  const sql = readFileSync(new URL('../supabase/migrations/20261016200000_frotas_manutencao_avisos.sql', import.meta.url), 'utf8');
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
