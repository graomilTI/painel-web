import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  COLUNAS, ETAPAS, acoesDoCard, contarPorEtapa, etapaDaManutencao, manutencoesDaEtapa, ordenarManutencoes, situacaoPagamento,
} from '../assets/js/modules/frotas-manutencao-etapas.js';
import { UFS_BRASIL, cidadesDaUf, htmlOpcoesCidade, rotuloCidadeUf } from '../assets/js/modules/frotas-manutencao-cidades.js';
import { htmlCard, htmlCards, htmlCasca, htmlEtapas } from '../assets/js/modules/frotas-manutencao-cards.js';
import { faltantesDoOrcamento, htmlComparativo, htmlFicha, htmlFormNova, htmlLinhaOrcamento, htmlModalHistorico, htmlModalOrcamento } from '../assets/js/modules/frotas-manutencao-html.js';
import { linhasIniciais, normalizarLinhas, somarLinhas, validarSolicitacao } from '../assets/js/modules/frotas-manutencao-regras.js';

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
  assert.deepEqual(ids(m()), ['iniciar_orcamento', 'cancelar'], 'toda aprovação passa por orçamento: a solicitação só inicia a cotação');
  assert.equal(acoesDoCard(m(), { podeAprovar: true }).find((a) => a.id === 'iniciar_orcamento').titulo, 'Iniciar a cotação');
  assert.deepEqual(ids(m({ status: 'em_orcamento' })), ['orcamento', 'enviar_aprovacao', 'cancelar'], 'em cotação: orçamento primeiro');
  assert.ok(ids(m({ status: 'aprovada' })).includes('emitir_os'));
  assert.ok(ids(m({ status: 'em_execucao' })).includes('concluir'));
  const conc = m({ status: 'concluida', custo: 500 });
  assert.deepEqual(ids(conc), ['notas']);
  assert.deepEqual(ids(conc, { notas: [nota({ anexo_url: 'nf.pdf' })] }), ['notas', 'enviar_notas']);
  assert.deepEqual(ids(conc, { notas: [nota({ anexo_url: 'nf.pdf', enviada_em: '2026-10-20T12:00:00Z' })] }), ['notas'], 'nota já enviada não pede novo envio');
  assert.deepEqual(ids(m({ status: 'concluida', responsavel_pagamento: 'locadora' })), [], 'paga por outro: nada a enviar');
  for (const status of ['solicitada', 'em_orcamento', 'em_aprovacao', 'reprovada']) {
    assert.ok(!ids(m({ status })).includes('aprovar_sem_orcamento'), `não há aprovação sem orçamento em ${status}`);
  }
});

test('cartão: uma linha com código, placa, responsável, cidade/UF, entrada e previsão; ações à direita; ficha no cartão', () => {
  const ctx = (extra = {}) => ({ itensPorManut: new Map([['m1', [itemFreio, itemMao]]]), orcsPorManut: new Map(), notasPorManut: new Map(), base, etapa: 'cotacoes', aberto: null, podeAprovar: true, ...extra });
  const cot = htmlCard(m({ status: 'em_orcamento', solicitante_nome: 'Ana', cidade: 'Cascavel', uf: 'PR', solicitado_em: '2026-10-19T15:00:00Z', previsao_entrega: '2026-10-30' }), ctx());
  assert.match(cot, /class="fm-mc-acoes"/);
  assert.match(cot, /data-mc-acao="orcamento"/);
  assert.doesNotMatch(cot, /data-mc-acao="detalhes"/, 'abrir a linha é só clicar nela: sem botão de olho para isso');
  assert.doesNotMatch(cot, /data-mc-acao="comparar"/, 'sem cotações não há o que comparar');
  const orcA = { id: 'o1', manutencao_id: 'm1', fornecedor: 'Oficina A', valor_total: 500, valor_pecas: 400, valor_mao_obra: 100, prazo_dias: 3, linhas: [{ nome: 'Pastilha', valor: 400, tipo: 'peca' }, { nome: 'Disco', faltante: true, tipo: 'peca' }] };
  const orcB = { id: 'o2', manutencao_id: 'm1', fornecedor: 'Oficina B', valor_total: 450, selecionado: true, linhas: [{ nome: 'Pastilha', valor: 350, tipo: 'peca' }, { nome: 'Disco', valor: 100, tipo: 'peca' }] };
  const comOrc = htmlCard(m({ status: 'em_orcamento' }), ctx({ orcsPorManut: new Map([['m1', [orcA, orcB]]]) }));
  assert.match(comOrc, /data-mc-acao="comparar"[^>]*title="Comparar as cotações \(2\)"/, 'o olho compara as cotações');
  const cmp = htmlComparativo(m({ status: 'em_orcamento' }), [orcA, orcB]);
  assert.match(cmp, /Comparativo de cotações/);
  assert.match(cmp, /Oficina A[^]*Oficina B/);
  assert.match(cmp, /fm-cmp-total menor">R\$&nbsp;450,00|fm-cmp-total menor">R\$\s450,00/, 'o menor total fica em destaque');
  assert.match(cmp, /Faltante/, 'peça faltante aparece na coluna da oficina');
  assert.match(cmp, /data-acao="cmp-escolher" data-id="o1"/, 'só escolhe a que ainda não foi escolhida');
  assert.doesNotMatch(cmp, /data-acao="cmp-escolher" data-id="o2"/);
  assert.doesNotMatch(htmlComparativo(m({ status: 'aprovada' }), [orcA, orcB]), /cmp-escolher/, 'aprovada: só leitura');
  for (const [rot, valor] of [['Código', 'MAN-000072'], ['Placa', 'BDK4J22'], ['Responsável', 'Ana'], ['Cidade/UF', 'Cascavel/PR'], ['Entrada', '19/10/2026'], ['Previsão', '30/10/2026']]) {
    assert.ok(cot.includes(`data-rot="${rot}"`) && cot.slice(cot.indexOf(`data-rot="${rot}"`)).includes(valor), `${rot}: ${valor}`);
  }
  assert.doesNotMatch(cot, /Pastilha de freio|data-check-|fm-badge/, 'itens e selos ficam fora da linha');
  assert.match(cot, /title="[^"]*Barulho ao frear/, 'o motivo e o modelo ficam na dica da linha');
  assert.match(htmlCard(m({ status: 'em_orcamento' }), ctx()), /data-rot="Cidade\/UF">—/, 'sem cidade: traço');
  assert.match(htmlCard(m({ status: 'em_orcamento', previsao_entrega: '2020-01-01' }), ctx()), /fm-atraso/, 'previsão vencida em vermelho');
  assert.doesNotMatch(htmlCard(m({ status: 'concluida', custo: 0, previsao_entrega: '2020-01-01' }), ctx()), /fm-atraso/, 'encerrada não atrasa');
  assert.doesNotMatch(cot, /id="fmFicha"/, 'fechado: sem ficha');
  const aberto = htmlCard(m({ status: 'em_orcamento' }), ctx({ aberto: 'm1' }));
  assert.match(aberto, /id="fmFicha" data-detalhe/);
  assert.match(aberto, /aria-expanded="true"/);
  assert.doesNotMatch(aberto, /Voltar/);
  const xss = '<img src=x onerror=alert(1)>';
  assert.doesNotMatch(htmlCard(m({ descricao: xss, solicitante_nome: xss, cidade: xss }), ctx()), /<img src=x/);
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
  assert.match(ctrl, /mudarStatus\(state\.supabase, id, 'em_orcamento', \{ uf:/, 'a nova manutenção já nasce em cotação, com UF e cidade');
  assert.doesNotMatch(ctrl, /dividir|marcadas|solicitacoes/, 'sem etapa de solicitação nem marcação de itens no cartão');
  assert.doesNotMatch(lerArquivo('assets/js/modules/frotas-manutencao-html.js'), /Voltar para a lista/);
});

test('seletor: marcar o grupo todo e digitar o serviço realizado', () => {
  const src = lerArquivo('assets/js/modules/frotas-manutencao-seletor.js');
  assert.match(src, /data-pick-todos/);
  assert.match(src, /Serviço realizado ou outro item/);
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

test('cotação: sem cabeçalho (o ícone do cartão abre o formulário), campos numa linha com seta, valor total à vista e detalhe por item opcional', () => {
  const ficha = htmlFicha(m({ status: 'em_orcamento' }), { itens: [itemFreio], orcamentos: [], base, podeAprovar: true, semCabecalho: true });
  assert.doesNotMatch(ficha, /Cotações \(0\)|data-acao="orc-novo"|fm-h4-acoes/, 'sem a linha de título e botões das cotações');
  assert.doesNotMatch(ficha, /data-orc-form/, 'o formulário só aparece quando aberto pelo ícone do cartão');
  const aberta = htmlModalOrcamento(m({ status: 'em_orcamento' }), base, {}, [itemFreio]);
  assert.match(aberta, /Adicionar cotação<\/h3>/, 'janela com título');
  assert.match(aberta, /fm-nova-rodape[^]*data-acao="orc-cancelar"[^]*data-acao="orc-salvar"/, 'Cancelar e Salvar no rodapé da janela');
  assert.match(htmlModalOrcamento(m({ status: 'em_orcamento' }), base, { id: 'o1' }, []), /Editar cotação<\/h3>[^]*Salvar cotação/);
  const antesDoDetalhe = aberta.slice(aberta.indexOf('data-orc-form'), aberta.indexOf('data-orc-itens'));
  assert.match(antesDoDetalhe, /data-o="fornecedor"/);
  assert.match(antesDoDetalhe, /data-o="valor_total"/, 'valor total antes do detalhe por item');
  assert.match(aberta, /Detalhar por item/);
  assert.match(aberta, /<details class="fm-mais fm-field full" open><summary>Oficina \/ fornecedor<\/summary>\s*<div class="fm-orc-linha">/, 'seta ao lado de Oficina, como os outros campos');
  const linha = aberta.slice(aberta.indexOf('fm-orc-linha'), aberta.indexOf('data-orc-itens'));
  for (const campo of ['fornecedor', 'valor_total', 'prazo_dias', 'data-o-arquivo']) assert.match(linha, new RegExp(campo), `${campo} na mesma linha`);
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
  assert.doesNotMatch(ficha, /Cotações \(1\)/);
});

test('itens: sem lista à parte; adicionar itens só na janela da cotação (e no seletor da ficha sem itens); histórico na linha de ações', () => {
  const ficha = (extra = {}) => htmlFicha(m({ status: 'em_orcamento' }), { itens: [itemFreio], orcamentos: [], base, podeAprovar: true, semCabecalho: true, ...extra });
  assert.doesNotMatch(ficha(), /Itens da manutenção|fm-il-lista/);
  assert.doesNotMatch(ficha(), /itens-abrir|hist-alternar|fm-dados-botoes|data-add-itens/, 'a linha dos campos não tem botões de itens nem de histórico');
  const janela = htmlModalOrcamento(m({ status: 'em_orcamento' }), base, {}, [itemFreio]);
  assert.match(janela, /data-acao="orc-itens-abrir">\+ Adicionar itens/, 'adicionar itens fica dentro da janela da cotação');
  assert.match(janela, /data-orc-add-itens hidden[^]*data-pick-grupos[^]*orc-itens-confirmar[^]*orc-itens-cancelar/, 'o seletor de grupos fica escondido até abrir');
  const ev = [{ em: '2026-10-01T10:00:00Z', para: 'em_orcamento', por: 'Ana' }];
  const comHist = htmlCard(m({ status: 'em_orcamento', linha_tempo: ev }), { itensPorManut: new Map(), orcsPorManut: new Map(), notasPorManut: new Map(), base, etapa: 'cotacoes', aberto: null, podeAprovar: true });
  assert.match(comHist, /data-mc-acao="historico"[^>]*title="Histórico \(1\)"/, 'histórico na linha de ações do cartão');
  assert.doesNotMatch(htmlCard(m({ status: 'em_orcamento', linha_tempo: [] }), { itensPorManut: new Map(), orcsPorManut: new Map(), notasPorManut: new Map(), base, etapa: 'cotacoes', aberto: null, podeAprovar: true }), /data-mc-acao="historico"/);
  const hist = htmlModalHistorico(m({ linha_tempo: [...ev, { em: '2026-10-02T10:00:00Z', de: 'em_orcamento', para: 'em_aprovacao', por: '<img src=x>' }] }));
  assert.match(hist, /Histórico \(2\)/);
  assert.ok(hist.indexOf('Em aprovação') < hist.indexOf('Em orçamento'), 'o mais recente primeiro');
  assert.doesNotMatch(hist, /<img src=x/, 'texto escapado');
  const aberto = htmlFicha(m({ status: 'em_orcamento' }), { itens: [], orcamentos: [], base, podeAprovar: true, semCabecalho: true });
  assert.match(aberto, /data-add-itens/, 'sem itens, a ficha já abre o seletor');
  assert.doesNotMatch(htmlFicha(m({ status: 'concluida', custo: 10 }), { itens: [itemFreio], orcamentos: [], base, podeAprovar: true, semCabecalho: true }), /itens-abrir|data-add-itens/, 'encerrada não aceita itens');
  const ctrl = lerArquivo('assets/js/modules/frotas-manutencao.js');
  assert.match(ctrl, /acao === 'itens-confirmar'/);
  assert.match(ctrl, /faltantesDoOrcamento\(sel\)/, 'aprovar avisa o que o fornecedor não tem');
});

test('campos da manutenção (sem título, abaixo das cotações): só previsão de entrega, prioridade, quem paga e veículo parado', () => {
  const html = htmlFicha(m({ status: 'em_orcamento' }), { itens: [], orcamentos: [], base, podeAprovar: true, semCabecalho: true });
  assert.doesNotMatch(html, /Dados da manutenção/, 'sem o título do bloco');
  const dados = html.slice(html.indexOf('Previsão de entrega') - 40);
  for (const rotulo of ['Previsão de entrega', 'Prioridade', 'Quem paga', 'Veículo parado']) assert.match(dados, new RegExp(`<label>${rotulo}</label>`));
  for (const fora of ['Solicitante', 'Problema / serviço', '<label>Veículo</label>', 'Motorista', 'Natureza', 'Diagnóstico', 'Mais detalhes']) assert.doesNotMatch(html, new RegExp(fora), `${fora} não aparece na ficha`);
  assert.doesNotMatch(html, /data-mais/);
});

test('ordem da ficha: cotações primeiro e os campos da manutenção logo abaixo', () => {
  const html = htmlFicha(m({ status: 'em_orcamento' }), { itens: [itemFreio], orcamentos: [], base, podeAprovar: true, semCabecalho: true });
});

test('cotação: fornecedor com busca nas oficinas cadastradas (milhares, importadas do GRM) e oficinas lidas em páginas', () => {
  const oficinas = [{ id: 'of1', nome: 'Auto Center Sorriso', ativo: true }, { id: 'of2', nome: 'Oficina Antiga', ativo: false }];
  const form = htmlModalOrcamento(m({ status: 'em_orcamento' }), { ...base, oficinas }, {}, [itemFreio]);
  assert.match(form, /list="fmListaOficinas" data-o="fornecedor"/);
  assert.match(form, /<option value="Auto Center Sorriso">/);
  assert.doesNotMatch(form, /Oficina Antiga/, 'inativas não entram na busca');
  assert.match(form, /type="hidden" data-o="oficina_id"/);
  assert.doesNotMatch(form, /<select[^>]*data-o="oficina_id"/, 'sem lista suspensa com milhares de opções');
  const dados = lerArquivo('assets/js/modules/frotas-manutencao-dados.js');
  assert.match(dados, /export async function carregarOficinasTodas[^]*?tudoPaginado/, 'a API corta em 1.000 linhas');
  assert.match(lerArquivo('assets/js/modules/frotas-manutencao-oficinas.js'), /carregarOficinasTodas/);
});

test('seletor: os grupos formam uma grade de 12 colunas (só ícones, uma linha) e o grupo clicado abre os itens logo abaixo', () => {
  const src = lerArquivo('assets/js/modules/frotas-manutencao-seletor.js');
  assert.match(src, /class="fm-pick-grade" data-pick-grupos/);
  assert.match(src, /data-pick-abertos/);
  assert.match(src, /data-pick-gc="\$\{g\.codigo\}"/, 'itens do grupo, abaixo da grade');
  assert.match(lerArquivo('assets/js/modules/frotas-manutencao-estilos.js'), /\.fm-pick-grade\{display:grid;grid-template-columns:repeat\(12,minmax\(0,1fr\)\)/);
});

test('Atualizar e Nova manutenção são ícones na linha das abas do painel de Frotas (à direita)', () => {
  const grupo = lerArquivo('assets/js/frotas-manutencao-grupo.js');
  assert.match(grupo, /<div class="frotas-hub-acoes" data-hub-acoes><\/div>/);
  assert.match(grupo, /acoesHub\.innerHTML = ''/, 'cada aba limpa e põe os seus botões');
  const ctrl = lerArquivo('assets/js/modules/frotas-manutencao.js');
  assert.match(ctrl, /document\.querySelector\('\[data-hub-acoes\]'\)/);
  assert.match(ctrl, /htmlCasca\(\{ comTopo: !hub \}\)/);
  assert.match(lerArquivo('assets/css/frotas-hub.css'), /\.frotas-hub-acoes\s*\{/);
});

test('cabeçalho ordenável: código, placa, responsável, cidade/UF, entrada e previsão', () => {
  const cab = htmlCards([m({ status: 'em_orcamento' })], { itensPorManut: new Map(), orcsPorManut: new Map(), notasPorManut: new Map(), base, etapa: 'cotacoes', aberto: null, podeAprovar: true, ordem: { coluna: 'placa', sentido: 'desc' } });
  assert.deepEqual([...cab.matchAll(/data-ordenar="(\w+)"/g)].map((x) => x[1]), COLUNAS.map((c) => c.id));
  assert.deepEqual(COLUNAS.map((c) => c.rotulo), ['Código', 'Placa', 'Responsável', 'Cidade/UF', 'Entrada', 'Previsão']);
  assert.match(cab, /data-ordenar="placa" aria-sort="descending"[^>]*>Placa<span aria-hidden="true">▼/);
  assert.match(cab, /data-ordenar="codigo" aria-sort="none"/);
  assert.doesNotMatch(htmlCards([], { etapa: 'cotacoes' }), /data-ordenar/, 'sem manutenções não há cabeçalho');
});

test('ordenar por coluna: texto sem acento, datas, código numérico; vazio sempre no fim; sem coluna mantém a ordem', () => {
  const l = [
    m({ id: 'a', numero: 10, __placa: 'BBB1B11', solicitante_nome: 'Zé', uf: 'PR', cidade: 'Cascavel', solicitado_em: '2026-10-20T10:00:00Z', previsao_entrega: '2026-11-02' }),
    m({ id: 'b', numero: 9, __placa: 'AAA1A11', solicitante_nome: 'Ana', uf: 'MT', cidade: 'Sorriso', solicitado_em: '2026-10-21T10:00:00Z', previsao_entrega: null }),
    m({ id: 'c', numero: 100, __placa: 'CCC1C11', solicitante_nome: 'álvaro', uf: null, cidade: null, solicitado_em: '2026-10-19T10:00:00Z', previsao_entrega: '2026-10-25' }),
  ];
  const ids = (coluna, sentido = 'asc') => ordenarManutencoes(l, { coluna, sentido }).map((x) => x.id);
  assert.deepEqual(ids('codigo'), ['b', 'a', 'c'], 'código é número: 9 < 10 < 100');
  assert.deepEqual(ids('codigo', 'desc'), ['c', 'a', 'b']);
  assert.deepEqual(ids('placa'), ['b', 'a', 'c']);
  assert.deepEqual(ids('responsavel'), ['c', 'b', 'a'], 'álvaro antes de Ana, sem acento');
  assert.deepEqual(ids('cidade'), ['b', 'a', 'c'], 'MT antes de PR; sem cidade no fim');
  assert.deepEqual(ids('cidade', 'desc'), ['a', 'b', 'c'], 'sem cidade no fim também no sentido inverso');
  assert.deepEqual(ids('entrada', 'desc'), ['b', 'a', 'c']);
  assert.deepEqual(ids('previsao'), ['c', 'a', 'b'], 'sem previsão no fim');
  assert.deepEqual(ids('previsao', 'desc'), ['a', 'c', 'b']);
  assert.deepEqual(ordenarManutencoes(l, null).map((x) => x.id), ['a', 'b', 'c']);
  const emOrcamento = l.map((x) => ({ ...x, status: 'em_orcamento' }));
  assert.deepEqual(manutencoesDaEtapa(emOrcamento, { etapa: 'cotacoes', ordem: { coluna: 'placa', sentido: 'asc' } }).map((x) => x.id), ['b', 'a', 'c']);
  assert.deepEqual(manutencoesDaEtapa(emOrcamento, { etapa: 'cotacoes', busca: 'sorriso' }).map((x) => x.id), ['b'], 'a busca acha pela cidade');
});

test('nova manutenção: UF e cidade (relação do IBGE), obrigatórias, gravadas junto com o início da cotação', () => {
  const baseNova = { ...base, veiculos: [], colaboradores: [] };
  const nova = htmlFormNova(baseNova, { uf: 'PR', cidade: 'Cascavel' });
  assert.match(nova, /data-n-uf>[^]*?<option value="PR" selected>PR<\/option>/);
  assert.match(nova, /data-n-cidade>[^]*?<option value="Cascavel" selected>Cascavel<\/option>/, 'cidade já escolhida (preset) aparece mesmo antes de baixar a lista');
  assert.match(htmlFormNova(baseNova, {}), /data-n-cidade disabled>[^]*?Escolha a UF/);
  const base1 = { veiculo_id: 'v', descricao: 'x', itens: [{ categoria_codigo: 1 }] };
  assert.deepEqual(validarSolicitacao({ ...base1, uf: '', cidade: '' }), ['Escolha a UF.']);
  assert.deepEqual(validarSolicitacao({ ...base1, uf: 'PR', cidade: '' }), ['Escolha a cidade.']);
  assert.deepEqual(validarSolicitacao({ ...base1, uf: 'PR', cidade: 'Cascavel' }), []);
  assert.deepEqual(validarSolicitacao(base1), [], 'quem não informa local (outros caminhos) não é cobrado');
});

test('cidades do IBGE: por UF em ordem alfabética, mesmo cache da abertura de OS', () => {
  const lista = [{ nome: 'Sorriso', uf: 'MT' }, { nome: 'Água Boa', uf: 'MT' }, { nome: 'Cascavel', uf: 'PR' }, { nome: 'Alta Floresta', uf: 'MT' }];
  assert.deepEqual(cidadesDaUf('MT', lista), ['Água Boa', 'Alta Floresta', 'Sorriso']);
  assert.deepEqual(cidadesDaUf('', lista), []);
  assert.equal(UFS_BRASIL.length, 27);
  assert.match(htmlOpcoesCidade('MT', 'Sorriso', lista), /<option value="Sorriso" selected>/);
  assert.match(htmlOpcoesCidade('MT', 'Cidade Antiga', lista), /<option value="Cidade Antiga" selected>/, 'cidade gravada que a lista não tem não some');
  assert.equal(htmlOpcoesCidade('', '', lista), '<option value="">Escolha a UF</option>');
  assert.equal(rotuloCidadeUf({ cidade: 'Cascavel', uf: 'PR' }), 'Cascavel/PR');
  assert.equal(rotuloCidadeUf({}), '');
  assert.match(lerArquivo('assets/js/modules/frotas-manutencao-cidades.js'), /grm:cidades_ibge:v1/, 'o cache é o mesmo de logistica.js e programacao.js');
  assert.match(lerArquivo('supabase/migrations/20261022140000_frotas_manutencao_cidade_uf.sql'), /add column if not exists uf text[^]*add column if not exists cidade text/);
});
