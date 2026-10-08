'use strict';
// Exclui contas a pagar do GRM (payInvoice/deleteByMainCode = conta inteira, definitivo). Padrão = DRY-RUN.
//   node grm-excluir-contas-pagar-pontual.js plano.json saida.json                (dry-run)
//   node grm-excluir-contas-pagar-pontual.js plano.json saida.json --executar [--limite N]
//   --permitir-parcelas-2025: aceita contas que também têm parcelas de 2025 em diante (a conta inteira sai);
//     exige ao menos uma parcela vencida antes de 2025 e, como sempre, todas abertas e sem valor pago.
// Plano: { plano: [{ main, favorecido, titulo, parcelas: [{ code, venc, valor }] }] }
// Para cada conta, ANTES de apagar (na lista completa e de novo na consulta individual): as parcelas são
// exatamente as do plano, todas abertas (A), vencidas antes de 2025 e sem valor pago. Guarda a linha COMPLETA
// do GRM (backup). DEPOIS: confere que as parcelas sumiram e, em pontos de controle, que o total de linhas
// do GRM caiu exatamente pelo número de parcelas apagadas (nada além do plano foi tocado).
// Pára no primeiro resultado inesperado. Idempotente: contas já EXCLUIDO na saída são puladas.
require('dotenv').config();
require('dotenv').config({ path: '.env.production' });
const fs = require('fs');
const { obterTokenGrm } = require('./grm-token-cache');

const [PLANO, SAIDA] = process.argv.slice(2, 4);
const EXECUTAR = process.argv.includes('--executar');
const limIdx = process.argv.indexOf('--limite');
const LIMITE = limIdx >= 0 ? Number(process.argv[limIdx + 1]) : Infinity;
const CORTE = '2025-01-01';
const PERMITE_2025 = process.argv.includes('--permitir-parcelas-2025');
const H = { accept: 'application/json', origin: 'https://www.grmserver.com.br', 'content-type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dinheiro = (v) => Number(v || 0);

(async () => {
  const token = await obterTokenGrm({ login: async () => { throw new Error('sem token válido no cache'); } });
  const post = async (path, body, timeout = 60000) => {
    const r = await fetch('https://www.grmserver.com.br/api/' + path, { method: 'POST', headers: { ...H, authorization: `Bearer ${token}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
    const t = await r.text();
    let j; try { j = t ? JSON.parse(t) : {}; } catch (_) { throw new Error(`${path} HTTP ${r.status}: ${t.slice(0, 200)}`); }
    if (!r.ok || j.result === false) throw new Error(`${path} HTTP ${r.status}: ${j.message || t.slice(0, 200)}`);
    return j;
  };
  const listaCompleta = async () => (await post('payInvoice/getRecords', { moreThenOneCompany: 'S' }, 180000)).searchData || [];
  const porCodigos = async (codes) => (await post('payInvoice/getRecords', { pinCode: codes.map(Number), moreThenOneCompany: 'S' })).searchData || [];

  // Confere uma conta contra o plano. Devolve motivo de recusa ou null se está OK.
  const confere = (p, linhas) => {
    const planejadas = p.parcelas.map((x) => String(x.code)).sort();
    const vivas = linhas.map((x) => String(x.pinCode)).sort();
    if (JSON.stringify(planejadas) !== JSON.stringify(vivas)) return `parcelas_diferentes_do_plano(plano ${planejadas.length}, GRM ${vivas.length})`;
    for (const x of linhas) {
      if (Number(x.pinMainCode) !== Number(p.main)) return `grupo_diferente_${x.pinMainCode}`;
      if (x.pinStatus !== 'A') return `parcela_${x.pinCode}_status_${x.pinStatus}`;
      if (!PERMITE_2025 && !(String(x.pinDueDate) < CORTE)) return `parcela_${x.pinCode}_vence_${x.pinDueDate}`;
      if (dinheiro(x.pinTotalPaidValue) > 0 || dinheiro(x.pinPaidValue) > 0 || x.pinPaidDate || x.ppyPaidDate) return `parcela_${x.pinCode}_tem_pagamento`;
    }
    if (PERMITE_2025 && !linhas.some((x) => String(x.pinDueDate) < CORTE)) return 'nenhuma_parcela_vencida_antes_de_2025';
    return null;
  };

  const { plano } = JSON.parse(fs.readFileSync(PLANO, 'utf8'));
  const saida = fs.existsSync(SAIDA) ? JSON.parse(fs.readFileSync(SAIDA, 'utf8')) : { resultados: {}, backup: {}, controles: [] };
  const grava = () => fs.writeFileSync(SAIDA, JSON.stringify(saida));

  console.log(`${EXECUTAR ? 'EXECUTANDO' : 'DRY-RUN'}: ${plano.length} contas, ${plano.reduce((s, p) => s + p.parcelas.length, 0)} parcelas.`);
  let live = await listaCompleta();
  console.log(`GRM agora: ${live.length} linhas (${live.filter((x) => x.pinStatus === 'A').length} abertas).`);
  const grupos = new Map();
  for (const r of live) { const k = String(r.pinMainCode); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(r); }

  const codigosInicio = new Set(live.map((x) => String(x.pinCode)));
  const apagadasSet = new Set(); // códigos de parcelas apagadas nesta execução
  let apagadas = 0; // parcelas apagadas nesta execução
  let n = 0;
  // Ponto de controle: as únicas parcelas que sumiram do GRM desde o início são exatamente as apagadas por este script.
  const controle = async (rotulo) => {
    const agora = await listaCompleta();
    const codigosAgora = new Set(agora.map((x) => String(x.pinCode)));
    const sumiram = [...codigosInicio].filter((c) => !codigosAgora.has(c));
    const inesperadas = sumiram.filter((c) => !apagadasSet.has(c));
    const faltando = [...apagadasSet].filter((c) => codigosAgora.has(c));
    const ok = inesperadas.length === 0 && faltando.length === 0;
    saida.controles.push({ rotulo, linhas: agora.length, sumiram: sumiram.length, esperado: apagadasSet.size, inesperadas: inesperadas.slice(0, 20), ok, em: new Date().toISOString() });
    grava();
    console.log(`CONTROLE ${rotulo}: GRM ${agora.length} linhas; sumiram ${sumiram.length}, esperado ${apagadasSet.size}, inesperadas ${inesperadas.length}, ainda existem ${faltando.length} -> ${ok ? 'OK' : 'DIVERGENTE'}`);
    return ok;
  };

  for (const p of plano) {
    if (saida.resultados[p.main] && saida.resultados[p.main].resultado === 'EXCLUIDO') continue; // idempotente
    if (n >= LIMITE) { console.log(`Limite de ${LIMITE} contas atingido.`); break; }
    const reg = (resultado, motivo) => {
      saida.resultados[p.main] = { resultado, motivo: motivo || '', parcelas: p.parcelas.length, em: new Date().toISOString() };
      grava();
      console.log(`${resultado.padEnd(9)} ${String(p.main).padEnd(7)} ${String(p.favorecido).slice(0, 30).padEnd(30)} ${p.parcelas.length}x ${motivo || ''}`);
    };
    const codes = p.parcelas.map((x) => x.code);
    const r1 = confere(p, grupos.get(String(p.main)) || []);
    if (r1) { reg('PULADO', r1); continue; }
    if (!EXECUTAR) { reg('OK-DRY', 'conferido'); n += 1; continue; }

    const agoraLinhas = await porCodigos(codes); // consulta individual logo antes de apagar
    const r2 = confere(p, agoraLinhas);
    if (r2) { reg('PULADO', `na_hora:${r2}`); continue; }
    saida.backup[p.main] = agoraLinhas; grava(); // linha completa antes de apagar

    try { await post('payInvoice/deleteByMainCode', { pinMainCode: Number(p.main) }); }
    catch (e) { reg('FALHOU', e.message.slice(0, 160)); console.log('Pára no primeiro erro.'); break; }
    await sleep(300);
    const depois = await porCodigos(codes);
    if (depois.length) { reg('FALHOU', `parcelas_ainda_existem(${depois.length})`); console.log('Pára: a chamada não surtiu efeito completo.'); break; }
    codes.forEach((c) => apagadasSet.add(String(c))); apagadas += p.parcelas.length; n += 1;
    reg('EXCLUIDO');
    if (n === 1 || n === 25 || n % 200 === 0) { if (!(await controle(`apos_${n}_contas`))) { console.log('Pára: total de linhas divergente!'); break; } }
    await sleep(250);
  }
  if (EXECUTAR && apagadas > 0) await controle('final');
  const por = {}; Object.values(saida.resultados).forEach((r) => { por[r.resultado] = (por[r.resultado] || 0) + 1; });
  console.log('Resumo:', JSON.stringify(por), `| parcelas apagadas nesta execução: ${apagadas}`);
})().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
