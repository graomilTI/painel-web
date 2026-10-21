import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ETAPAS, acoesDoCard, agruparLinhas, contarPorEtapa, etapaDaManutencao, linhasDosItens, manutencoesDaEtapa, resolverSelecao, situacaoPagamento,
} from '../assets/js/modules/frotas-manutencao-etapas.js';
import { htmlCard, htmlCards, htmlCasca, htmlEtapas } from '../assets/js/modules/frotas-manutencao-cards.js';
import { buscarItens } from '../assets/js/modules/frotas-manutencao-seletor.js';
import { htmlFicha } from '../assets/js/modules/frotas-manutencao-html.js';

// Corretiva por etapas (modelo de Compras): a etapa é derivada do status do banco e dos pagamentos/notas; os itens são linhas
// marcáveis (peça, mão de obra, serviço) e só o marcado segue para a cotação (RPC frotas_manutencao_dividir).

const lerArquivo = (c) => readFileSync(new URL(`../${c}`, import.meta.url), 'utf8');
const m = (extra = {}) => ({ id: 'm1', numero: 72, veiculo_id: 'v1', status: 'solicitada', natureza: 'corretiva', responsavel_pagamento: 'empresa', descricao: 'Barulho ao frear', prioridade: 'normal', __placa: 'BDK4J22', __modelo: 'Renault Kwid', ...extra });
const base = {
  planos: [], oficinas: [], veiculos: [],
  categorias: [{ codigo: 9, nome: 'Freios', grupo_codigo: 9 }, { codigo: 2, nome: 'Óleo e filtros', grupo_codigo: 2 }],
  grupos: [{ codigo: 9, nome: 'Freios', categoria_codigo: 9 }, { codigo: 2, nome: 'Óleo e filtros', categoria_codigo: 2 }],
  componentes: [
    { grupo_codigo: 9, categoria_codigo: 9, nome: 'Pastilha de freio', tipo: 'peca' },
    { grupo_codigo: 9, categoria_codigo: 9, nome: 'Sangria do sistema', tipo: 'servico' },
  ],
};
const itemFreio = { id: 'i1', manutencao_id: 'm1', categoria_codigo: 9, tipo_item: 'peca', descricao: 'Pastilha de freio, Disco', componentes: ['Pastilha de freio', 'Disco'], pecas: { 'Pastilha de freio': { detalhe: 'LUK', valor: 120 } } };
const itemMao = { id: 'i2', manutencao_id: 'm1', categoria_codigo: 9, tipo_item: 'servico', descricao: 'Mão de obra, Sangria do sistema', componentes: ['Mão de obra', 'Sangria do sistema'], pecas: {} };
const itemLivre = { id: 'i3', manutencao_id: 'm1', categoria_codigo: 2, tipo_item: 'servico', descricao: 'Trocar óleo (texto livre)', componentes: [], pecas: {} };
const nota = (extra = {}) => ({ id: 'n1', manutencao_id: 'm1', valor: 500, anexo_url: null, comprovante_url: null, pago_em: null, enviada_em: null, ...extra });

test('as etapas seguem a ordem de Compras: solicitações, cotações, em andamento, à pagar, aguardando NF, concluído', () => {
  assert.deepEqual(ETAPAS.map((e) => e.rotulo).slice(0, 6), ['Solicitações', 'Cotações', 'Em andamento', 'À pagar', 'Aguardando NF', 'Concluído']);
  assert.equal(ETAPAS.at(-1).id, 'canceladas', 'canceladas ficam num atalho à parte, no fim');
});

test('a etapa vem do status: orçamento e aprovação são Cotações; aprovada e na oficina são Em andamento', () => {
  const etapa = (status) => etapaDaManutencao(m({ status }));
  assert.equal(etapa('solicitada'), 'solicitacoes');
  for (const s of ['em_orcamento', 'em_aprovacao', 'reprovada']) assert.equal(etapa(s), 'cotacoes', s);
  for (const s of ['aprovada', 'em_execucao']) assert.equal(etapa(s), 'andamento', s);
  assert.equal(etapa('cancelada'), 'canceladas');
});

test('concluída: sem pagamento é À pagar; pago sem nota é Aguardando NF; pago e com nota é Concluído', () => {
  const conc = (extra, notas) => etapaDaManutencao(m({ status: 'concluida', custo: 500, ...extra }), notas);
  assert.equal(conc({}, []), 'apagar', 'sem notas e sem pagamento');
  assert.equal(conc({}, [nota({ anexo_url: 'nf.pdf' })]), 'apagar', 'tem a nota mas ainda não foi paga');
  assert.equal(conc({}, [nota({ comprovante_url: 'pix.png' })]), 'nf', 'pagou primeiro (comprovante), falta a NF');
  assert.equal(conc({}, [nota({ comprovante_url: 'pix.png', pago_em: '2026-10-20T12:00:00Z' })]), 'nf');
  assert.equal(conc({}, [nota({ anexo_url: 'nf.pdf', pago_em: '2026-10-20T12:00:00Z' })]), 'nf', 'NF anexada mas ainda não enviada ao GRM/Financeiro');
  assert.equal(conc({}, [nota({ anexo_url: 'nf.pdf', pago_em: '2026-10-20T12:00:00Z', enviada_em: '2026-10-20T13:00:00Z' })]), 'concluido');
  assert.equal(conc({ pago_em: '2026-10-20T12:00:00Z' }, [nota({ anexo_url: 'nf.pdf', enviada_em: '2026-10-20T13:00:00Z' })]), 'concluido', 'pago pelo Financeiro (sincronizado na manutenção)');
  assert.equal(conc({ pago_em: '2026-10-20T12:00:00Z' }, []), 'nf');
  assert.equal(conc({}, [nota({ anexo_url: 'a.pdf', pago_em: '2026-10-20T12:00:00Z', enviada_em: 'x' }), nota({ id: 'n2', anexo_url: 'b.pdf', enviada_em: 'x' })]), 'apagar', 'uma das notas ainda não foi paga');
  assert.equal(conc({}, [nota({ anexo_url: 'a.pdf', pago_em: '2026-10-20T12:00:00Z', enviada_em: 'x' }), nota({ id: 'n2', comprovante_url: 'p.png', pago_em: '2026-10-20T12:00:00Z' })]), 'nf', 'uma das notas ainda sem NF');
});

test('paga por outro responsável ou sem custo, a concluída não passa por À pagar nem Aguardando NF', () => {
  assert.equal(etapaDaManutencao(m({ status: 'concluida', custo: 500, responsavel_pagamento: 'locadora' })), 'concluido');
  assert.equal(etapaDaManutencao(m({ status: 'concluida', custo: 0 })), 'concluido');
  assert.equal(etapaDaManutencao(m({ status: 'concluida', custo: null })), 'concluido');
  assert.deepEqual(situacaoPagamento(m({ custo: 500, responsavel_pagamento: 'colaborador' }), []), { exige: false, pago: true, temNF: true });
});

test('contagem por etapa e filtro da lista (etapa e busca)', () => {
  const lista = [
    m({ id: 'a', status: 'solicitada', prioridade: 'urgente', solicitado_em: '2026-10-19T10:00:00Z' }),
    m({ id: 'b', status: 'solicitada', veiculo_parado: true, solicitado_em: '2026-10-20T10:00:00Z', __placa: 'AAR5A19', descricao: 'Troca de óleo' }),
    m({ id: 'c', status: 'em_aprovacao' }),
    m({ id: 'd', status: 'concluida', custo: 100, concluida_em: '2026-10-10T10:00:00Z' }),
    m({ id: 'e', status: 'concluida', custo: 100, concluida_em: '2026-10-15T10:00:00Z', pago_em: '2026-10-16T10:00:00Z' }),
    m({ id: 'f', status: 'cancelada' }),
  ];
  const notasPorManut = new Map([['e', [nota({ manutencao_id: 'e', anexo_url: 'nf.pdf', pago_em: '2026-10-16T10:00:00Z', enviada_em: '2026-10-16T09:00:00Z' })]]]);
  assert.deepEqual(contarPorEtapa(lista, notasPorManut), { solicitacoes: 2, cotacoes: 1, andamento: 0, apagar: 1, nf: 0, concluido: 1, canceladas: 1 });
  const ids = (extra, etapa = 'solicitacoes') => manutencoesDaEtapa(lista, { etapa, ...extra }, { notasPorManut }).map((x) => x.id);
  assert.deepEqual(ids({}), ['a', 'b'], 'urgentes primeiro');
  assert.deepEqual(ids({ busca: 'aar5a19' }), ['b']);
  assert.deepEqual(ids({}, 'concluido'), ['e']);
});

test('os itens viram uma linha por peça, mão de obra ou serviço, agrupadas pelo grupo do guia', () => {
  const linhas = linhasDosItens([itemFreio, itemMao, itemLivre], base);
  assert.deepEqual(linhas.map((l) => l.nome), ['Pastilha de freio', 'Disco', 'Mão de obra', 'Sangria do sistema', 'Trocar óleo (texto livre)']);
  assert.deepEqual(linhas.map((l) => l.tipo), ['peca', 'peca', 'servico', 'servico', 'servico']);
  assert.equal(linhas[0].detalhe, 'LUK');
  assert.equal(linhas[0].valor, 120);
  assert.equal(linhas[2].maoDeObra, true);
  assert.equal(linhas[4].atomico, true, 'item sem componentes (checklist ou texto livre) é uma linha só');
  assert.equal(new Set(linhas.map((l) => l.key)).size, linhas.length, 'cada linha tem chave própria');
  const grupos = agruparLinhas(linhas);
  assert.deepEqual(grupos.map((g) => [g.grupo, g.linhas.length]), [['Freios', 4], ['Óleo e filtros', 1]], 'peças e mão de obra do mesmo grupo ficam juntas');
});

test('o tipo da linha vem do guia: peça marcada num item de serviço antigo continua peça', () => {
  const antigo = { id: 'i9', categoria_codigo: 9, tipo_item: 'servico', descricao: 'Pastilha de freio', componentes: ['Pastilha de freio', 'Sangria do sistema'], pecas: {} };
  assert.deepEqual(linhasDosItens([antigo], base).map((l) => l.tipo), ['peca', 'servico']);
});

test('o que foi marcado vira o pedido da RPC: nada ou tudo marcado não separa; parcial separa por item e componente', () => {
  const linhas = linhasDosItens([itemFreio, itemMao, itemLivre], base);
  const key = (nome) => linhas.find((l) => l.nome === nome).key;
  assert.deepEqual(resolverSelecao(linhas, new Set()), { nenhuma: true, todas: false, selecao: [], quantas: 0 });
  assert.equal(resolverSelecao(linhas, new Set(linhas.map((l) => l.key))).todas, true);
  const parcial = resolverSelecao(linhas, new Set([key('Pastilha de freio'), key('Mão de obra'), key('Trocar óleo (texto livre)')]));
  assert.equal(parcial.quantas, 3);
  assert.deepEqual(parcial.selecao, [
    { item_id: 'i1', componentes: ['Pastilha de freio'] },
    { item_id: 'i2', componentes: ['Mão de obra'] },
    { item_id: 'i3' },
  ]);
  const grupoInteiro = resolverSelecao(linhas, new Set(['Pastilha de freio', 'Disco', 'Mão de obra', 'Sangria do sistema'].map(key)));
  assert.equal(grupoInteiro.quantas, 4, 'marcar o grupo todo marca todas as suas linhas');
  assert.equal(grupoInteiro.todas, false, 'o óleo ficou de fora');
});

test('ações da coluna da direita seguem o fluxo e, concluída, oferecem notas e envio ao GRM/Financeiro', () => {
  const ids = (mm, ctx = {}) => acoesDoCard(mm, { podeAprovar: true, itens: [itemFreio], orcamentos: [], notas: [], ...ctx }).map((a) => a.id);
  assert.deepEqual(ids(m()), ['iniciar_orcamento', 'aprovar_sem_orcamento', 'cancelar']);
  assert.deepEqual(ids(m({ status: 'em_orcamento' })), ['orcamento', 'enviar_aprovacao', 'aprovar_sem_orcamento', 'cancelar'], 'em cotação: orçamento primeiro');
  assert.ok(ids(m({ status: 'aprovada' })).includes('emitir_os'));
  assert.ok(ids(m({ status: 'em_execucao' })).includes('concluir'));
  const conc = m({ status: 'concluida', custo: 500 });
  assert.deepEqual(ids(conc), ['notas']);
  assert.deepEqual(ids(conc, { notas: [nota({ anexo_url: 'nf.pdf' })] }), ['notas', 'enviar_notas']);
  assert.deepEqual(ids(conc, { notas: [nota({ anexo_url: 'nf.pdf', enviada_em: '2026-10-20T12:00:00Z' })] }), ['notas'], 'nota já enviada não pede novo envio');
  assert.deepEqual(ids(m({ status: 'concluida', responsavel_pagamento: 'locadora' })), [], 'paga por outro: nada a enviar');
  const semPermissao = acoesDoCard(m(), { podeAprovar: false, itens: [itemFreio] }).find((a) => a.id === 'aprovar_sem_orcamento');
  assert.match(semPermissao.bloqueio, /aprovadores/);
});

test('cartão: coluna de ações à direita, itens marcáveis só em Solicitações e ficha sem botão de voltar', () => {
  const ctx = (extra = {}) => ({ itensPorManut: new Map([['m1', [itemFreio, itemMao]]]), orcsPorManut: new Map(), notasPorManut: new Map(), base, etapa: 'solicitacoes', aberto: null, podeAprovar: true, marcadasDe: () => new Set(), codigoDe: () => '', ...extra });
  const sol = htmlCard(m(), ctx());
  assert.match(sol, /class="fm-mc-acoes"/);
  assert.match(sol, /data-mc-acao="iniciar_orcamento"/);
  assert.match(sol, /data-mc-acao="detalhes"/);
  assert.match(sol, /data-check-todas/);
  assert.match(sol, /data-check-grupo/, 'marcar por grupo');
  assert.equal((sol.match(/data-check-linha/g) || []).length, 4, 'e um a um');
  assert.match(sol, /Mão de obra/);
  assert.match(sol, /\+ Peças, mão de obra ou serviço/);
  assert.doesNotMatch(sol, /id="fmFicha"/, 'fechado: sem ficha');
  const cot = htmlCard(m({ status: 'em_orcamento' }), ctx({ etapa: 'cotacoes' }));
  assert.doesNotMatch(cot, /data-check-linha/, 'depois da solicitação não se marca de novo');
  assert.doesNotMatch(cot, /Pastilha de freio/, 'fora de Solicitações os itens ficam minimizados (aparecem ao abrir a ficha)');
  assert.doesNotMatch(cot, /fm-badge|fm-mc-val/, 'o cabeçalho só tem código, veículo, motivo, data, solicitante e ações');
  for (const txt of ['MAN-000072', 'BDK4J22', 'Renault Kwid', 'Barulho ao frear', 'Ana']) assert.match(htmlCard(m({ status: 'em_orcamento', solicitante_nome: 'Ana' }), ctx({ etapa: 'cotacoes' })), new RegExp(txt));
  assert.match(htmlCard(m({ status: 'em_orcamento' }), ctx({ etapa: 'cotacoes', aberto: 'm1' })), /id="fmFicha"/);
  const aberto = htmlCard(m(), ctx({ aberto: 'm1' }));
  assert.match(aberto, /id="fmFicha" data-detalhe/);
  assert.match(aberto, /aria-expanded="true"/);
  assert.doesNotMatch(aberto, /Voltar/);
  const marcado = htmlCard(m(), ctx({ marcadasDe: () => new Set([linhasDosItens([itemFreio], base)[0].key]) }));
  assert.match(marcado, /1 de 4 marcado\(s\) para a cotação/);
});

test('cartão separado de outra solicitação diz de qual veio e escapa HTML', () => {
  const xss = '<img src=x onerror=alert(1)>';
  const html = htmlCard(m({ dividida_de: 'm0', descricao: xss, solicitante_nome: xss }), { itensPorManut: new Map(), orcsPorManut: new Map(), notasPorManut: new Map(), base, etapa: 'cotacoes', aberto: null, podeAprovar: false, marcadasDe: () => new Set(), codigoDe: () => 'MAN-000070' });
  assert.match(html, /separada de MAN-000070/);
  assert.doesNotMatch(html, /<img src=x/);
});

test('cada etapa é um cartão com contador (inclusive zero) que troca a lista', () => {
  const html = htmlEtapas({ solicitacoes: 2, cotacoes: 0, andamento: 1, apagar: 0, nf: 0, concluido: 5, canceladas: 0 }, 'cotacoes');
  assert.equal((html.match(/class="fm-kcard tone-/g) || []).length, ETAPAS.length);
  assert.match(html, /data-filtro="solicitacoes"/);
  for (const rotulo of ['Solicitações', 'Cotações', 'Em andamento', 'À pagar', 'Aguardando NF', 'Concluído']) assert.match(html, new RegExp(rotulo));
  assert.match(html, /<button[^>]*data-filtro="cotacoes"[^>]*aria-pressed="true"/, 'a etapa aberta fica destacada');
  assert.match(html, /<strong >5<\/strong>/);
  assert.doesNotMatch(htmlCasca(), /ds-tabs|frotas-hub-tabs/, 'a linha de abas saiu');
  assert.match(htmlCasca(), /fm-kpis fm-etapas" data-etapas/);
  assert.match(htmlCards([], { etapa: 'cotacoes' }), /Nenhuma manutenção nesta etapa/);
});

test('o controlador não tem página de ficha com botão de voltar: a ficha abre no cartão e a nova manutenção é uma janela', () => {
  const ctrl = lerArquivo('assets/js/modules/frotas-manutencao.js');
  assert.doesNotMatch(ctrl, /Voltar para a lista/);
  assert.doesNotMatch(ctrl, /mostrarPagina|htmlPagina/);
  assert.match(ctrl, /openModal\(\{ id: NOVA/);
  assert.match(ctrl, /dados\.dividir\(/, 'só o marcado segue para a cotação');
  assert.doesNotMatch(lerArquivo('assets/js/modules/frotas-manutencao-html.js'), /Voltar para a lista/);
});

test('o banco separa os itens marcados numa solicitação nova, sem avisar a equipe de novo', () => {
  const sql = lerArquivo('supabase/migrations/20261021140000_frotas_manutencao_dividir.sql');
  assert.match(sql, /function public\.frotas_manutencao_dividir\(p_manutencao uuid, p_selecao jsonb\)/);
  assert.match(sql, /m\.status <> 'solicitada'/, 'só antes da cotação');
  assert.match(sql, /app\.frotas_manut_dividindo/, 'a solicitação separada não dispara o aviso de nova solicitação');
  assert.match(sql, /dividida_de/);
  assert.match(sql, /grant execute on function public\.frotas_manutencao_dividir/);
});

test('seletor: marcar o grupo todo e digitar o serviço realizado', () => {
  const src = lerArquivo('assets/js/modules/frotas-manutencao-seletor.js');
  assert.match(src, /data-pick-todos/);
  assert.match(src, /Serviço realizado ou outro item/);
  // a busca continua achando em todos os grupos
  assert.ok(buscarItens({ grupos: base.grupos, componentes: base.componentes, categorias: base.categorias }, 'pastilha').length >= 1);
});

test('pagou antes ou a nota chegou antes: o que falta é anexado depois, na própria nota da ficha', () => {
  const ficha = (notas) => htmlFicha(m({ status: 'concluida', custo: 500, data_execucao: '2026-10-16', km_execucao: 48000 }), { itens: [itemFreio], orcamentos: [], base, podeAprovar: true, notas, semCabecalho: true });
  const soComprovante = ficha([nota({ comprovante_url: 'pix.png', pago_em: '2026-10-16T12:00:00Z' })]);
  assert.match(soComprovante, /data-anexar-nf="n1"/);
  assert.doesNotMatch(soComprovante, /data-anexar-comp=/);
  const soNf = ficha([nota({ anexo_url: 'nf.pdf' })]);
  assert.match(soNf, /data-anexar-comp="n1"/);
  assert.match(soNf, /data-anexar-data="n1"/);
  assert.doesNotMatch(soNf, /data-anexar-nf=/);
  const completa = ficha([nota({ anexo_url: 'nf.pdf', comprovante_url: 'pix.png', pago_em: '2026-10-16T12:00:00Z' })]);
  assert.doesNotMatch(completa, /data-anexar-/);
  assert.doesNotMatch(ficha([]), /fm-mod-head/, 'ficha dentro do cartão não tem cabeçalho de janela');
});
