import test from 'node:test';
import assert from 'node:assert/strict';

// modules/frotas-multas.js é um script que se registra em window.FROTAS_MULTAS.
globalThis.window = globalThis;
await import('../assets/js/modules/frotas-multas.js');
const { __teste } = await import('../assets/js/modules/frotas-multas-fluxo.js');
const h = window.FROTAS_MULTAS.getContext().helpers;
const { montarMensagem, normalizarFone, slug, tituloDossie, MENSAGEM_PADRAO } = __teste;

const multa = {
  motorista: 'JOAO DA SILVA',
  orgao_autuador: 'CASCAVEL-PR',
  placa: 'ABC1D23',
  data_infracao: '2026-10-07',
  hora_infracao: '16:33:00',
  local: 'BR-277 KM 590',
  descricao: 'Transitar em velocidade superior à máxima permitida em até 20%',
  valor_original: 130.16,
  numero_auto_infracao: 'G001234567',
};

test('mensagem do WhatsApp: dados da multa na ordem pedida, seguidos do texto fixo', () => {
  const linhas = montarMensagem(multa, h).split('\n');
  assert.deepEqual(linhas.slice(0, 9), [
    'MOTORISTA: JOAO DA SILVA',
    'ORGÃO AUTUADOR: CASCAVEL-PR',
    'PLACA: ABC1D23',
    'DATA: 07/10/2026',
    'HORA: 16:33',
    'LOCAL: BR-277 KM 590',
    'MULTA: Transitar em velocidade superior à máxima permitida em até 20%',
    expect130(linhas[7]),
    'AUT INFR: G001234567',
  ]);
  assert.equal(linhas[9], '');
  assert.equal(linhas.slice(10).join('\n'), MENSAGEM_PADRAO);
});

function expect130(linha) {
  // Intl insere espaço não separável entre "R$" e o valor
  assert.match(linha, /^VALOR: R\$\s130,16$/);
  return linha;
}

test('texto fixo mantém os blocos INDICAR, DOBRAR e as observações', () => {
  assert.ok(MENSAGEM_PADRAO.startsWith('❗ATENÇÃO CONDUTOR DE VEÍCULO DA FROTA ❗🚙\n\nSegue abaixo algumas opções para sua multa.'));
  assert.match(MENSAGEM_PADRAO, /📄 INDICAR: Indicando condutor é lançado em caixa/);
  assert.match(MENSAGEM_PADRAO, /💰 DOBRAR: Quando um veículo de pessoa jurídica é autuado/);
  assert.match(MENSAGEM_PADRAO, /\nOBS:\n\n⚠️ NUNCA repasse sua matrícula de abastecimento/);
  assert.ok(MENSAGEM_PADRAO.endsWith('⚠️ Funcionários "FREE" não possuem opção de parcelamento de multas.'));
});

test('hora da infração: sai como veio do DETRAN (horário de Brasília), sem converter fuso', () => {
  assert.equal(h.infractionTimeReal({ hora_infracao: '16:33:00' }), '16:33');
  assert.equal(h.infractionTimeReal({ hora_infracao: '06:05:00' }), '06:05');
  assert.equal(h.infractionTimeReal({ raw: { horaInfracao: '22:05:00' } }), '22:05');
});

test('hora não é exibida quando não é a hora real da infração', () => {
  // 00:00:00 = DETRAN não informou
  assert.equal(h.infractionTimeReal({ hora_infracao: '00:00:00' }), '');
  // "por não identificação do condutor": o horário é o do lançamento da penalidade
  const nic = { hora_infracao: '01:25:33', descricao: 'Multa por não identificação do condutor infrator imposta ao proprietário' };
  assert.equal(h.isNaoIdentificacao(nic), true);
  assert.equal(h.infractionTimeReal(nic), '');
  assert.match(montarMensagem({ ...multa, ...nic }, h), /\nHORA: —\n/);
});

test('descrição com espaço não separável é normalizada na mensagem', () => {
  const m = { ...multa, descricao: 'Multa por  não identificação do condutor infrator' };
  assert.match(montarMensagem(m, h), /\nMULTA: Multa por não identificação do condutor infrator\n/);
});

test('telefone: DDI 55 quando vier só DDD+número; rejeita o que não parece telefone', () => {
  assert.equal(normalizarFone('(45) 99123-4567'), '5545991234567');
  assert.equal(normalizarFone('4533211234'), '554533211234');
  assert.equal(normalizarFone('+55 45 99123-4567'), '5545991234567');
  assert.equal(normalizarFone('123'), '');
  assert.equal(normalizarFone(''), '');
});

test('título do PDF no Drive: DATA - PLACA - CONDUTOR - AUTO', () => {
  assert.equal(tituloDossie(h, [multa]), '07-10-2026 - ABC1D23 - JOAO DA SILVA - G001234567');
});

test('título do PDF de um grupo junta datas, placas e autos distintos com "+"', () => {
  const outra = { ...multa, placa: 'XYZ9K88', data_infracao: '2026-10-04', numero_auto_infracao: 'G007654321' };
  assert.equal(
    tituloDossie(h, [outra, multa]),
    '04-10-2026+07-10-2026 - XYZ9K88+ABC1D23 - JOAO DA SILVA - G007654321+G001234567',
  );
  // mesma placa e mesma data aparecem uma vez só
  const mesma = { ...multa, numero_auto_infracao: 'G999' };
  assert.equal(tituloDossie(h, [multa, mesma]), '07-10-2026 - ABC1D23 - JOAO DA SILVA - G001234567+G999');
});

test('título do PDF: barras do nome não quebram o arquivo e título enorme é encurtado', () => {
  assert.equal(tituloDossie(h, [{ ...multa, numero_auto_infracao: 'A/12\\3' }]), '07-10-2026 - ABC1D23 - JOAO DA SILVA - A-12-3');
  const muitos = Array.from({ length: 30 }, (_, i) => ({ ...multa, numero_auto_infracao: `G00000000${i}`.padEnd(14, 'X') }));
  const t = tituloDossie(h, muitos);
  assert.ok(t.length <= 200);
  assert.match(t, / - G000000000XXXX\+29$/);
});

test('pasta do motorista no storage: slug sem acento nem caractere especial', () => {
  assert.equal(slug('JOÃO D\'ÁVILA  da Silva'), 'joao-d-avila-da-silva');
  assert.equal(slug(''), 'sem-nome');
});

test('termo de desconto usa a redação revisada pelo RH (09/10/2026)', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../assets/js/modules/frotas-multas-fluxo.js', import.meta.url), 'utf8');
  // reconhecimento da responsabilidade no lugar de "ciente da autuação"
  assert.match(src, /reconheço que fui responsável \$\{plural \? 'pelas infrações' : 'pela infração'\} e AUTORIZO/);
  assert.doesNotMatch(src, /declaro estar ciente/);
  // compromissos adicionais no lugar de "me comprometo a pagar as multas"
  assert.match(src, /Comprometo-me ainda a respeitar a legislação de trânsito, utilizar os veículos da empresa com zelo e comunicar imediatamente qualquer ocorrência ou autuação recebida\./);
  assert.doesNotMatch(src, /no qual me comprometo a pagar as multas/);
});

// ── OK (arquivar) só depois dos anexos: Dobrar = 2 (auto + termo assinado), Identificar = 1 (auto) ──
const ctxMultas = window.FROTAS_MULTAS.getContext();
const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const indicar = (n, extra = {}) => ({ id: ID(n), grupo_id: null, identificar_solicitado_em: '2026-10-08T10:00:00Z', ...extra });
const dobrar = (n, extra = {}) => ({ id: ID(n), grupo_id: null, dobrar_solicitado_em: '2026-10-08T10:00:00Z', ...extra });
const auto = (multaId) => ({ id: `a-${multaId}`, tipo: 'auto_infracao', multa_id: multaId });
const termo = (dossieId) => ({ id: `t-${dossieId}`, tipo: 'termo_assinado', dossie_id: dossieId });
function cenario(multas, anexos = [], { indisponivel = false } = {}) {
  ctxMultas.state.multas = multas;
  ctxMultas.state.anexos = anexos;
  ctxMultas.state.anexosIndisponiveis = indisponivel;
  ctxMultas.reindex();
  return ctxMultas.helpers.okBloqueio;
}

test('OK: multa sem ação (nem Identificar nem Dobrar) fica bloqueada', () => {
  const ok = cenario([{ id: ID(1), grupo_id: null }], [auto(ID(1)), termo(ID(1))]);
  assert.match(ok({ id: ID(1), grupo_id: null }), /escolha a ação da multa \(Identificar ou Dobrar\)/);
});

test('OK em Identificar exige 1 anexo: o auto de infração', () => {
  const m = indicar(1);
  assert.match(cenario([m])(m), /Identificar exige 1 anexo: falta o auto de infração/);
  assert.equal(cenario([m], [auto(m.id)])(m), '');
  // o termo não é exigido nem substitui o auto
  assert.match(cenario([m], [termo(m.id)])(m), /falta o auto de infração/);
});

test('OK em Dobrar exige 2 anexos: auto de infração + termo de desconto assinado', () => {
  const m = dobrar(1);
  assert.match(cenario([m])(m), /Dobrar exige 2 anexos: falta o auto de infração e o termo de desconto assinado/);
  assert.match(cenario([m], [auto(m.id)])(m), /falta o termo de desconto assinado/);
  assert.match(cenario([m], [termo(m.id)])(m), /falta o auto de infração/);
  assert.equal(cenario([m], [auto(m.id), termo(m.id)])(m), '');
});

test('OK em grupo: o termo vale para o grupo, o auto é de cada multa', () => {
  const G = '11111111-1111-4111-8111-111111111111';
  const a = dobrar(1, { grupo_id: G });
  const b = dobrar(2, { grupo_id: G });
  const ok = cenario([a, b], [auto(a.id), termo(G)]);
  assert.equal(ok(a), '');
  assert.match(ok(b), /Dobrar exige 2 anexos: falta o auto de infração\./);
});

test('termo só é dispensado quando todas as multas do dossiê são Identificar', () => {
  const G = '22222222-2222-4222-8222-222222222222';
  const i1 = indicar(1, { grupo_id: G });
  const i2 = indicar(2, { grupo_id: G });
  const d1 = dobrar(3, { grupo_id: G });
  cenario([i1, i2]);
  assert.equal(ctxMultas.helpers.exigeTermo([i1, i2]), false);
  assert.equal(ctxMultas.helpers.exigeTermo([i1, d1]), true);
  assert.equal(ctxMultas.helpers.exigeTermo([{ id: ID(9) }]), true); // sem ação ainda: mantém o termo
  assert.equal(ctxMultas.helpers.anexosStatus(i1).esperado, 2); // 2 autos, sem termo
});

test('OK: sem como conferir os anexos (tabela indisponível) não libera', () => {
  const m = indicar(1);
  assert.match(cenario([m], [auto(m.id)], { indisponivel: true })(m), /Não foi possível conferir os anexos/);
});

test('arquivar (OK) consulta a trava antes de gravar', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../assets/js/modules/frotas-multas.js', import.meta.url), 'utf8');
  assert.match(src, /async function archiveMulta[\s\S]*?okBloqueio\(multa\)[\s\S]*?return;[\s\S]*?safeUpdate\(opts,multa\.id,\{arquivada_em/);
});
