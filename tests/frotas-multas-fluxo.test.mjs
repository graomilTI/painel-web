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
