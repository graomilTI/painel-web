'use strict';
// Executa o plano de duplicidades (EXCLUIR aprovado / RECUSAR pendente). Padrão = DRY-RUN (só confere ao vivo).
//   node executa_exclusoes_tmp.js plano.json saida.json            (dry-run)
//   node executa_exclusoes_tmp.js plano.json saida.json --executar
// Para cada item, ANTES de tocar: o candidato ainda existe, com o mesmo status e valor; o sobrevivente continua
// ativo (P/A) com o valor padrão. Guarda a linha COMPLETA do GRM (backup). DEPOIS: confere que o candidato saiu
// do Caixa e que o sobrevivente continua ativo. Pára no primeiro resultado inesperado.
require('dotenv').config();
require('dotenv').config({ path: '.env.production' });
const fs = require('fs');
const { obterTokenGrm } = require('./grm-token-cache');

const [PLANO, SAIDA] = process.argv.slice(2, 4);
const EXECUTAR = process.argv.includes('--executar');
const br = (iso) => iso.split('-').reverse().join('/');
const H = { accept: 'application/json', origin: 'https://www.grmserver.com.br', 'content-type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const token = await obterTokenGrm({ login: async () => { throw new Error('sem token'); } });
  const post = async (path, body) => {
    const r = await fetch('https://www.grmserver.com.br/api/' + path, { method: 'POST', headers: { ...H, authorization: `Bearer ${token}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
    const t = await r.text();
    let j; try { j = t ? JSON.parse(t) : {}; } catch (_) { throw new Error(`${path} HTTP ${r.status}: ${t.slice(0, 200)}`); }
    if (!r.ok || j.result === false) throw new Error(`${path} HTTP ${r.status}: ${j.message || t.slice(0, 200)}`);
    return j;
  };
  const dia = async (iso) => ((await post('reports/finance/operatingFlow', { ofmDateFrom: br(iso), ofmDateTo: br(iso), ofmStatusReport: ['P', 'A', 'N', 'D'], reportType: 'flowList' })).searchData || []);
  const acha = async (iso, ofm) => (await dia(iso)).find((r) => Number(r.ofmCode) === Number(ofm));

  const { plano } = JSON.parse(fs.readFileSync(PLANO, 'utf8'));
  const saida = fs.existsSync(SAIDA) ? JSON.parse(fs.readFileSync(SAIDA, 'utf8')) : { resultados: {}, backup: {} };
  console.log(`${EXECUTAR ? 'EXECUTANDO' : 'DRY-RUN'}: ${plano.length} itens.`);
  let n = 0;
  for (const p of plano) {
    if (saida.resultados[p.ofm] && ['EXCLUIDO', 'RECUSADO'].includes(saida.resultados[p.ofm].resultado)) continue; // idempotente
    const reg = (resultado, motivo) => { saida.resultados[p.ofm] = { resultado, motivo: motivo || '', em: new Date().toISOString() }; fs.writeFileSync(SAIDA, JSON.stringify(saida)); console.log(`${resultado.padEnd(9)} ${p.ofm} ${p.nome.slice(0, 26).padEnd(26)} ${p.grupo.padEnd(8)} ${p.dataEfetiva} R$${p.valor} ${motivo || ''}`); };
    const cand = await acha(p.dataLanc, p.ofm);
    const sob = await acha(p.sobrevivente.dataLanc, p.sobrevivente.ofm);
    if (!cand) { reg('PULADO', 'candidato_nao_encontrado'); continue; }
    if (cand.ofmStatus !== (p.acao === 'EXCLUIR' ? 'A' : 'P')) { reg('PULADO', `status_mudou_${cand.ofmStatus}`); continue; }
    if (Math.abs(Number(cand.ofmValue) - Number(p.valor)) > 0.005) { reg('PULADO', 'valor_mudou'); continue; }
    if (!sob || !['P', 'A'].includes(sob.ofmStatus) || Math.abs(Number(sob.ofmValue) - Number(p.valorPadrao)) > 0.005) { reg('PULADO', 'sobrevivente_invalido'); continue; }
    if (p.acao === 'EXCLUIR' && sob.ofmStatus !== 'A') { reg('PULADO', 'sobrevivente_nao_aprovado'); continue; }
    if (Number(cand.staCode) !== Number(sob.staCode)) { reg('PULADO', 'colaboradores_diferentes'); continue; }
    if (!EXECUTAR) { reg('OK-DRY', 'conferido'); continue; }
    saida.backup[p.ofm] = cand; fs.writeFileSync(SAIDA, JSON.stringify(saida)); // linha completa antes de apagar
    try {
      if (p.acao === 'EXCLUIR') await post('oFlow/delete', { ofmCode: Number(p.ofm) });
      else await post('oFlow/disapprove', { ofmCode: Number(p.ofm), reproveReason: 'Duplicata', type: 'D' });
    } catch (e) { reg('FALHOU', e.message.slice(0, 160)); console.log('Pára no primeiro erro.'); break; }
    await sleep(400);
    const depois = await acha(p.dataLanc, p.ofm);
    const sobDepois = await acha(p.sobrevivente.dataLanc, p.sobrevivente.ofm);
    const saiu = p.acao === 'EXCLUIR' ? !depois : (depois && depois.ofmStatus === 'N');
    if (!sobDepois || !['P', 'A'].includes(sobDepois.ofmStatus)) { reg('ALERTA', 'sobrevivente_nao_esta_mais_ativo'); console.log('Pára: sobrevivente afetado!'); break; }
    if (!saiu) { reg('FALHOU', `continua no Caixa (status ${depois && depois.ofmStatus})`); console.log('Pára: a chamada não surtiu efeito.'); break; }
    reg(p.acao === 'EXCLUIR' ? 'EXCLUIDO' : 'RECUSADO');
    n += 1;
    if (n === 1) console.log('(1ª operação verificada: candidato saiu e sobrevivente segue ativo)');
    await sleep(300);
  }
  const por = {}; Object.values(saida.resultados).forEach((r) => { por[r.resultado] = (por[r.resultado] || 0) + 1; });
  console.log('Resumo:', JSON.stringify(por));
})().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
