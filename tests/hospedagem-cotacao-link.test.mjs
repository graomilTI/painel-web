import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cnpjValido, estimarTotal, lerValor, situacaoDoLink, tiposNecessarios, validarResposta } from '../supabase/functions/hospedagem-cotacao-publica/regras.js';
import {
  capacidadesDoGrupo, compararCotacoes, descreverQuartos, linkAberto, linkWhatsapp, mensagemDoLink, montarPedidoReserva, montarQuartos, urlDoLink,
} from '../assets/js/modules/hospedagem/cotacao.js';

// Cotação de hospedagem por link: o hotel responde sem login e o ADM compara as respostas no painel.

const le = (caminho) => readFileSync(new URL(`../${caminho}`, import.meta.url), 'utf8');

const QUARTOS = [
  { tipo_quarto: 'INDIVIDUAL', genero: 'FEM', capacidade: 1, quantidade: 1 },
  { tipo_quarto: 'DUPLO', genero: 'MASC', capacidade: 2, quantidade: 2 },
];
const RESPOSTA_OK = {
  disponivel: true, precos: { INDIVIDUAL: '150,00', DUPLO: '1.200,50' }, cafe_incluso: true, almoco_incluso: false, janta_inclusa: false,
  estacionamento_incluso: true, aceita_pagamento_checkout: true, emite_nf: true, formas_pagamento: ['PIX', 'Boleto'],
  atendente_nome: 'Maria', atendente_telefone: '(65) 99999-1111', observacoes: '  chegada após 14h ',
  cnpj: '11.222.333/0001-81', razao_social: ' Hotel   Girassol Ltda ', regime_tributario: 'simples_nacional',
  endereco: { cep: '78890-000', logradouro: 'Av. Brasil', numero: '120', complemento: 'Sala 2', bairro: 'Centro', cidade: 'Sorriso', uf: 'mt' },
  extras_outros: ['wifi', 'tv', 'wifi'], extras_outros_texto: ' transfer ',
};

test('a página pública usa uma cópia idêntica das regras da Edge Function', () => {
  assert.equal(le('supabase/functions/hospedagem-cotacao-publica/regras.js'), le('assets/js/cotacaoHotelRegras.js'));
});

test('valor aceita vírgula, ponto e milhar', () => {
  assert.equal(lerValor('180,50'), 180.5);
  assert.equal(lerValor('R$ 1.234,56'), 1234.56);
  assert.ok(Number.isNaN(lerValor('abc')));
});

test('tipos de quarto pedidos saem sem repetir e em ordem', () => {
  assert.deepEqual(tiposNecessarios([...QUARTOS, { tipo_quarto: 'DUPLO', genero: 'FEM', quantidade: 1 }]), ['INDIVIDUAL', 'DUPLO']);
});

test('resposta completa é normalizada', () => {
  const r = validarResposta(RESPOSTA_OK, QUARTOS);
  assert.equal(r.erro, undefined);
  assert.deepEqual(r.dados.precos, { INDIVIDUAL: 150, DUPLO: 1200.5 });
  assert.equal(r.dados.atendente_telefone, '65999991111');
  assert.equal(r.dados.observacoes, 'chegada após 14h');
  assert.deepEqual(r.dados.formas_pagamento, ['PIX', 'Boleto']);
});

test('empresa, endereço e extras vêm normalizados (as mesmas perguntas de Compras mais o endereço do hotel)', () => {
  const { dados } = validarResposta(RESPOSTA_OK, QUARTOS);
  assert.deepEqual(dados.empresa, { cnpj: '11222333000181', razao_social: 'Hotel Girassol Ltda', regime_tributario: 'simples_nacional' });
  assert.deepEqual(dados.endereco, { cep: '78890000', logradouro: 'Av. Brasil', numero: '120', complemento: 'Sala 2', bairro: 'Centro', cidade: 'Sorriso', uf: 'MT' });
  assert.deepEqual(dados.extras_outros, ['wifi', 'tv']);
  assert.equal(dados.extras_outros_texto, 'transfer');
  assert.equal(cnpjValido('11.222.333/0001-81'), true);
  assert.equal(cnpjValido('11.222.333/0001-82'), false);
});

test('empresa e endereço são obrigatórios quando o hotel tem vaga', () => {
  const erro = (mudanca) => validarResposta({ ...RESPOSTA_OK, ...mudanca }, QUARTOS).erro;
  assert.match(erro({ cnpj: '11222333000182' }), /CNPJ/);
  assert.match(erro({ razao_social: 'A' }), /razão social/);
  assert.match(erro({ regime_tributario: 'mei' }), /regime/);
  assert.match(erro({ endereco: { ...RESPOSTA_OK.endereco, cep: '123' } }), /CEP/);
  assert.match(erro({ endereco: { ...RESPOSTA_OK.endereco, logradouro: '' } }), /rua/);
  assert.match(erro({ endereco: { ...RESPOSTA_OK.endereco, numero: '' } }), /número/);
  assert.match(erro({ endereco: { ...RESPOSTA_OK.endereco, bairro: '' } }), /bairro/);
  assert.match(erro({ endereco: { ...RESPOSTA_OK.endereco, uf: 'XX' } }), /UF/);
  assert.match(erro({ extras_outros: ['jacuzzi'] }), /inválido/);
});

test('os quatro tipos de quarto são cotados: o que o pedido não usa é opcional e fica registrado', () => {
  const r = validarResposta({ ...RESPOSTA_OK, precos: { INDIVIDUAL: '150', DUPLO: '200', TRIPLO: '280', QUADRUPLO: '' } }, QUARTOS);
  assert.equal(r.erro, undefined);
  assert.deepEqual(r.dados.precos, { INDIVIDUAL: 150, DUPLO: 200, TRIPLO: 280 });
  assert.match(validarResposta({ ...RESPOSTA_OK, precos: { INDIVIDUAL: '150', DUPLO: '200', TRIPLO: '-3' } }, QUARTOS).erro, /inválida/);
  assert.match(validarResposta({ ...RESPOSTA_OK, precos: { INDIVIDUAL: '150', DUPLO: '200', SUITE: '99' } }, QUARTOS).erro, /inválido/);
  // Só ter o tipo que o pedido não usa não basta.
  assert.match(validarResposta({ ...RESPOSTA_OK, precos: { INDIVIDUAL: null, DUPLO: null, TRIPLO: '280' }, sem_tipo: ['INDIVIDUAL', 'DUPLO'] }, QUARTOS).erro, /Sem disponibilidade/);
});

test('sem vaga: só o motivo, nada de preço', () => {
  const r = validarResposta({ disponivel: false, observacoes: 'lotado' }, QUARTOS);
  assert.equal(r.dados.disponivel, false);
  assert.deepEqual(r.dados.precos, {});
  assert.equal(r.dados.observacoes, 'lotado');
  assert.equal(r.dados.atendente_telefone, null);
  assert.equal(r.dados.empresa, null);
  assert.deepEqual(r.dados.extras_outros, []);
});

test('resposta com problema volta com a mensagem certa', () => {
  const erro = (mudanca) => validarResposta({ ...RESPOSTA_OK, ...mudanca }, QUARTOS).erro;
  assert.match(validarResposta({}, QUARTOS).erro, /disponibilidade/);
  assert.match(erro({ atendente_nome: '' }), /atendente/);
  assert.match(erro({ atendente_telefone: '123' }), /telefone/);
  assert.match(erro({ precos: { INDIVIDUAL: '150' } }), /duplo/);
  assert.match(erro({ precos: { INDIVIDUAL: '-5', DUPLO: '100' } }), /inválida/);
  assert.match(erro({ cafe_incluso: undefined }), /incluso/);
  assert.match(erro({ emite_nf: 'sim' }), /nota fiscal/);
  assert.match(erro({ aceita_pagamento_checkout: null }), /checkout/);
  assert.match(erro({ formas_pagamento: [] }), /forma de pagamento/);
  assert.match(erro({ formas_pagamento: ['Cheque'] }), /inválida/);
});

test('"Não possuo" só vale se o hotel marcou o tipo', () => {
  const sem = { ...RESPOSTA_OK, precos: { INDIVIDUAL: null, DUPLO: '200' } };
  assert.match(validarResposta(sem, QUARTOS).erro, /individual/);
  const ok = validarResposta({ ...sem, sem_tipo: ['INDIVIDUAL'] }, QUARTOS);
  assert.deepEqual(ok.dados.precos, { INDIVIDUAL: null, DUPLO: 200 });
  const tudo = validarResposta({ ...RESPOSTA_OK, precos: { INDIVIDUAL: null, DUPLO: null }, sem_tipo: ['INDIVIDUAL', 'DUPLO'] }, QUARTOS);
  assert.match(tudo.erro, /Sem disponibilidade/);
});

test('estimativa: soma quartos × diária × noites e avisa o que falta', () => {
  const e = estimarTotal(QUARTOS, { INDIVIDUAL: 150, DUPLO: 200 }, 3);
  assert.deepEqual(e, { completo: true, faltam: [], porNoite: 550, total: 1650 });
  const parcial = estimarTotal(QUARTOS, { DUPLO: 200 }, 3);
  assert.equal(parcial.completo, false);
  assert.deepEqual(parcial.faltam, ['INDIVIDUAL']);
  assert.equal(parcial.total, null);
  assert.equal(estimarTotal([], {}, 3).completo, false);
});

test('o link só aceita resposta aberto e dentro da validade', () => {
  const agora = new Date('2026-10-24T12:00:00Z');
  const aberta = { token: 'a'.repeat(64), link_status: 'aberta', expira_em: '2026-10-30T12:00:00Z' };
  assert.equal(situacaoDoLink(aberta, agora), 'aberta');
  assert.equal(situacaoDoLink({ ...aberta, link_status: 'encerrada' }, agora), 'encerrada');
  assert.equal(situacaoDoLink({ ...aberta, expira_em: '2026-10-24T11:00:00Z' }, agora), 'expirada');
  assert.equal(situacaoDoLink({ ...aberta, token: null }, agora), 'invalido');
  assert.equal(situacaoDoLink(null, agora), 'invalido');
  assert.equal(linkAberto(aberta, agora), true);
  assert.equal(linkAberto({ ...aberta, link_status: 'encerrada' }, agora), false);
});

test('quartos: de 4 em 4, sem deixar um individual sobrando', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 9].map(capacidadesDoGrupo), [[1], [2], [3], [4], [3, 2], [4, 2], [3, 4, 2]]);
  const itens = [...Array(5).fill({ sexo: 'MASCULINO' }), { sexo: 'FEMININO' }];
  const quartos = montarQuartos(itens);
  assert.deepEqual(quartos, [
    { tipo_quarto: 'DUPLO', genero: 'MASC', capacidade: 2, quantidade: 1 },
    { tipo_quarto: 'TRIPLO', genero: 'MASC', capacidade: 3, quantidade: 1 },
    { tipo_quarto: 'INDIVIDUAL', genero: 'FEM', capacidade: 1, quantidade: 1 },
  ]);
  assert.equal(quartos.reduce((s, q) => s + q.capacidade * q.quantidade, 0), 6);
  assert.equal(descreverQuartos(QUARTOS), '1 × Individual fem. + 2 × Duplo masc.');
});

test('link e mensagem para o WhatsApp do hotel', () => {
  const token = 'b'.repeat(64);
  assert.equal(urlDoLink(token, 'https://grao1000.com.br'), `https://grao1000.com.br/painel/cotacao-hotel?t=${token}`);
  assert.equal(urlDoLink(token, 'http://localhost:5500'), `http://localhost:5500/painel/cotacao-hotel?t=${token}`);
  const cot = { expira_em: '2026-10-30T15:00:00Z', checkin_previsto: '2026-11-03', checkout_previsto: '2026-11-06', diarias_previstas: 3, quartos_necessarios: QUARTOS };
  const texto = mensagemDoLink(cot, 'Sorriso', 'MT', urlDoLink(token, 'https://grao1000.com.br'));
  assert.match(texto, /Sorriso\/MT/);
  assert.match(texto, /03\/11\/2026 a 06\/11\/2026 \(3 diária\(s\)\)/);
  assert.match(texto, /Quartos: 1 × Individual fem\./);
  assert.match(texto, /cotacao-hotel\?t=b{64}/);
  assert.match(texto, /Válido até 30\/10\/2026/);
  assert.equal(linkWhatsapp('(65) 99999-1111'), 'https://wa.me/5565999991111');
  assert.equal(linkWhatsapp('5565999991111', 'oi'), 'https://wa.me/5565999991111?text=oi');
  assert.equal(linkWhatsapp('123'), '');
});

test('comparação: menor total completo primeiro; incompleta, aguardando e sem vaga depois', () => {
  const agora = new Date('2026-10-24T12:00:00Z');
  const base = { token: 'c'.repeat(64), link_status: 'aberta', expira_em: '2026-10-30T12:00:00Z', quartos_necessarios: QUARTOS, diarias_previstas: 2, created_at: '2026-10-24T10:00:00Z' };
  const cots = [
    { ...base, id: 'sem-vaga', status: 'INDISPONIVEL' },
    { ...base, id: 'aguardando', status: 'PENDENTE' },
    { ...base, id: 'incompleta', status: 'RESPONDIDA', precos_quartos: { DUPLO: 100 } },
    { ...base, id: 'cara', status: 'RESPONDIDA', precos_quartos: { INDIVIDUAL: 300, DUPLO: 300 } },
    { ...base, id: 'barata', status: 'RESPONDIDA', precos_quartos: { INDIVIDUAL: 100, DUPLO: 100 } },
  ];
  const ordem = compararCotacoes(cots, agora).map((o) => o.cot.id);
  assert.deepEqual(ordem, ['barata', 'cara', 'incompleta', 'aguardando', 'sem-vaga']);
  assert.equal(compararCotacoes(cots, agora)[0].estimativa.total, 600);
});

test('pedido de reserva sai no formato da RPC e exige preço de todos os tipos', () => {
  assert.match(montarPedidoReserva(QUARTOS, { DUPLO: 200 }).erro, /individual/);
  const p = montarPedidoReserva(QUARTOS, { INDIVIDUAL: 150, DUPLO: 200 });
  assert.equal(p.valorDiaria, 150);
  assert.deepEqual(p.quartos[1], { tipo_quarto: 'DUPLO', quantidade: 2, genero: 'MASC', capacidade: 2, valor_diaria: 200, descricao: '2 × Duplo masc.' });
});

test('infraestrutura: função pública sem JWT, versões únicas e webhook sem duplicar cotação', () => {
  assert.match(le('supabase/config.toml'), /\[functions\.hospedagem-cotacao-publica\]\s+verify_jwt = false/);
  const pages = le('.github/workflows/pages.yml');
  for (const arquivo of ['cotacao-hotel.js', 'cotacaoHotelRegras.js', 'modules/hospedagem/cotacao.js', 'modules/hospedagem/cotacao-ui.js']) {
    assert.ok(pages.includes(`node --check assets/js/${arquivo}`), `pages.yml não verifica ${arquivo}`);
  }
  // O ?v= do html e dos imports internos do ADM é o mesmo: o navegador identifica o módulo pela URL completa.
  const html = le('adm-hotel.html').match(/adm-hotel\.js\?v=([^"']+)/)[1];
  const tokens = new Set();
  for (const arquivo of ['assets/js/adm-hotel.js', 'assets/js/modules/hospedagem/cotacao-ui.js', 'assets/js/modules/hospedagem/cotacao.js']) {
    for (const m of le(arquivo).matchAll(/from '\.[^']*\/(?:cotacao-ui|cotacao|cotacaoHotelRegras)\.js\?v=([^']+)'/g)) tokens.add(m[1]);
  }
  assert.deepEqual([...tokens], [html]);
  assert.doesNotMatch(le('assets/js/modules/hospedagem/cotacao-ui.js'), /from '\.[^']*\.js'/); // todo import interno leva ?v=
  const webhook = le('supabase/functions/hospedagem-whatsapp-webhook/index.ts');
  assert.match(webhook, /\.eq\("hotel_id", hotel\.id\)\s*\/\/[^\n]*\n\s*\.order\("created_at", \{ ascending: false \}\)\s*\.limit\(1\)\s*\.maybeSingle\(\)/);
});
