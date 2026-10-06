#!/usr/bin/env node
'use strict';

/**
 * Lança Adiantamento (Caixa Operacional) em lote a partir de um plano JSON
 * [{ cpf, nome, valor }] — usado para o "HOL <MÊS>/26" dos intermitentes
 * (06/10/2026: HOL SET/26, data 30/09/2026).
 *
 * Mesmo POST da tela "Adicionar movimento" do GRM: `oFlow/setRecord`
 * (multipart) com ofmType 'C' (Adiantamento), empresa = scpCode do próprio
 * colaborador. Sem navegador: só o token em cache (grm-token-cache.js).
 *
 * Padrão é DRY-RUN (só confere e imprime). Para gravar: --executar.
 *   node grm-adiantamento-hol-pontual.js --plano plano.json --descricao "HOL SET/26" --data 30/09/2026
 *   ... --executar --limite 1          (teste com 1 lançamento)
 *   ... --executar                     (todos; pula quem já tem a descrição no Caixa)
 *   ... --verificar                    (só confere o que está no Caixa contra o plano)
 *   ... --excluir-divergentes [--executar]  (apaga SÓ os lançamentos criados por este script — códigos do
 *                                       --log-origem — cujo valor difere do plano; os corretos ficam)
 */

require('dotenv').config();
require('dotenv').config({ path: '.env.production' });

const fs = require('fs');
const path = require('path');
const { obterTokenGrm } = require('./grm-token-cache');

const GRM_BASE_URL = String(process.env.GRMSERVER_API_URL || 'https://www.grmserver.com.br/api/').replace(/\/?$/, '/');
const GRM_WEB_HEADERS = {
  accept: 'application/json',
  origin: 'https://www.grmserver.com.br',
  referer: 'https://www.grmserver.com.br/login',
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
  'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
};

function arg(nome, padrao = null) {
  const i = process.argv.indexOf(`--${nome}`);
  if (i < 0) return padrao;
  const prox = process.argv[i + 1];
  return prox && !prox.startsWith('--') ? prox : true;
}

const PLANO = arg('plano');
const DESCRICAO = String(arg('descricao', '') || '').trim();
const DATA_BR = String(arg('data', '') || '').trim(); // dd/mm/aaaa
const EXECUTAR = process.argv.includes('--executar');
const VERIFICAR = process.argv.includes('--verificar');
const EXCLUIR = process.argv.includes('--excluir-divergentes');
const LIMITE = Number(arg('limite', 0)) || 0;
const PAUSA_MS = Number(arg('pausa-ms', 350)) || 350;
const LOG_FILE = String(arg('log', '') || '') || path.join(process.cwd(), `adiantamento-hol-resultado-${new Date().toISOString().slice(0, 10)}.jsonl`);

const LOG_ORIGEM_ARG = String(arg('log-origem', '') || '');
if (!PLANO || !DESCRICAO || !/^\d{2}\/\d{2}\/\d{4}$/.test(DATA_BR)) {
  console.error('Uso: node grm-adiantamento-hol-pontual.js --plano plano.json --descricao "HOL SET/26" --data 30/09/2026 [--executar] [--limite N] [--verificar]');
  process.exit(2);
}

function log(level, msg) { console.log(`[${level}] ${new Date().toISOString()} - ${msg}`); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function digits(v) { return String(v ?? '').replace(/\D/g, ''); }
function norm(v) { return String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim(); }
function brToIso(br) { const [d, m, y] = br.split('/'); return `${y}-${m}-${d}`; }
function money(v) { return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

async function grmRequest(token, endpoint, body, multipart = false) {
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  let resp;
  try {
    resp = await fetch(`${GRM_BASE_URL}${endpoint}`, { method: 'POST', headers, body: corpo, signal: controller.signal });
  } finally { clearTimeout(timer); }
  const texto = await resp.text();
  let json;
  try { json = texto ? JSON.parse(texto) : {}; } catch { throw new Error(`GRM ${endpoint} resposta inválida (HTTP ${resp.status}): ${texto.slice(0, 200)}`); }
  if (!resp.ok || json?.result === false) {
    const e = new Error(`GRM ${endpoint} HTTP ${resp.status}: ${json?.message || texto.slice(0, 300)}`);
    e.status = resp.status;
    throw e;
  }
  return json;
}

async function lerCaixa(token, deBr, ateBr) {
  const j = await grmRequest(token, 'reports/finance/operatingFlow', {
    ofmDateFrom: deBr, ofmDateTo: ateBr, ofmStatusReport: ['P', 'A', 'N'], reportType: 'flowList',
  });
  return j.searchData || [];
}

function hojeBr() {
  const p = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(new Date());
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g('day')}/${g('month')}/${g('year')}`;
}

// Quem já tem o adiantamento com esta descrição (de qualquer data, exceto recusado):
// protege contra reexecução e contra lançamento feito à mão.
function indexarExistentes(linhas) {
  const alvo = norm(DESCRICAO);
  const por = new Map();
  for (const r of linhas) {
    if (r.ofmType !== 'C' || String(r.ofmStatus).toUpperCase() === 'N') continue;
    if (!norm(r.ofmDescription).includes(alvo)) continue;
    if (!por.has(Number(r.staCode))) por.set(Number(r.staCode), []);
    por.get(Number(r.staCode)).push(r);
  }
  return por;
}

function gravarLog(obj) { fs.appendFileSync(LOG_FILE, `${JSON.stringify({ em: new Date().toISOString(), ...obj })}\n`, 'utf8'); }

async function main() {
  const plano = JSON.parse(fs.readFileSync(PLANO, 'utf8'));
  log('INFO', `Plano: ${plano.length} lançamentos, total ${money(plano.reduce((s, x) => s + Number(x.valor), 0))}. Descrição "${DESCRICAO}", data ${DATA_BR}. Modo: ${VERIFICAR ? 'VERIFICAR' : EXECUTAR ? 'EXECUTAR' : 'DRY-RUN'}${LIMITE ? ` (limite ${LIMITE})` : ''}.`);

  const token = await obterTokenGrm({ login: async () => { throw new Error('Sem token do GRM em cache para hoje (ver grm-token-cache.js salvar).'); } });

  if (EXCLUIR) return excluirDivergentes(token, plano);

  const staffResp = await grmRequest(token, 'staff/getRecords', { staName: '', staCPF: '', staEmail: '', staStatus: '' });
  const porCpf = new Map();
  for (const s of staffResp.searchData || []) {
    const k = digits(s.staCPF);
    if (!k) continue;
    if (!porCpf.has(k)) porCpf.set(k, []);
    porCpf.get(k).push(s);
  }
  log('INFO', `Staff no GRM: ${(staffResp.searchData || []).length}.`);

  const desdeIso = brToIso(DATA_BR);
  const caixa = await lerCaixa(token, `01/${DATA_BR.slice(3)}`, hojeBr());
  const existentes = indexarExistentes(caixa);
  log('INFO', `Caixa lido (${caixa.length} movimentos desde 01/${DATA_BR.slice(3)}); ${existentes.size} colaborador(es) já com "${DESCRICAO}".`);

  const resolvidos = [];
  const problemas = [];
  for (const item of plano) {
    const lista = porCpf.get(digits(item.cpf)) || [];
    if (lista.length !== 1) { problemas.push({ ...item, motivo: lista.length ? `CPF em ${lista.length} cadastros do GRM` : 'CPF não encontrado no GRM' }); continue; }
    const s = lista[0];
    const avisos = [];
    if (s.staType !== 'I') avisos.push(`staType=${s.staType} (esperado I)`);
    if (norm(s.staName) !== norm(item.nome)) avisos.push(`nome no GRM: ${s.staName}`);
    if (String(s.staStatus).toUpperCase() !== 'A') avisos.push(`staStatus=${s.staStatus}`);
    if (s.staType !== 'I') { problemas.push({ ...item, motivo: `no GRM o tipo é ${s.staType}, não Intermitente`, staCode: s.staCode }); continue; }
    resolvidos.push({ ...item, staCode: Number(s.staCode), scpCode: Number(s.scpCode) || 1, staStatus: s.staStatus, grmNome: s.staName, avisos });
  }
  if (problemas.length) problemas.forEach((p) => log('WARN', `NÃO LANÇA ${p.nome} (${p.cpf}): ${p.motivo}`));
  const comAviso = resolvidos.filter((r) => r.avisos.length);
  comAviso.forEach((r) => log('WARN', `${r.nome}: ${r.avisos.join('; ')}`));
  const porEmpresa = resolvidos.reduce((a, r) => { a[r.scpCode] = (a[r.scpCode] || 0) + 1; return a; }, {});
  log('INFO', `Resolvidos no GRM: ${resolvidos.length}/${plano.length}; por empresa (scpCode): ${JSON.stringify(porEmpresa)}.`);

  if (VERIFICAR) return verificar(token, resolvidos);

  const fila = [];
  let jaTem = 0;
  for (const r of resolvidos) {
    const ex = existentes.get(r.staCode);
    if (ex?.length) { jaTem += 1; log('INFO', `${r.nome}: já tem "${DESCRICAO}" (ofm ${ex.map((x) => x.ofmCode).join(',')}) — pulado.`); continue; }
    fila.push(r);
  }
  log('INFO', `A lançar: ${fila.length} (já existiam: ${jaTem}). Soma a lançar: ${money(fila.reduce((s, r) => s + Number(r.valor), 0))}.`);

  if (!EXECUTAR) {
    log('INFO', 'DRY-RUN: nada foi gravado. Use --executar para lançar.');
    return;
  }

  const lote = LIMITE ? fila.slice(0, LIMITE) : fila;
  let ok = 0; let erros = 0; let seguidos = 0;
  for (const r of lote) {
    const valor = Number(r.valor).toFixed(2);
    try {
      const resp = await grmRequest(token, 'oFlow/setRecord', {
        ofmType: 'C',
        staCode: r.staCode,
        ofmDate: DATA_BR,
        ofmDescription: DESCRICAO,
        ofmValue: valor,
        oexCode: '',
        odtCode: '',
        ofmDocument: '',
        moreThenOneCompany: 'S',
        scpCode: r.scpCode,
      }, true);
      ok += 1; seguidos = 0;
      gravarLog({ acao: 'LANCADO', nome: r.nome, cpf: r.cpf, staCode: r.staCode, scpCode: r.scpCode, valor, resposta: resp });
      log('SUCCESS', `${ok}/${lote.length} ${r.nome} (staCode ${r.staCode}) ${money(valor)} lançado.`);
    } catch (e) {
      erros += 1; seguidos += 1;
      gravarLog({ acao: 'ERRO', nome: r.nome, cpf: r.cpf, staCode: r.staCode, valor, erro: e.message });
      log('ERROR', `${r.nome} (staCode ${r.staCode}): ${e.message}`);
      if (e.status === 401 || e.status === 403 || seguidos >= 5) { log('ERROR', 'Interrompido (autenticação ou 5 erros seguidos).'); break; }
    }
    await sleep(PAUSA_MS);
  }
  log('INFO', `Fim: ${ok} lançados, ${erros} erros. Conferindo no Caixa...`);
  await verificar(token, resolvidos);
}

// Confere, para cada item do plano, que existe exatamente 1 adiantamento (não recusado)
// com a descrição, na data, com o valor esperado.
async function verificar(token, resolvidos) {
  const caixa = await lerCaixa(token, DATA_BR, DATA_BR);
  const iso = brToIso(DATA_BR);
  const alvo = norm(DESCRICAO);
  const doDia = caixa.filter((r) => r.ofmType === 'C' && r.ofmDate === iso && norm(r.ofmDescription) === alvo && String(r.ofmStatus).toUpperCase() !== 'N');
  const por = new Map();
  doDia.forEach((r) => { if (!por.has(Number(r.staCode))) por.set(Number(r.staCode), []); por.get(Number(r.staCode)).push(r); });
  let certo = 0; const faltando = []; const divergentes = []; const duplicados = [];
  const status = {};
  for (const r of resolvidos) {
    const l = por.get(r.staCode) || [];
    if (!l.length) { faltando.push(r); continue; }
    if (l.length > 1) duplicados.push({ r, l });
    const bate = l.some((x) => Math.abs(Number(x.ofmValue) - Number(r.valor)) < 0.005);
    if (!bate) { divergentes.push({ r, l }); continue; }
    certo += 1;
    l.forEach((x) => { status[x.ofmStatus] = (status[x.ofmStatus] || 0) + 1; });
  }
  log('INFO', `VERIFICAÇÃO: ${certo} corretos, ${faltando.length} faltando, ${divergentes.length} com valor divergente, ${duplicados.length} duplicados. Status no GRM: ${JSON.stringify(status)}.`);
  doDia.filter((r) => String(r.ofmStatus).toUpperCase() === 'P' && resolvidos.some((x) => x.staCode === Number(r.staCode)))
    .forEach((r) => log('WARN', `PENDENTE DE APROVAÇÃO no GRM: ${r.staName} (ofm ${r.ofmCode}, ${money(r.ofmValue)})`));
  faltando.slice(0, 15).forEach((r) => log('WARN', `FALTANDO ${r.nome} (${money(r.valor)})`));
  if (faltando.length > 15) log('WARN', `... e mais ${faltando.length - 15} faltando.`);
  divergentes.forEach((d) => log('WARN', `DIVERGENTE ${d.r.nome}: plano ${money(d.r.valor)} x GRM ${d.l.map((x) => money(x.ofmValue)).join(', ')}`));
  duplicados.forEach((d) => log('WARN', `DUPLICADO ${d.r.nome}: ofm ${d.l.map((x) => x.ofmCode).join(', ')}`));
  const somaGrm = doDia.filter((x) => resolvidos.some((r) => r.staCode === Number(x.staCode))).reduce((s, x) => s + Number(x.ofmValue), 0);
  log('INFO', `Soma no GRM (dos colaboradores do plano): ${money(somaGrm)}.`);
}

// Apaga os lançamentos feitos por este script (códigos registrados no log) cujo valor difere do plano.
// Só toca em registro que confere em tudo com o que o script criou; backup da linha antes de apagar;
// para no primeiro erro; confere no Caixa que o apagado saiu e que os corretos continuam.
async function excluirDivergentes(token, plano) {
  const origem = LOG_ORIGEM_ARG || LOG_FILE;
  const valorPorCpf = new Map(plano.map((p) => [digits(p.cpf), Number(p.valor)]));
  const criados = new Map();
  fs.readFileSync(origem, 'utf8').split('\n').filter(Boolean).forEach((l) => {
    const o = JSON.parse(l);
    if (o.acao === 'LANCADO' && o.resposta?.recordCode) criados.set(Number(o.resposta.recordCode), o);
  });
  log('INFO', `Log de origem (${origem}): ${criados.size} lançamentos criados por este script.`);

  const iso = brToIso(DATA_BR);
  const lerDia = async () => new Map((await lerCaixa(token, DATA_BR, DATA_BR)).map((r) => [Number(r.ofmCode), r]));
  const dia = await lerDia();
  const aExcluir = []; const pulados = []; let corretos = 0;
  for (const [cod, e] of criados) {
    const r = dia.get(cod);
    if (!r) { pulados.push(`${e.nome} (ofm ${cod}): não está mais no Caixa`); continue; }
    // Os que o GRM deixou pendentes (P) vêm sem usuário preenchido; os aprovados vêm como AUTOMACOES.
    const quem = String(r.ofmUpdateUserName || '').trim().toUpperCase();
    const quemOk = quem === 'AUTOMACOES' || (quem === '' && String(r.ofmStatus).toUpperCase() === 'P');
    if (r.ofmType !== 'C' || r.ofmDescription !== DESCRICAO || r.ofmDate !== iso || Number(r.staCode) !== Number(e.staCode) || !quemOk) { pulados.push(`${e.nome} (ofm ${cod}): registro não confere com o criado pelo script`); continue; }
    if (String(r.ofmStatus).toUpperCase() === 'N') { pulados.push(`${e.nome} (ofm ${cod}): já recusado`); continue; }
    if (r.ofmIsFinalized !== 'N') { pulados.push(`${e.nome} (ofm ${cod}): já finalizado no GRM (${r.ofmIsFinalized})`); continue; }
    const alvo = valorPorCpf.get(digits(e.cpf));
    if (alvo == null) { pulados.push(`${e.nome} (ofm ${cod}): CPF fora do plano`); continue; }
    if (Math.abs(Number(r.ofmValue) - alvo) < 0.005) { corretos += 1; continue; }
    aExcluir.push({ cod, e, r, alvo });
  }
  pulados.forEach((x) => log('WARN', `PULADO ${x}`));
  log('INFO', `Já corretos (ficam): ${corretos}. A excluir (valor difere do plano): ${aExcluir.length}, hoje somando ${money(aExcluir.reduce((s, x) => s + Number(x.r.ofmValue), 0))}; o plano prevê ${money(aExcluir.reduce((s, x) => s + x.alvo, 0))}.`);
  if (!EXECUTAR) { log('INFO', 'DRY-RUN: nada foi excluído. Use --executar.'); return; }

  const lote = LIMITE ? aExcluir.slice(0, LIMITE) : aExcluir;
  const backupFile = `${LOG_FILE}.backup-exclusao.jsonl`;
  let feitos = 0;
  for (const x of lote) {
    fs.appendFileSync(backupFile, `${JSON.stringify({ em: new Date().toISOString(), linha: x.r })}\n`, 'utf8');
    try {
      await grmRequest(token, 'oFlow/delete', { ofmCode: x.cod });
    } catch (e) {
      gravarLog({ acao: 'EXCLUSAO_ERRO', nome: x.e.nome, ofmCode: x.cod, erro: e.message });
      log('ERROR', `${x.e.nome} (ofm ${x.cod}): ${e.message} — interrompido.`);
      return;
    }
    gravarLog({ acao: 'EXCLUIDO', nome: x.e.nome, cpf: x.e.cpf, ofmCode: x.cod, valorExcluido: Number(x.r.ofmValue), valorPlano: x.alvo });
    feitos += 1;
    if (feitos === 1) {
      await sleep(500);
      const depois = await lerDia();
      if (depois.has(x.cod)) { log('ERROR', `A 1ª exclusão (ofm ${x.cod}) não surtiu efeito — interrompido.`); return; }
      log('SUCCESS', `1ª exclusão verificada (ofm ${x.cod} saiu do Caixa).`);
    }
    if (feitos % 25 === 0) log('INFO', `${feitos}/${lote.length} excluídos...`);
    await sleep(PAUSA_MS);
  }
  const final = await lerDia();
  const restam = lote.filter((x) => final.has(x.cod));
  const sumiramCorretos = [...criados.keys()].filter((c) => dia.has(c) && !final.has(c) && !lote.some((x) => x.cod === c));
  log('INFO', `Excluídos: ${feitos}. Ainda no Caixa (deveriam ter saído): ${restam.length}. Corretos que sumiram sem querer: ${sumiramCorretos.length}.`);
  restam.forEach((x) => log('WARN', `AINDA NO CAIXA ${x.e.nome} (ofm ${x.cod})`));
}

main().catch((e) => { log('ERROR', e.stack || e.message); process.exit(1); });
