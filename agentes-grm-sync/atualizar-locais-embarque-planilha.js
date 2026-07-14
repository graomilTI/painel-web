#!/usr/bin/env node
// Atualização pontual (2026-07-14): usuário corrigiu manualmente a planilha "Locais de
// Serviço" (locais que antes ficavam sem Latitude/Longitude e caíam no centro da cidade
// agora têm coordenada própria). Este script sincroniza operacional_pontos_embarque
// diretamente a partir desse arquivo, reaproveitando o mesmo mapeamento/upsert de
// sincronizarLocaisEmbarqueDoAgente() em grm-sync-operacional-os.js (upsert por chave
// natural nome_local,cidade,uf; nunca apaga registros que sumiram da planilha).
require('dotenv').config();
const path = require('path');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

const supabase = createClient(
  process.env.SUPABASE_URL,
  (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY),
  { realtime: { transport: WebSocket } }
);

function log(level, msg) {
  console.log(`[${level}] ${new Date().toISOString()} - ${msg}`);
}

function normKey(value) {
  return String(value || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function toText(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s || null;
}

function toGeoNum(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const s = String(value).trim().replace(',', '.').replace(/[^0-9.-]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function isGeoBrasil(lat, lng) {
  const a = Number(lat);
  const b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (a === 0 && b === 0) return false;
  return a >= -34.5 && a <= 6 && b >= -75 && b <= -33;
}

function pontoKey({ uf, cidade, nome_local }) {
  return `${normKey(uf)}|${normKey(cidade)}|${normKey(nome_local)}`;
}

function mapRow(row) {
  return {
    tipo_local: toText(row['Tipo do Local']),
    nome_local: toText(row['Local']),
    uf: toText(row['UF']),
    cidade: toText(row['Cidade']),
    latitude: toGeoNum(row['Latitude']),
    longitude: toGeoNum(row['Longitude']),
    ativo: true,
  };
}

async function main() {
  const filePath = process.argv[2];
  const dryRun = process.argv.includes('--dry-run');
  if (!filePath) throw new Error('Uso: node atualizar-locais-embarque-planilha.js <caminho.xlsx> [--dry-run]');

  log('INFO', `Lendo ${filePath}...`);
  const wb = XLSX.readFile(path.resolve(filePath));
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  log('SUCCESS', `${rows.length} linha(s) lida(s) da planilha.`);

  const locaisMap = new Map();
  let semCampoObrigatorio = 0;
  let coordInvalida = 0;
  rows.forEach((raw) => {
    const local = mapRow(raw);
    if (!local.uf || !local.cidade || !local.nome_local) { semCampoObrigatorio++; return; }
    if (!isGeoBrasil(local.latitude, local.longitude)) { coordInvalida++; return; }
    locaisMap.set(pontoKey(local), local);
  });

  log('INFO', `Válidos: ${locaisMap.size} | sem UF/Cidade/Local: ${semCampoObrigatorio} | coordenada inválida/ausente: ${coordInvalida}`);

  const locais = [...locaisMap.values()];

  if (dryRun) {
    log('INFO', 'Comparando com operacional_pontos_embarque atual (dry-run, nada será gravado)...');
    const atuais = new Map();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from('operacional_pontos_embarque')
        .select('nome_local,uf,cidade,latitude,longitude')
        .range(from, from + 999);
      if (error) throw error;
      (data || []).forEach((r) => atuais.set(pontoKey(r), r));
      if ((data || []).length < 1000) break;
    }
    let novos = 0, mudouCoord = 0, semMudanca = 0;
    const amostraMudou = [];
    locais.forEach((l) => {
      const key = pontoKey(l);
      const atual = atuais.get(key);
      if (!atual) { novos++; return; }
      const dLat = Math.abs(Number(atual.latitude) - l.latitude);
      const dLng = Math.abs(Number(atual.longitude) - l.longitude);
      if (dLat > 0.0001 || dLng > 0.0001) {
        mudouCoord++;
        if (amostraMudou.length < 15) amostraMudou.push({ local: l.nome_local, cidade: l.cidade, uf: l.uf, de: [atual.latitude, atual.longitude], para: [l.latitude, l.longitude] });
      } else {
        semMudanca++;
      }
    });
    log('SUCCESS', `DRY-RUN: ${novos} novo(s), ${mudouCoord} com coordenada alterada, ${semMudanca} sem mudança. Total atual no banco: ${atuais.size}.`);
    log('INFO', `Amostra de alterações: ${JSON.stringify(amostraMudou, null, 2)}`);
    return;
  }

  let sincronizados = 0;
  let ignoradosPorColisao = 0;
  const colisoes = [];

  for (let i = 0; i < locais.length; i += 500) {
    const chunk = locais.slice(i, i + 500);
    const { error } = await supabase
      .from('operacional_pontos_embarque')
      .upsert(chunk, { onConflict: 'nome_local,cidade,uf' });
    if (!error) { sincronizados += chunk.length; log('INFO', `Progresso: ${Math.min(i + 500, locais.length)}/${locais.length}`); continue; }

    log('WARN', `Chunk ${i}-${i + chunk.length} falhou (${error.message}); tentando linha a linha...`);
    for (const local of chunk) {
      const { error: rowError } = await supabase
        .from('operacional_pontos_embarque')
        .upsert([local], { onConflict: 'nome_local,cidade,uf' });
      if (rowError) { ignoradosPorColisao++; colisoes.push({ local, erro: rowError.message }); }
      else sincronizados++;
    }
  }

  log('SUCCESS', `${sincronizados} local(is) sincronizado(s) em operacional_pontos_embarque (${ignoradosPorColisao} ignorado(s) por colisão).`);
  if (colisoes.length) log('WARN', `Colisões: ${JSON.stringify(colisoes.slice(0, 20))}`);
}

main().then(() => process.exit(0)).catch((err) => {
  log('ERROR', err.stack || err.message);
  process.exit(1);
});
