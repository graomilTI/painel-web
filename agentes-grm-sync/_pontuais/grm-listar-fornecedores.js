#!/usr/bin/env node
'use strict';

/**
 * Lista os fornecedores do GRM (tela Financeiro > Fornecedores, `suppliers/getRecords`) e grava um JSON com os cadastros.
 * SÓ LEITURA: usa o token em cache (grm-token-cache.js) e nunca faz login. Rodar no servidor (rota do túnel):
 *   GRM_AGENTE_ID=sync-lancar-notas-fiscais NODE_OPTIONS=--require=./grm-egress-proxy.js \
 *     /opt/node22/bin/node _pontuais/grm-listar-fornecedores.js --sondar        (mostra os campos de 1 cadastro)
 *   ... --saida /tmp/fornecedores-grm.json [--status A|I|todos]
 */

require('dotenv').config();
require('dotenv').config({ path: '.env.production' });

const fs = require('fs');
const https = require('https');
const { obterTokenGrm } = require('../grm-token-cache');

const GRM_BASE_URL = String(process.env.GRMSERVER_API_URL || 'https://www.grmserver.com.br/api/').replace(/\/?$/, '/');
const HEADERS = {
  accept: 'application/json',
  'content-type': 'application/json',
  origin: 'https://www.grmserver.com.br',
  referer: 'https://www.grmserver.com.br/adm/finance/supplier',
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
  'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
};

const arg = (nome, padrao = null) => { const i = process.argv.indexOf(`--${nome}`); return i < 0 ? padrao : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };

function post(endpoint, body, token) {
  const dados = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request(`${GRM_BASE_URL}${endpoint}`, { method: 'POST', headers: { ...HEADERS, authorization: `Bearer ${token}`, 'content-length': Buffer.byteLength(dados) } }, (res) => {
      let txt = '';
      res.on('data', (c) => { txt += c; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`HTTP ${res.statusCode} em ${endpoint}: ${txt.slice(0, 160)}`));
        try { resolve(JSON.parse(txt)); } catch { reject(new Error(`Resposta inválida de ${endpoint}: ${txt.slice(0, 160)}`)); }
      });
    });
    req.on('error', reject);
    req.end(dados);
  });
}

async function main() {
  const token = await obterTokenGrm({ login: async () => { throw new Error('Sem token do GRM em cache para hoje (ver grm-token-cache.js salvar).'); } });
  // Sonda de endpoint/filtro: --chamar suppliers/getRecords --corpo '{"scaCode":73}' (resume a resposta, não grava nada).
  if (arg('chamar')) {
    const r = await post(String(arg('chamar')), JSON.parse(String(arg('corpo', '{}'))), token);
    const rows = Array.isArray(r.searchData) ? r.searchData : [];
    const porCategoria = {};
    for (const l of rows) { const k = l.scaName || l.picName || '(sem)'; porCategoria[k] = (porCategoria[k] || 0) + 1; }
    console.log(JSON.stringify({ result: r.result, message: r.message, searchCount: r.searchCount, recebidos: rows.length, chaves: Object.keys(r), primeiroCodigo: rows[0]?.supCode, ultimoCodigo: rows[rows.length - 1]?.supCode, amostra: rows[0] && Object.keys(rows[0]).slice(0, 5), porCategoria, ufs: [...new Set(rows.map((l) => l.staAbreviation))].slice(0, 12), locais: [...new Set(rows.map((l) => l.olcName))].slice(0, 12) }, null, 1));
    return;
  }
  const norm = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
  const catalogo = await post('supplierCategory/getRecords', {}, token);
  const catRows = Array.isArray(catalogo.searchData) ? catalogo.searchData : [];
  const pedidas = String(arg('categorias', 'DESPESAS COM VEICULOS,COMBUSTIVEIS')).split(',').map(norm).filter(Boolean);
  const cats = pedidas.map((nome) => {
    const c = catRows.find((x) => norm(x.scaName) === nome);
    if (!c) throw new Error(`Categoria "${nome}" não existe no GRM. Existentes: ${catRows.map((x) => x.scaName).join(', ')}`);
    return c;
  });
  console.log(`Categorias: ${cats.map((c) => `${c.scaName} (${c.scaCode})`).join('; ')}`);

  const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
  const ALFA = [...'abcdefghijklmnopqrstuvwxyz0123456789', ' ', ...'ãáâéêíóôõúç'];
  const PAUSA = Number(arg('pausa', 120));
  const MAX_CONSULTAS = Number(arg('max', 9000));
  const achados = new Map();
  const capadas = [];
  let consultas = 0;
  let ultimosNovos = 0; // cadastros novos que a última consulta trouxe (para podar a divisão)
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));

  async function consultar(corpo) {
    if (consultas >= MAX_CONSULTAS) throw new Error(`Limite de ${MAX_CONSULTAS} consultas atingido; refaça com --max maior.`);
    consultas += 1;
    const r = await post('suppliers/getRecords', { supName: '', supDocument: '', groupSearch: '', ...corpo }, token);
    if (!r.result && r.message !== 'records_not_found') throw new Error(`suppliers/getRecords falhou (${JSON.stringify(corpo)}): ${r.message}`);
    const rows = Array.isArray(r.searchData) ? r.searchData : [];
    const antes = achados.size;
    for (const l of rows) achados.set(l.supCode, l);
    ultimosNovos = achados.size - antes;
    if (consultas % 100 === 0) console.log(`  ... ${consultas} consultas, ${achados.size} cadastros`);
    await espera(PAUSA);
    return rows.length;
  }

  // Divide por trecho do nome enquanto a consulta bater o teto de 100 (até 3 caracteres).
  async function dividir(corpo, termo) {
    const n = await consultar({ ...corpo, groupSearch: termo });
    if (n < 100 || ultimosNovos === 0) return; // sem novidade, dividir mais não acha nada
    if (termo.length >= 3) { capadas.push({ ...corpo, groupSearch: termo }); return; }
    for (const c of ALFA) await dividir(corpo, termo + c);
  }

  for (const cat of cats) {
    for (const supStatus of String(arg('status', 'todos')) === 'todos' ? ['A', 'I'] : [String(arg('status'))]) {
      const base = { scaCode: cat.scaCode, supStatus };
      const antes = achados.size;
      const total = await consultar(base);
      if (total >= 100) {
        // 1) por UF; 2) o que ainda bater o teto, por trecho do nome; 3) varredura geral por trecho (pega quem não tem UF).
        for (const uf of UFS) {
          const n = await consultar({ ...base, staAbreviation: uf });
          if (n >= 100) for (const c of ALFA) await dividir({ ...base, staAbreviation: uf }, c);
        }
        for (const c of ALFA) await dividir(base, c);
      }
      console.log(`${cat.scaName} [${supStatus}]: +${achados.size - antes} cadastros (${consultas} consultas até aqui)`);
    }
  }
  if (capadas.length) console.log(`ATENÇÃO: ${capadas.length} consulta(s) ainda bateram 100 no nível máximo de divisão (podem faltar cadastros): ${JSON.stringify(capadas.slice(0, 5))}`);
  const linhas = [...achados.values()].sort((a, b) => String(a.scaName).localeCompare(String(b.scaName)) || String(a.supName).localeCompare(String(b.supName)));
  const saida = String(arg('saida', '/tmp/fornecedores-grm.json'));
  fs.writeFileSync(saida, JSON.stringify(linhas, null, 1));
  const porCat = {};
  for (const l of linhas) { const k = `${l.scaName}/${l.supStatus}`; porCat[k] = (porCat[k] || 0) + 1; }
  console.log(`Gravado ${linhas.length} cadastro(s) em ${saida}: ${JSON.stringify(porCat)}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
