#!/usr/bin/env node
'use strict';

/**
 * Recria no Caixa do GRM despesas que foram excluídas por engano, a partir de um JSON
 * [{ cpf, nome, data: 'dd/mm/aaaa', descricao, valor, oexCode, odtCode, aprovar }].
 * Mesmo POST da tela (oFlow/setRecord, ofmType 'D') e, se `aprovar`, oFlow/approve — igual ao
 * fluxo do agente de despesas retroativas. Dry-run por padrão; --executar para gravar.
 * Idempotente: se já existe lançamento (não recusado) do mesmo colaborador, data, descrição e valor, pula.
 *
 *   node grm-restaurar-despesa-pontual.js --plano restaurar.json [--executar]
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

const EXECUTAR = process.argv.includes('--executar');
const iPlano = process.argv.indexOf('--plano');
const PLANO = iPlano >= 0 ? process.argv[iPlano + 1] : null;
if (!PLANO) { console.error('Uso: node grm-restaurar-despesa-pontual.js --plano restaurar.json [--executar]'); process.exit(2); }

function log(level, msg) { console.log(`[${level}] ${new Date().toISOString()} - ${msg}`); }
const digits = (v) => String(v ?? '').replace(/\D/g, '');
const brToIso = (br) => br.split('/').reverse().join('-');
const money = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function grm(token, endpoint, body, multipart = false) {
  const headers = { ...GRM_WEB_HEADERS, authorization: `Bearer ${token}` };
  let corpo;
  if (multipart) {
    const form = new FormData();
    Object.entries(body || {}).forEach(([k, v]) => form.append(k, v == null ? '' : String(v)));
    corpo = form;
  } else {
    headers['content-type'] = 'application/json';
    corpo = JSON.stringify(body || {});
  }
  const resp = await fetch(`${GRM_BASE_URL}${endpoint}`, { method: 'POST', headers, body: corpo });
  const texto = await resp.text();
  let json;
  try { json = texto ? JSON.parse(texto) : {}; } catch { throw new Error(`GRM ${endpoint} resposta inválida (HTTP ${resp.status}): ${texto.slice(0, 200)}`); }
  if (!resp.ok || json?.result === false) throw new Error(`GRM ${endpoint} HTTP ${resp.status}: ${json?.message || texto.slice(0, 300)}`);
  return json;
}

const lerDia = async (token, br) => (await grm(token, 'reports/finance/operatingFlow', {
  ofmDateFrom: br, ofmDateTo: br, ofmStatusReport: ['P', 'A', 'N'], reportType: 'flowList',
})).searchData || [];

async function main() {
  const plano = JSON.parse(fs.readFileSync(PLANO, 'utf8'));
  log('INFO', `${plano.length} despesa(s) a restaurar. Modo: ${EXECUTAR ? 'EXECUTAR' : 'DRY-RUN'}.`);
  const token = await obterTokenGrm({ login: async () => { throw new Error('Sem token do GRM em cache para hoje.'); } });
  const staff = (await grm(token, 'staff/getRecords', { staName: '', staCPF: '', staEmail: '', staStatus: '' })).searchData || [];

  for (const it of plano) {
    const lista = staff.filter((s) => digits(s.staCPF) === digits(it.cpf));
    if (lista.length !== 1) { log('ERROR', `${it.nome}: CPF em ${lista.length} cadastros — pulado.`); continue; }
    const s = lista[0];
    const dia = (await lerDia(token, it.data)).filter((r) => Number(r.staCode) === Number(s.staCode));
    const iso = brToIso(it.data);
    const ja = dia.find((r) => r.ofmType === 'D' && String(r.ofmStatus) !== 'N' && r.ofmDate === iso
      && String(r.ofmDescription).trim() === it.descricao && Math.abs(Number(r.ofmValue) - Number(it.valor)) < 0.005);
    log('INFO', `${it.nome} (staCode ${s.staCode}, ${s.staName}): em ${it.data} há ${dia.length} movimento(s): ${dia.map((r) => `${r.ofmType}/${r.oexName || ''} ${money(r.ofmValue)} [${r.ofmStatus}]`).join('; ') || '-'}`);
    if (ja) { log('INFO', `${it.nome}: já existe (ofm ${ja.ofmCode}, status ${ja.ofmStatus}) — pulado.`); continue; }
    if (!EXECUTAR) { log('INFO', `DRY-RUN: criaria ${it.descricao} ${money(it.valor)} em ${it.data} (oexCode ${it.oexCode}, odtCode ${it.odtCode}, scpCode ${Number(s.scpCode) || 1})${it.aprovar ? ' e aprovaria' : ''}.`); continue; }

    const resp = await grm(token, 'oFlow/setRecord', {
      ofmType: 'D', staCode: Number(s.staCode), ofmDate: it.data, ofmDescription: it.descricao,
      ofmValue: Number(it.valor).toFixed(2), oexCode: Number(it.oexCode), odtCode: Number(it.odtCode),
      ofmDocument: '0', moreThenOneCompany: 'N', scpCode: Number(s.scpCode) || 1,
    }, true);
    const ofm = Number(resp.recordCode);
    log('SUCCESS', `${it.nome}: criado ofm ${ofm}.`);
    if (it.aprovar) {
      await grm(token, 'oFlow/approve', { ofmCode: ofm, reproveReason: '', type: 'A' });
      log('SUCCESS', `${it.nome}: ofm ${ofm} aprovado.`);
    }
    const depois = (await lerDia(token, it.data)).find((r) => Number(r.ofmCode) === ofm);
    if (!depois) log('ERROR', `${it.nome}: ofm ${ofm} não apareceu no Caixa.`);
    else log('INFO', `VERIFICAÇÃO ${it.nome}: ofm ${depois.ofmCode} ${depois.oexName} ${money(depois.ofmValue)} "${depois.ofmDescription}" status ${depois.ofmStatus} (por ${depois.ofmUpdateUserName || '-'}).`);
  }
}

main().catch((e) => { log('ERROR', e.stack || e.message); process.exit(1); });
