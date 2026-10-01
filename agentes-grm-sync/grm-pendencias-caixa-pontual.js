#!/usr/bin/env node
'use strict';

/*
 * EXECUÇÃO PONTUAL (01/10/2026) — não faz parte do SCRIPT_MAP/cron.
 *
 * Aplica no Caixa Operacional do GRM o plano de pendências decidido pelo usuário
 * (arquivo JSON passado em --plano), a partir da análise do relatório
 * "Caixa Operacional (11).xlsx":
 *   RECUSAR  — duplicatas (recusa com o motivo "Duplicata");
 *   APROVAR  — Embarque SIM em Almoço / Salário de Intermitente / Serviços Terceirizados;
 *   CORRIGIR — Embarque SIM, mas a observação traz a data correta: cria o lançamento
 *              na data correta (se ainda não houver um ativo lá), aprova o novo e só
 *              então recusa o original com o motivo "data corrigida" (mesmo padrão
 *              de grm-despesas-retroativas-pontual.js). Se já existir lançamento
 *              ativo na data correta, o original é recusado como duplicata.
 *
 * Usa o token em cache (grm-token-cache.js) — nunca faz login. Por padrão roda em
 * DRY-RUN (só consulta e mostra o que faria); para aplicar passe --executar.
 *
 *   node grm-pendencias-caixa-pontual.js --plano plano.json            (dry-run)
 *   node grm-pendencias-caixa-pontual.js --plano plano.json --executar
 *
 * Cada item só é tocado se existir UMA pendência (status P) no GRM que bata com
 * nome+data+despesa+valor+observação do plano; ambíguo ou ausente = pulado e listado.
 */

require('dotenv').config();
require('dotenv').config({ path: '.env.production' });
const fs = require('fs');
const { obterTokenGrm } = require('./grm-token-cache');

const GRM_BASE_URL = String(process.env.GRMSERVER_API_URL || 'https://www.grmserver.com.br/api/').replace(/\/?$/, '/');
const GRM_WEB_HEADERS = {
  accept: 'application/json',
  origin: 'https://www.grmserver.com.br',
  referer: 'https://www.grmserver.com.br/login',
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
  'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
};

const args = process.argv.slice(2);
const EXECUTAR = args.includes('--executar');
const planoPath = args[args.indexOf('--plano') + 1];
const ACOES_MAX = 300;

function norm(v) {
  return String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}
function colado(v) { return norm(v).replace(/ /g, ''); }
function log(msg, data) { console.log(`${new Date().toISOString()} ${msg}${data === undefined ? '' : ' ' + JSON.stringify(data)}`); }
function toBr(d) { // aceita dd/mm/yyyy, yyyy-mm-dd (com ou sem hora)
  const s = String(d || '');
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/); if (m) return `${m[1]}/${m[2]}/${m[3]}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return s;
}

async function grm(path, body, token, multipart = false) {
  const endpoint = String(path).replace(/^\/+/, '').replace(/^api\//, '');
  const headers = { ...GRM_WEB_HEADERS, authorization: `Bearer ${token}` };
  let requestBody;
  if (multipart) {
    const form = new FormData();
    Object.entries(body || {}).forEach(([k, v]) => form.append(k, v == null ? '' : String(v)));
    requestBody = form;
  } else {
    headers['content-type'] = 'application/json';
    requestBody = JSON.stringify(body || {});
  }
  const res = await fetch(`${GRM_BASE_URL}${endpoint}`, { method: 'POST', headers, body: requestBody, signal: AbortSignal.timeout(60000) });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : {}; } catch (_) { throw new Error(`${endpoint} HTTP ${res.status}: ${text.slice(0, 300)}`); }
  if (!res.ok || json?.result === false) throw new Error(`${endpoint} HTTP ${res.status}: ${json?.message || text.slice(0, 400)}`);
  return json;
}

async function fluxo(token, dataBr, status = ['P', 'A', 'N']) {
  const r = await grm('/api/reports/finance/operatingFlow', { ofmDateFrom: dataBr, ofmDateTo: dataBr, ofmStatusReport: status, reportType: 'flowList' }, token);
  return r.searchData || [];
}

const aprovar = (token, row) => grm('/api/oFlow/approve', { ofmCode: Number(row.ofmCode), reproveReason: '', type: 'A' }, token);
const recusar = (token, row, motivo) => grm('/api/oFlow/disapprove', { ofmCode: Number(row.ofmCode), reproveReason: motivo, type: 'D' }, token);
const criar = (token, row, dataBr, descricao) => grm('/api/oFlow/setRecord', {
  ofmType: 'D', staCode: Number(row.staCode), ofmDate: dataBr, ofmDescription: descricao,
  ofmValue: Number(row.ofmValue).toFixed(2), oexCode: Number(row.oexCode),
  odtCode: Number(row.odtCode || 1), ofmDocument: '0', moreThenOneCompany: 'N', scpCode: Number(row.scpCode || 1),
}, token, true);

async function main() {
  if (!planoPath) throw new Error('Informe --plano arquivo.json');
  const plano = JSON.parse(fs.readFileSync(planoPath, 'utf8'));
  log(`Modo: ${EXECUTAR ? 'EXECUTAR (grava no GRM)' : 'DRY-RUN (só leitura)'} — ${plano.length} itens no plano`);
  const token = await obterTokenGrm({ login: async () => { throw new Error('Token GRM do dia ausente/vencido — grave com: node grm-token-cache.js salvar'); } });

  const datas = [...new Set(plano.map((p) => p.data))].sort();
  const porData = new Map();
  for (const d of datas) {
    const rows = await fluxo(token, d);
    porData.set(d, rows);
    log(`GRM ${d}: ${rows.length} lançamentos (P/A/N)${rows.length === 300 ? ' — ATENÇÃO: exatamente 300, possível corte' : ''}`);
  }
  if (datas.length && porData.get(datas[0])[0]) log('Amostra de campos do GRM', Object.keys(porData.get(datas[0])[0]));

  // casamento plano -> linha do GRM
  const grupos = new Map();
  plano.forEach((p) => {
    const k = [norm(p.nome), p.data, norm(p.desp), Number(p.valor).toFixed(2), colado(p.obs)].join('|');
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(p);
  });
  const resultados = [];
  const casados = [];
  for (const [k, itens] of grupos) {
    const [nome, data, desp, valor, obs] = k.split('|');
    const cands = (porData.get(data) || []).filter((r) => r.ofmType === 'D' && String(r.ofmStatus).toUpperCase() === 'P'
      && norm(r.staName) === nome && norm(r.oexName) === desp && Number(r.ofmValue).toFixed(2) === valor
      && colado(r.ofmDescription || '') === obs).sort((a, b) => Number(a.ofmCode) - Number(b.ofmCode));
    itens.sort((a, b) => a.linha - b.linha);
    // gêmeos idênticos pendentes e só os "repetidos" foram marcados para recusa: recusa os de maior ofmCode, mantém o primeiro
    if (cands.length > itens.length && itens.every((p) => p.acao === 'RECUSAR')) {
      itens.forEach((p, i) => casados.push({ p, row: cands[cands.length - itens.length + i] }));
      continue;
    }
    if (cands.length !== itens.length) {
      itens.forEach((p) => resultados.push({ linha: p.linha, acao: p.acao, status: 'PULADO', motivo: `GRM tem ${cands.length} pendência(s) correspondente(s), plano espera ${itens.length}` }));
      continue;
    }
    itens.forEach((p, i) => casados.push({ p, row: cands[i] }));
  }
  log(`Casados: ${casados.length} / ${plano.length}; pulados: ${resultados.length}`);

  // sanidade: Embarque SIM no GRM (haveMovement) para tudo que for aprovado/corrigido
  for (const { p, row } of casados) {
    if (p.acao !== 'RECUSAR' && String(row.haveMovement || '').toUpperCase() !== 'S') {
      log(`ALERTA haveMovement=${row.haveMovement} em ${p.nome} ${p.data} ${p.desp} (linha ${p.linha}) — esperado S`);
    }
  }

  let acoes = 0;
  const ordem = { RECUSAR: 0, APROVAR: 1, CORRIGIR: 2 };
  casados.sort((a, b) => ordem[a.p.acao] - ordem[b.p.acao]);
  for (const { p, row } of casados) {
    const base = { linha: p.linha, acao: p.acao, nome: p.nome, desp: p.desp, data: p.data, valor: p.valor, ofmCode: Number(row.ofmCode) };
    if (acoes >= ACOES_MAX) { resultados.push({ ...base, status: 'PULADO', motivo: 'limite de ações' }); continue; }
    try {
      if (p.acao === 'RECUSAR') {
        if (EXECUTAR) await recusar(token, row, p.motivo || 'Duplicata');
        resultados.push({ ...base, status: EXECUTAR ? 'OK' : 'DRY', detalhe: 'recusado: ' + (p.motivo || 'Duplicata') });
      } else if (p.acao === 'APROVAR') {
        if (EXECUTAR) await aprovar(token, row);
        resultados.push({ ...base, status: EXECUTAR ? 'OK' : 'DRY', detalhe: 'aprovado' });
      } else if (p.acao === 'CORRIGIR') {
        const destino = p.data_correta;
        const noDestino = (await fluxo(token, destino, ['P', 'A'])).filter((r) => r.ofmType === 'D'
          && Number(r.staCode) === Number(row.staCode) && Number(r.oexCode) === Number(row.oexCode));
        if (noDestino.length) {
          if (EXECUTAR) await recusar(token, row, 'Duplicata');
          resultados.push({ ...base, status: EXECUTAR ? 'OK' : 'DRY', detalhe: `já existe lançamento em ${destino} (ofmCode ${noDestino[0].ofmCode}, status ${noDestino[0].ofmStatus === 'A' ? 'APROVADO' : 'PENDENTE'}); original recusado como duplicata` });
        } else if (!EXECUTAR) {
          resultados.push({ ...base, status: 'DRY', detalhe: `criaria em ${destino}, aprovaria o novo e recusaria o original (data corrigida)` });
        } else {
          await criar(token, row, destino, `${row.ofmDescription || ''} (data corrigida de ${p.data}; original ${row.ofmCode})`.trim());
          const novos = (await fluxo(token, destino, ['P', 'A'])).filter((r) => r.ofmType === 'D' && Number(r.staCode) === Number(row.staCode)
            && Number(r.oexCode) === Number(row.oexCode)).sort((a, b) => Number(b.ofmCode) - Number(a.ofmCode));
          if (!novos.length) throw new Error('lançamento criado não apareceu na data correta — original mantido pendente');
          if (String(novos[0].ofmStatus).toUpperCase() === 'P') await aprovar(token, novos[0]);
          await recusar(token, row, 'data corrigida');
          resultados.push({ ...base, status: 'OK', detalhe: `criado e aprovado em ${destino} (ofmCode ${novos[0].ofmCode}); original recusado (data corrigida)` });
        }
      }
      acoes += 1;
    } catch (e) {
      resultados.push({ ...base, status: 'ERRO', motivo: e.message });
      log(`ERRO linha ${p.linha}: ${e.message}`);
    }
  }

  const resumo = resultados.reduce((a, r) => { const k = `${r.acao}/${r.status}`; a[k] = (a[k] || 0) + 1; return a; }, {});
  log('RESUMO', resumo);
  const out = `${planoPath}.${EXECUTAR ? 'executado' : 'dryrun'}.json`;
  fs.writeFileSync(out, JSON.stringify(resultados, null, 1));
  log(`Resultado detalhado em ${out}`);
  resultados.filter((r) => r.status === 'PULADO' || r.status === 'ERRO').forEach((r) => log('ATENÇÃO', r));
}

main().catch((e) => { console.error(`[ERRO FATAL] ${e.message}`); process.exit(1); });
