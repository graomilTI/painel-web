'use strict';
// A baixa de Compras com 2+ NFs no mesmo comprovante manda UM payInvoice/payment por NF (mesmo comprovante em cada),
// com juros/desconto próprios, e a nova tentativa pula o que já foi baixado. Sem rede: o módulo do agente é carregado
// numa cópia temporária com as funções de rede/Storage trocadas por simuladores.
process.env.GRM_BAIXA_NF_DRY_RUN = 'false';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const origem = path.join(__dirname, 'grmserver-baixa-notas-fiscais-api.js');
const temp = path.join(__dirname, `.tmp-baixa-individual-${process.pid}.js`);
fs.writeFileSync(temp, `${fs.readFileSync(origem, 'utf8')}
module.exports._harness = { processBaixa, setSupabase: (s) => { supabase = s; }, stub: (o) => {
  if (o.submit) submitPayInvoicePayment = o.submit;
  if (o.anexo) uploadComprovanteAnexo = o.anexo;
  if (o.download) downloadFromStorage = o.download;
} };
`);

(async () => {
  try {
    const { _harness: h } = require(temp);
    const updates = [];
    h.setSupabase({ from: () => ({ update: (patch) => ({ eq: () => ({ select: () => ({ single: async () => { updates.push(patch); return { data: { ...patch }, error: null }; } }) }) }) }) });
    const enviados = [];
    const anexos = [];
    let falharNoPin = null;
    h.stub({
      download: async (_row, alvo) => { fs.mkdirSync(path.dirname(alvo), { recursive: true }); fs.writeFileSync(alvo, 'pdf'); return Buffer.from('pdf'); },
      submit: async (payload, arquivo, nome) => {
        const info = JSON.parse(payload.paymentInfo);
        if (falharNoPin && info.some((i) => String(i.pinCode) === falharNoPin)) throw new Error('payInvoice/payment falhou: simulado');
        enviados.push({ info, nome, desc: payload.ppyMovBancDescription });
        return { result: true };
      },
      anexo: async (pin, arquivo, nome) => { anexos.push([String(pin), nome]); },
    });

    const linha = (extra = {}) => ({
      id: 'b1', status: 'VALIDADO', pin_code: '120500', arquivo_nome: 'pix.pdf', storage_path: 'compras/comprovantes/pix.pdf', tentativas: 0,
      bacc_code: 21, favorecido_nome: 'CALLIBRA', valor: 900, data_pagamento: '2026-10-21', parcela_valor_total: 1000, saldo_pendente: 0,
      extraido_json: { origem: 'COMPRAS', grupo_de_nfs: true },
      pin_codes_json: [
        { pinCode: '120500', patCode: 7, valor: 540, valorNf: 600, desconto: 60, juros: 0, pinDocNumber: '1001' },
        { pinCode: '120501', patCode: 7, valor: 360, valorNf: 400, desconto: 40, juros: 0, pinDocNumber: '1002' },
      ],
      ...extra,
    });

    // 1) duas NFs: duas chamadas, cada uma com o seu desconto e o mesmo comprovante anexado em cada NF
    assert.equal(await h.processBaixa(linha(), 'run-1'), 'baixado');
    assert.equal(enviados.length, 2, 'uma chamada por NF');
    assert.deepEqual(enviados[0].info, [{ pinCode: 120500, ppyPaidTax: 0, ppyPaidDiscount: 60, ppyPaidValue: 540, pinPaymentType: 'N' }]);
    assert.deepEqual(enviados[1].info, [{ pinCode: 120501, ppyPaidTax: 0, ppyPaidDiscount: 40, ppyPaidValue: 360, pinPaymentType: 'N' }]);
    assert.match(enviados[0].desc, /Doc 1001/);
    assert.match(enviados[1].desc, /Doc 1002/);
    assert.deepEqual(anexos, [['120500', 'pix.pdf'], ['120501', 'pix.pdf']]);
    assert.equal(updates[updates.length - 1].status, 'BAIXADO');

    // 2) a segunda NF falha: a primeira fica registrada e a nova tentativa não repete a primeira
    enviados.length = 0; anexos.length = 0; updates.length = 0;
    falharNoPin = '120501';
    assert.equal(await h.processBaixa(linha(), 'run-2'), 'erro');
    assert.equal(enviados.length, 1);
    const ultimo = updates[updates.length - 1];
    assert.equal(ultimo.status, 'ERRO');
    assert.match(ultimo.erro, /120501/);
    assert.match(ultimo.erro, /120500/, 'diz o que já foi baixado');
    const gravado = updates.find((u) => u.extraido_json && u.extraido_json.itens_baixados);
    assert.deepEqual(gravado.extraido_json.itens_baixados, ['120500']);

    enviados.length = 0; anexos.length = 0; updates.length = 0;
    falharNoPin = null;
    assert.equal(await h.processBaixa(linha({ extraido_json: { origem: 'COMPRAS', grupo_de_nfs: true, itens_baixados: ['120500'] } }), 'run-3'), 'baixado');
    assert.deepEqual(enviados.map((e) => e.info[0].pinCode), [120501], 'só a que faltava');
    assert.deepEqual(anexos, [['120501', 'pix.pdf']]);

    // 3) fora do Compras (soma de parcelas de holerite): continua UMA chamada com todas as entradas
    enviados.length = 0; anexos.length = 0;
    assert.equal(await h.processBaixa(linha({ extraido_json: {} }), 'run-4'), 'baixado');
    assert.equal(enviados.length, 1);
    assert.equal(enviados[0].info.length, 2);

    // 4) uma NF só no Compras, com juros: uma chamada com o juros
    enviados.length = 0; anexos.length = 0;
    const so = linha({ valor: 606, pin_codes_json: [{ pinCode: '120500', patCode: 7, valor: 606, valorNf: 600, juros: 6, pinDocNumber: '1001' }] });
    assert.equal(await h.processBaixa(so, 'run-5'), 'baixado');
    assert.deepEqual(enviados[0].info, [{ pinCode: 120500, ppyPaidTax: 6, ppyPaidDiscount: 0, ppyPaidValue: 606, pinPaymentType: 'N' }]);

    console.log('test-baixa-compras-individual: OK');
  } finally {
    try { fs.unlinkSync(temp); } catch (_) { /* noop */ }
  }
})().catch((e) => { console.error(e); process.exit(1); });
