import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ETAPAS, acoesDoCard, contarPorEtapa, etapaDaManutencao, manutencoesDaEtapa, situacaoPagamento,
} from '../assets/js/modules/frotas-manutencao-etapas.js';
import { htmlCard, htmlCards, htmlCasca, htmlEtapas } from '../assets/js/modules/frotas-manutencao-cards.js';
import { buscarItens } from '../assets/js/modules/frotas-manutencao-seletor.js';
import { faltantesDoOrcamento, htmlFicha, htmlLinhaOrcamento } from '../assets/js/modules/frotas-manutencao-html.js';
import { linhasIniciais, normalizarLinhas, somarLinhas } from '../assets/js/modules/frotas-manutencao-regras.js';

// Corretiva por etapas (modelo de Compras): a etapa é derivada do status do banco e dos pagamentos/notas. Não há etapa de
// solicitação: quem registra é da equipe de Frotas e a manutenção nasce em Cotações.

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

test('as etapas começam em Cotações (sem Solicitações): cotações, em andamento, à pagar, aguardando NF, concluído', () => {
  assert.deepEqual(ETAPAS.map((e) => e.rotulo).slice(0, 5), ['Cotações', 'Em andamento', 'À pagar', 'Aguardando NF', 'Concluído']);
  assert.ok(!ETAPAS.some((e) => /solicita/i.test(e.rotulo)), 'não existe etapa de solicitação');
  assert.equal(ETAPAS.at(-1).id, 'canceladas', 'canceladas ficam num atalho à parte, no fim');
});

test('a etapa vem do status: solicitada, orçamento e aprovação são Cotações; aprovada e na oficina são Em andamento', () => {
  const etapa = (status) => etapaDaManutencao(m({ status }));
  for (const s of ['solicitada', 'em_orcamento', 'em_aprovacao', 'reprovada']) assert.equal(etapa(s), 'cotacoes', s);
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
  assert.deepEqual(contarPorEtapa(lista, notasPorManut), { cotacoes: 3, andamento: 0, apagar: 1, nf: 0, concluido: 1, canceladas: 1 });
  const ids = (extra, etapa = 'cotacoes') => manutencoesDaEtapa(lista, { etapa, ...extra }, { notasPorManut }).map((x) => x.id);
  assert.deepEqual(ids({}), ['a', 'b', 'c'], 'urgentes primeiro');
  assert.deepEqual(ids({ busca: 'aar5a19' }), ['b']);
  assert.deepEqual(ids({}, 'concluido'), ['e']);
});

test('ações da coluna da direita seguem o fluxo e, concluída, oferecem notas e envio ao GRM/Financeiro', () => {
  const ids = (mm, ctx = {}) => acoesDoCard(mm, { podeAprovar: true, itens: [itemFreio], orcamentos: [], notas: [], ...ctx }).map((a) => a.id);
  assert.deepEqual(ids(m()), ['aprovar_sem_orcamento', 'iniciar_orcamento', 'cancelar'], 'registrada por outro caminho (plano, checklist): inicia a cotação ou aprova direto');
  assert.equal(acoesDoCard(m(), { podeAprovar: true }).find((a) => a.id === 'iniciar_orcamento').titulo, 'Iniciar a cotação');
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

test('cartão: só a primeira linha, ações à direita em linha e a ficha dentro do cartão (sem botão de voltar)', () => {
  const ctx = (extra = {}) => ({ itensPorManut: new Map([['m1', [itemFreio, itemMao]]]), orcsPorManut: new Map(), notasPorManut: new Map(), base, etapa: 'cotacoes', aberto: null, podeAprovar: true, ...extra });
  const cot = htmlCard(m({ status: 'em_orcamento', solicitante_nome: 'Ana' }), ctx());
  assert.match(cot, /class="fm-mc-acoes"/);
  assert.match(cot, /data-mc-acao="orcamento"/);
  assert.match(cot, /data-mc-acao="detalhes"/);
  for (const txt of ['MAN-000072', 'BDK4J22', 'Renault Kwid', 'Barulho ao frear', 'Ana']) assert.match(cot, new RegExp(txt));
  assert.doesNotMatch(cot, /data-check-|fm-mc-itens|Pastilha de freio/, 'sem caixas de marcar: os itens só aparecem na ficha');
  assert.doesNotMatch(cot, /fm-badge|fm-mc-val/, 'o cabeçalho só tem código, veículo, motivo, data, solicitante e ações');
  assert.doesNotMatch(cot, /id="fmFicha"/, 'fechado: sem ficha');
  const aberto = htmlCard(m({ status: 'em_orcamento' }), ctx({ aberto: 'm1' }));
  assert.match(aberto, /id="fmFicha" data-detalhe/);
  assert.match(aberto, /aria-expanded="true"/);
  assert.doesNotMatch(aberto, /Voltar/);
  const xss = '<img src=x onerror=alert(1)>';
  assert.doesNotMatch(htmlCard(m({ descricao: xss, solicitante_nome: xss }), ctx()), /<img src=x/);
});

test('cada etapa é um cartão com contador (inclusive zero) que troca a lista', () => {
  const html = htmlEtapas({ cotacoes: 0, andamento: 1, apagar: 0, nf: 0, concluido: 5, canceladas: 0 }, 'cotacoes');
  assert.equal((html.match(/class="fm-kcard tone-/g) || []).length, ETAPAS.length);
  assert.match(html, /data-filtro="andamento"/);
  assert.doesNotMatch(html, /Solicita/);
  for (const rotulo of ['Cotações', 'Em andamento', 'À pagar', 'Aguardando NF', 'Concluído']) assert.match(html, new RegExp(rotulo));
  assert.match(html, /<button[^>]*data-filtro="cotacoes"[^>]*aria-pressed="true"/, 'a etapa aberta fica destacada');
  assert.match(html, /<strong >5<\/strong>/);
  assert.doesNotMatch(htmlCasca(), /ds-tabs|frotas-hub-tabs/, 'a linha de abas saiu');
  assert.match(htmlCasca(), /fm-kpis fm-etapas" data-etapas/);
  assert.match(htmlCards([], { etapa: 'andamento' }), /Nenhuma manutenção nesta etapa/);
});

test('o controlador não tem página de ficha com botão de voltar: a ficha abre no cartão e a nova manutenção é uma janela', () => {
  const ctrl = lerArquivo('assets/js/modules/frotas-manutencao.js');
  assert.doesNotMatch(ctrl, /Voltar para a lista/);
  assert.doesNotMatch(ctrl, /mostrarPagina|htmlPagina/);
  assert.match(ctrl, /openModal\(\{ id: NOVA/);
  assert.match(ctrl, /mudarStatus\(state\.supabase, id, 'em_orcamento'\)/, 'a nova manutenção já nasce em cotação');
  assert.doesNotMatch(ctrl, /dividir|marcadas|solicitacoes/, 'sem etapa de solicitação nem marcação de itens no cartão');
  assert.doesNotMatch(lerArquivo('assets/js/modules/frotas-manutencao-html.js'), /Voltar para a lista/);
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

test('ficha dentro do cartão: sem selo "Em orçamento" nem "Próximo passo"; selo só onde a etapa tem mais de um status', () => {
  const ficha = (extra) => htmlFicha(m({ status: 'em_orcamento', ...extra }), { itens: [itemFreio], orcamentos: [], base, podeAprovar: true, semCabecalho: true });
  const emOrcamento = ficha({});
  assert.doesNotMatch(emOrcamento, /Próximo passo|fm-etapa|>Em orçamento</);
  assert.doesNotMatch(emOrcamento, /ver-veiculo|Ver veículo/, 'sem o botão Ver veículo');
  for (const status of ['em_aprovacao', 'reprovada', 'em_execucao']) assert.match(ficha({ status }), new RegExp(status === 'em_aprovacao' ? 'Em aprovação' : status === 'reprovada' ? 'Reprovada' : 'Em execução'), status);
});

test('a previsão de entrega fica à vista nos dados, fora de "Mais detalhes"', () => {
  const html = htmlFicha(m({ status: 'em_orcamento', previsao_entrega: '2026-10-30' }), { itens: [], orcamentos: [], base, podeAprovar: true, semCabecalho: true });
  assert.match(html, /Previsão de entrega/);
  assert.match(html, /data-campo="previsao_entrega" value="2026-10-30"/);
});

test('cotação: botão "Adicionar cotação", valor total à vista e o detalhe por item opcional', () => {
  const ficha = htmlFicha(m({ status: 'em_orcamento' }), { itens: [itemFreio], orcamentos: [], base, podeAprovar: true, semCabecalho: true });
  assert.match(ficha, /data-acao="orc-novo">\+ Adicionar cotação/);
  assert.match(ficha, /Cotações \(0\)/);
  const aberta = htmlFicha(m({ status: 'em_orcamento' }), { itens: [itemFreio], orcamentos: [], base, podeAprovar: true, semCabecalho: true, orcForm: true });
  const antesDoDetalhe = aberta.slice(aberta.indexOf('data-orc-form'), aberta.indexOf('data-orc-itens'));
  assert.match(antesDoDetalhe, /data-o="fornecedor"/);
  assert.match(antesDoDetalhe, /data-o="valor_total"/, 'valor total antes do detalhe por item');
  assert.match(aberta, /Detalhar por item/);
  assert.match(aberta, /data-acao="orc-salvar">Adicionar cotação/);
});

test('peça faltante: o fornecedor não tem a peça ou o serviço; a linha fica sem valor e a cotação mostra o que falta', () => {
  const linha = htmlLinhaOrcamento({ nome: 'Disco de freio', tipo: 'peca', faltante: true, valor: 99 });
  assert.match(linha, /data-ol="faltante" checked/);
  assert.match(linha, /data-ol="valor"[^>]*disabled/);
  assert.doesNotMatch(linha, /value="99"/, 'peça faltante não leva valor');
  assert.match(htmlLinhaOrcamento({ nome: 'Disco', tipo: 'peca' }), />\s*Peça faltante<\/label>/);
  const normal = normalizarLinhas([{ nome: 'Pastilha', valor: 120, tipo: 'peca' }, { nome: 'Disco', valor: 50, tipo: 'peca', faltante: true }, { nome: 'Fluido', tipo: 'peca' }]);
  assert.deepEqual(normal, [{ nome: 'Pastilha', detalhe: '', valor: 120, tipo: 'peca' }, { nome: 'Disco', detalhe: '', valor: null, tipo: 'peca', faltante: true }]);
  assert.equal(somarLinhas(normal, 'peca'), 120, 'a faltante não entra na soma');
  assert.equal(linhasIniciais([itemFreio], normal).find((l) => l.nome === 'Disco').faltante, true);
  const orc = { id: 'o1', manutencao_id: 'm1', fornecedor: 'Oficina A', valor_total: 120, selecionado: false, linhas: normal };
  assert.deepEqual(faltantesDoOrcamento(orc), ['Disco']);
  const ficha = htmlFicha(m({ status: 'em_orcamento' }), { itens: [itemFreio], orcamentos: [orc], base, podeAprovar: true, semCabecalho: true });
  assert.match(ficha, /Peça faltante: Disco/);
  assert.match(ficha, /Cotações \(1\)/);
});

test('itens da manutenção: lista única que remove só o componente; o controlador trata o clique', () => {
  const ctrl = lerArquivo('assets/js/modules/frotas-manutencao.js');
  assert.match(ctrl, /acao === 'linha-remover'/);
  assert.match(ctrl, /itensDet/, 'lembra se a lista está aberta ao redesenhar a ficha');
  assert.match(ctrl, /faltantesDoOrcamento\(sel\)/, 'aprovar avisa o que o fornecedor não tem');
});

test('dados da manutenção: só previsão de entrega, prioridade, quem paga e veículo parado (sem "Mais detalhes")', () => {
  const html = htmlFicha(m({ status: 'em_orcamento' }), { itens: [], orcamentos: [], base, podeAprovar: true, semCabecalho: true });
  const dados = html.slice(html.indexOf('Dados da manutenção'), html.indexOf('Itens da manutenção'));
  for (const rotulo of ['Previsão de entrega', 'Prioridade', 'Quem paga', 'Veículo parado']) assert.match(dados, new RegExp(`<label>${rotulo}</label>`));
  for (const fora of ['Solicitante', 'Problema / serviço', '<label>Veículo</label>', 'Motorista', 'Natureza', 'Diagnóstico', 'Mais detalhes']) assert.doesNotMatch(html, new RegExp(fora), `${fora} não aparece na ficha`);
  assert.doesNotMatch(html, /data-mais/);
});
