'use strict';
// Leitura do banco e criação da baixa ÚNICA quando um comprovante paga mais de uma NF do Compras
// (Supabase simulado em memória; sem rede). A decisão pura está em test-compras-nfs-comprovante.js.
const assert = require('assert');
const { _teste } = require('./grmserver-lancar-notas-fiscais-api');

const URL_BASE = 'https://x.supabase.co/storage/v1/object/public/notas-fiscais/';
const COMPROVANTE = `${URL_BASE}compras/comprovantes/pix.pdf`;

function criarBanco({ itens, lancamentos, jobsAtivos = [] }) {
  const log = { baixas: [], jobs: [], updates: [] };
  const builder = (tabela) => {
    const filtros = {};
    let operacao = 'select';
    let corpo = null;
    const b = {
      select: () => b,
      eq: (col, val) => { filtros[col] = val; return b; },
      in: (col, val) => { filtros[col] = val; return b; },
      limit: () => b,
      insert: (obj) => { operacao = 'insert'; corpo = obj; return b; },
      update: (obj) => { operacao = 'update'; corpo = obj; return b; },
      single: async () => b.resolver(true),
      maybeSingle: async () => b.resolver(true),
      resolver(unico) {
        if (operacao === 'insert') {
          if (tabela === 'grm_nf_baixas') { log.baixas.push(corpo); return { data: { id: 'baixa-1' }, error: null }; }
          if (tabela === 'grm_sync_jobs') { log.jobs.push(corpo); return { data: null, error: null }; }
        }
        if (operacao === 'update') { log.updates.push([tabela, corpo, filtros]); return { data: null, error: null }; }
        let linhas = [];
        if (tabela === 'compras_itens') linhas = itens.filter((i) => i.comprovante_url === filtros.comprovante_url);
        else if (tabela === 'grm_nf_lancamentos') linhas = lancamentos.filter((l) => l.storage_path === filtros.storage_path || l.id === filtros.id);
        else if (tabela === 'grm_sync_jobs') linhas = jobsAtivos;
        return { data: unico ? (linhas[0] || null) : linhas, error: null };
      },
      then(ok, erro) { return Promise.resolve(b.resolver(false)).then(ok, erro); },
    };
    return b;
  };
  return { sb: { from: builder }, log };
}

const comprovante = (valor) => ({
  url: COMPROVANTE, ref: { bucket: 'notas-fiscais', path: 'compras/comprovantes/pix.pdf' }, arquivo: 'pix.pdf', boletos: [],
  pagamento: { valor, data_pagamento: '21/10/2026', data_confiavel: true, forma_pagamento: 'PIX', contas: [{ agencia: '0806', conta: '256017' }], cnpjs: [] },
});
const rowA = { id: 'lanc-a', storage_path: 'compras/nf/2026/a.pdf', arquivo_nome: 'a.pdf' };
const dataA = { valor_total: 600, fornecedor: 'CALLIBRA', fornecedor_cnpj: '12.345.678/0001-90', numero_documento: '1001', empresa: 'ARAGUAIA', parcelas: [{ numero: '001' }], compras: { item_ids: ['i1', 'i2'] } };
const itens = [
  { id: 'i1', nf_url: `${URL_BASE}compras/nf/2026/a.pdf`, comprovante_url: COMPROVANTE },
  { id: 'i2', nf_url: `${URL_BASE}compras/nf/2026/a.pdf`, comprovante_url: COMPROVANTE },
  { id: 'i3', nf_url: `${URL_BASE}compras/nf/2026/b.pdf`, comprovante_url: COMPROVANTE },
];
const lancB = (extra = {}) => ({
  id: 'lanc-b', storage_path: 'compras/nf/2026/b.pdf', arquivo_nome: 'b.pdf', status: 'LANCADO', grm_codigo: '120501', valor_total: 400,
  numero_documento: '1002', fornecedor_cnpj: '12345678000190', extraido_json: { empresa: 'ARAGUAIA', parcelas: [{ numero: '001' }] }, ...extra,
});
const RESOLVED = { scpCode: 5, patCode: 7 };

(async () => {
  // 1) as duas NFs lançadas e o comprovante bate com a soma: UMA baixa com as duas NFs
  {
    const { sb, log } = criarBanco({ itens, lancamentos: [lancB()] });
    _teste.setSupabase(sb);
    const grupo = await _teste.carregarNfsDoComprovante(rowA, dataA, COMPROVANTE, '120500');
    assert.equal(grupo.estado, 'PRONTO');
    assert.equal(grupo.valorTotal, 1000);
    const baixa = await _teste.enfileirarBaixaGrupo(rowA, dataA, comprovante(1000), RESOLVED, grupo);
    assert.equal(baixa.status, 'BAIXA_ENFILEIRADA', JSON.stringify(baixa));
    assert.equal(log.baixas.length, 1, 'uma baixa só');
    const p = log.baixas[0];
    assert.equal(p.valor, 1000);
    assert.equal(p.parcela_valor_total, 1000);
    assert.equal(p.saldo_pendente, 0);
    assert.equal(p.storage_path, 'compras/comprovantes/pix.pdf');
    assert.deepEqual(p.pin_codes_json.map((i) => [i.pinCode, i.valor, i.pinDocNumber, i.patCode]), [['120500', 600, '1001', 7], ['120501', 400, '1002', 7]]);
    assert.equal(p.status, 'VALIDADO');
    assert.equal(log.jobs.length, 1, 'cria o job da baixa');
    assert.ok(log.updates.some(([t, c]) => t === 'grm_nf_lancamentos' && c.extraido_json.compras.baixa.status === 'BAIXA_ENFILEIRADA'), 'NF irmã aponta para a baixa');
  }

  // 2) a outra NF ainda não foi lançada: nada de baixa agora
  {
    const { sb, log } = criarBanco({ itens, lancamentos: [lancB({ status: 'NOVO', grm_codigo: null })] });
    _teste.setSupabase(sb);
    const grupo = await _teste.carregarNfsDoComprovante(rowA, dataA, COMPROVANTE, '120500');
    assert.equal(grupo.estado, 'AGUARDANDO');
    const baixa = await _teste.enfileirarBaixaGrupo(rowA, dataA, comprovante(1000), RESOLVED, grupo);
    assert.equal(baixa.status, 'AGUARDANDO_NFS');
    assert.equal(log.baixas.length, 0);
  }

  // 3) pago MENOR que a soma das NFs (900 x 1000): baixa enfileirada, diferença vira DESCONTO rateado por NF
  {
    const { sb, log } = criarBanco({ itens, lancamentos: [lancB()] });
    _teste.setSupabase(sb);
    const grupo = await _teste.carregarNfsDoComprovante(rowA, dataA, COMPROVANTE, '120500');
    const baixa = await _teste.enfileirarBaixaGrupo(rowA, dataA, comprovante(900), RESOLVED, grupo);
    assert.equal(baixa.status, 'BAIXA_ENFILEIRADA', JSON.stringify(baixa));
    assert.equal(baixa.desconto, 100);
    assert.equal(baixa.juros, 0);
    const p = log.baixas[0];
    assert.equal(p.valor, 900, 'valor da baixa = o que o comprovante pagou');
    assert.equal(p.parcela_valor_total, 1000);
    assert.deepEqual(p.pin_codes_json.map((i) => [i.pinCode, i.valorNf, i.valor, i.desconto, i.juros]), [['120500', 600, 540, 60, 0], ['120501', 400, 360, 40, 0]]);
  }

  // 3b) pago MAIOR (1010 x 1000): diferença vira JUROS
  {
    const { sb, log } = criarBanco({ itens, lancamentos: [lancB()] });
    _teste.setSupabase(sb);
    const grupo = await _teste.carregarNfsDoComprovante(rowA, dataA, COMPROVANTE, '120500');
    const baixa = await _teste.enfileirarBaixaGrupo(rowA, dataA, comprovante(1010), RESOLVED, grupo);
    assert.equal(baixa.status, 'BAIXA_ENFILEIRADA');
    assert.equal(baixa.juros, 10);
    assert.deepEqual(log.baixas[0].pin_codes_json.map((i) => [i.valor, i.juros, i.desconto]), [[606, 6, 0], [404, 4, 0]]);
  }

  // 3c) diferença grande demais (500 x 1000): comprovante provavelmente errado -> manual
  {
    const { sb, log } = criarBanco({ itens, lancamentos: [lancB()] });
    _teste.setSupabase(sb);
    const grupo = await _teste.carregarNfsDoComprovante(rowA, dataA, COMPROVANTE, '120500');
    const baixa = await _teste.enfileirarBaixaGrupo(rowA, dataA, comprovante(500), RESOLVED, grupo);
    assert.equal(baixa.status, 'BAIXA_MANUAL');
    assert.match(baixa.motivo, /difere/);
    assert.equal(log.baixas.length, 0);
  }

  // 4) comprovante de uma NF só (todos os itens com a mesma NF): fluxo normal, não é grupo
  {
    const so = itens.map((i) => ({ ...i, nf_url: `${URL_BASE}compras/nf/2026/a.pdf` }));
    const { sb } = criarBanco({ itens: so, lancamentos: [] });
    _teste.setSupabase(sb);
    assert.equal(await _teste.carregarNfsDoComprovante(rowA, dataA, COMPROVANTE, '120500'), null);
  }

  // 5) uma das NFs é só número/link (não é arquivo): baixa manual
  {
    const link = itens.map((i, k) => (k === 2 ? { ...i, nf_url: '123456' } : i));
    const { sb } = criarBanco({ itens: link, lancamentos: [] });
    _teste.setSupabase(sb);
    const grupo = await _teste.carregarNfsDoComprovante(rowA, dataA, COMPROVANTE, '120500');
    assert.equal(grupo.estado, 'MANUAL');
  }

  // 6) dry-run não grava nada
  {
    const { sb, log } = criarBanco({ itens, lancamentos: [lancB()] });
    _teste.setSupabase(sb);
    const grupo = await _teste.carregarNfsDoComprovante(rowA, dataA, COMPROVANTE, 'DRY-RUN');
    const baixa = await _teste.enfileirarBaixaGrupo(rowA, dataA, comprovante(1000), RESOLVED, grupo, { dry: true });
    assert.match(baixa.status, /dry-run/);
    assert.equal(baixa.nfs, 2);
    assert.equal(log.baixas.length, 0);
    assert.equal(log.jobs.length, 0);
  }

  // 7) comprovante já usado por outra baixa (23505): não duplica, cai em manual
  {
    const { sb } = criarBanco({ itens, lancamentos: [lancB()] });
    const original = sb.from;
    sb.from = (t) => {
      const b = original(t);
      if (t !== 'grm_nf_baixas') return b;
      b.insert = () => ({ select: () => ({ single: async () => ({ data: null, error: { code: '23505', message: 'duplicate key' } }) }) });
      return b;
    };
    _teste.setSupabase(sb);
    const grupo = await _teste.carregarNfsDoComprovante(rowA, dataA, COMPROVANTE, '120500');
    const baixa = await _teste.enfileirarBaixaGrupo(rowA, dataA, comprovante(1000), RESOLVED, grupo);
    assert.equal(baixa.status, 'BAIXA_MANUAL');
    assert.match(baixa.motivo, /já está na fila/);
  }
  console.log('test-compras-nfs-comprovante-banco: OK');
})().catch((e) => { console.error(e); process.exit(1); });
