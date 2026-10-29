'use strict';
// Compra com NF + arquivos extras (nf_anexos): cada documento é uma NF própria — lançada à parte, com o valor do próprio
// documento, e baixada individualmente com o mesmo comprovante (29/10/2026). Sem rede.
const assert = require('assert');
const api = require('./grmserver-lancar-notas-fiscais-api');
api.loadConfig();

const BASE = 'https://x.supabase.co/storage/v1/object/public/notas-fiscais/';
const nf = `${BASE}compras/nf/2026/a_NF.pdf`;
const anexo = `${BASE}compras/nf/2026/b_NFSE.pdf`;
const item = { id: 'i1', nf_url: nf, nf_anexos: [{ nome: 'b.pdf', url: anexo }], valor_total: 400, material: 'MANUTENÇÃO IMPRESSORA', tipo: 'SERVIÇO', quantidade: 1 };

// documentos da compra = NF de cada item + anexos, sem repetir
assert.deepStrictEqual(api.documentosDaCompra([item]), ['compras/nf/2026/a_NF.pdf', 'compras/nf/2026/b_NFSE.pdf']);
assert.deepStrictEqual(api.documentosDaCompra([item, { ...item, id: 'i2' }]).length, 2);
assert.deepStrictEqual(api.documentosDaCompra([{ id: 'x', nf_url: nf, nf_anexos: [] }]), ['compras/nf/2026/a_NF.pdf']);

// arquivos fiscais pagos pelo mesmo comprovante: o anexo entra como NF a baixar
assert.deepStrictEqual(api.urlsDocumentosDoComprovante([item, { id: 'i2', nf_url: nf, nf_anexos: [{ url: anexo }] }]), [nf, anexo]);
assert.strictEqual(api.urlsDocumentosDoComprovante([{ id: 'x', nf_url: nf, nf_anexos: null }]).length, 1);

// valor: com 2 documentos NÃO usa o total dos itens (400) como se fosse o de cada um
const cfgCompras = (data, docs) => api.applyComprasRules(data, { itens: [item], pagamentos: [], docs }, null);
const semLeitura = cfgCompras({ valor_total: null, rateio: {} }, ['a', 'b']);
assert.strictEqual(semLeitura.valor_total, null);
assert.ok(semLeitura.compras.avisos.some((a) => /2 documentos fiscais/.test(a)));
assert.deepStrictEqual(semLeitura.compras.docs, ['a', 'b']);
const umSo = cfgCompras({ valor_total: null, rateio: {} }, ['a']);
assert.strictEqual(umSo.valor_total, 400); // fluxo antigo inalterado

// leitura da NFS-e de prefeitura (ACBr): CNPJ da prefeitura no cabeçalho não pode virar o do fornecedor
const nfse = [
  '                                          NÚMERO DA NOTA',
  'PREFEITURA MUNICIPAL DE SINOP MT AVENIDA DAS EMBAÚBAS, 1386 TELEFONES: (66) 3520-7200 CNPJ: 15.024.003/0001-32      2600000000553',
  '     NOTA FISCAL DE SERVIÇOS ELETRÔNICA - NFSe                  DATA/HORA DE EMISSÃO',
  '',
  '                                                                                  21/10/2026 08:58:11',
  '                                    PRESTADOR DE SERVIÇOS',
  'CPF / CNPJ: 10.791.376/0001-15                    INSC. MUNICIPAL: 15329',
  'NOME / RAZÃO SOCIAL: ALENCAR &amp; LEANDRO LTDA',
  '                                    TOMADOR DE SERVIÇOS',
  'CPF / CNPJ: 29.666.679/0001-34',
  'NOME / RAZÃO SOCIAL: GRAOMIL LTDA',
  '                                    DISCRIMINAÇÃO DOS SERVIÇOS',
  '                                    VALOR TOTAL DA NOTA = R$ 120,00',
].join('\n');
const lido = api.extractFromText(nfse, '.pdf');
assert.strictEqual(lido.valor_total, 120);
assert.strictEqual(lido.numero_documento, '2600000000553');
assert.strictEqual(lido.data_conta, '21/10/2026');
assert.strictEqual(lido.fornecedor_cnpj, '10791376000115');
assert.strictEqual(lido.fornecedor, 'ALENCAR & LEANDRO LTDA');
assert.strictEqual(lido.tipo_documento, 'NFS-e');

// DANFE: linha em branco entre rótulo e valores e "Ã" quebrado na fonte
const chave = '51261010791376000115550010000032071060637379';
const danfe = [
  `DANFE  CHAVE DE ACESSO ${chave.replace(/(.{4})/g, '$1 ').trim()}`,
  'DATA DA EMISS�O  ENTRADA / SA�DA',
  '',
  ' AVENIDA BRASIL, 2732   SAO CRISTOVAO   85.816-294 21/10/2026   21/10/2026',
  'VALOR DO FRETE      DESCONTO      VALOR TOTAL DA NOTA',
  '',
  '           0,00           0,00           0,00           280,00',
].join('\n');
const dan = api.extractDanfeFields(danfe);
assert.strictEqual(dan.valor_total, 280);
assert.strictEqual(dan.emissao, '21/10/2026');

// baixa em grupo: o anexo entra como NF irmã (aguarda lançar; depois, uma baixa com um item por documento)
const COMPROVANTE = `${BASE}compras/comprovantes/pix.pdf`;
const itensBanco = [{ id: 'i1', nf_url: nf, nf_anexos: [{ url: anexo }], comprovante_url: COMPROVANTE }];
const bancoFalso = (lancamentos) => ({
  from: (tabela) => {
    const f = {};
    const b = {
      select: () => b,
      eq: (c, v) => { f[c] = v; return b; },
      in: (c, v) => { f[c] = v; return b; },
      maybeSingle: async () => ({ data: lancamentos.find((l) => l.storage_path === f.storage_path) || null, error: null }),
      then(ok, erro) { return Promise.resolve({ data: tabela === 'compras_itens' ? itensBanco : [], error: null }).then(ok, erro); },
    };
    return b;
  },
});
const linha = { id: 'l-a', storage_path: 'compras/nf/2026/a_NF.pdf', arquivo_nome: 'a_NF.pdf' };
const dadosA = { valor_total: 280, fornecedor_cnpj: '10791376000115', numero_documento: '3207', empresa: 'GRAOMIL', parcelas: [{ numero: '001' }] };
const lancB = (status) => ({
  id: 'l-b', storage_path: 'compras/nf/2026/b_NFSE.pdf', arquivo_nome: 'b_NFSE.pdf', status, grm_codigo: '120502', valor_total: 120,
  numero_documento: '553', fornecedor_cnpj: '10791376000115', extraido_json: { empresa: 'GRAOMIL', parcelas: [{ numero: '001' }] },
});

(async () => {
  api._teste.setSupabase(bancoFalso([lancB('NOVO')]));
  const espera = await api._teste.carregarNfsDoComprovante(linha, dadosA, COMPROVANTE, '120501');
  assert.strictEqual(espera.estado, 'AGUARDANDO');
  api._teste.setSupabase(bancoFalso([lancB('LANCADO')]));
  const pronto = await api._teste.carregarNfsDoComprovante(linha, dadosA, COMPROVANTE, '120501');
  assert.strictEqual(pronto.estado, 'PRONTO');
  assert.strictEqual(pronto.valorTotal, 400);
  assert.deepStrictEqual(pronto.itens.map((i) => [i.pinCode, i.valor]), [['120501', 280], ['120502', 120]]);
  console.log('test-compras-anexos-documentos: OK');
})().catch((e) => { console.error(e); process.exit(1); });
