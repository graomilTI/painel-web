#!/usr/bin/env node
/**
 * scripts/gerar-inventario.mjs
 * Gera o inventário técnico do painel (item 2.1 do plano de reestruturação).
 *
 * Varre o repositório e produz:
 *   - docs/inventario/matriz-modulos.csv  (matriz Módulo × Rota × Arquivos × Tabelas × RPCs × Integrações)
 *   - docs/inventario/tabelas-supabase.csv
 *   - docs/inventario/rpcs.csv
 *   - docs/inventario/hotfixes.csv
 *
 * Uso: node scripts/gerar-inventario.mjs
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'docs', 'inventario');
mkdirSync(OUT, { recursive: true });

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (['.git', 'node_modules', '.github'].includes(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

const files = walk(ROOT);
const rel = (f) => f.slice(ROOT.length).replace(/^\/+/, '');

const htmlPages = files.filter((f) => extname(f) === '.html' && !rel(f).includes('/'));
const jsFiles = files.filter((f) => extname(f) === '.js' && rel(f).startsWith('assets/js'));
const cssFiles = files.filter((f) => extname(f) === '.css');
const migrations = files.filter((f) => rel(f).startsWith('supabase/migrations'));
const edgeFunctions = readdirSync(join(ROOT, 'supabase', 'functions'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_')).map((d) => d.name);

const HOTFIX_RE = /(-fix|-patch|-hotfix|-ajustes?|-runtime-fixes|-v\d+)(\.js|\b)|(Fix|Patch)\.js$/;

// ── extrações por arquivo JS ────────────────────────────────────────────────
function extract(content) {
  const tables = new Set();
  const rpcs = new Set();
  const buckets = new Set();
  for (const m of content.matchAll(/\.from\(\s*['"`]([a-z0-9_]+)['"`]\s*\)/gi)) tables.add(m[1]);
  for (const m of content.matchAll(/\.rpc\(\s*['"`]([a-z0-9_]+)['"`]/gi)) rpcs.add(m[1]);
  for (const m of content.matchAll(/storage\s*\.\s*from\(\s*['"`]([a-z0-9_.-]+)['"`]\s*\)/gi)) buckets.add(m[1]);
  const integracoes = [];
  if (/redgps|bfleet/i.test(content)) integracoes.push('Bfleet/RedGPS');
  if (/botconversa/i.test(content)) integracoes.push('Botconversa');
  if (/detran/i.test(content)) integracoes.push('Detran');
  if (/grmserver|grm[-_]sync/i.test(content)) integracoes.push('GRM Server');
  if (/correios|prepostagem/i.test(content)) integracoes.push('Correios');
  if (/tesseract|paddleocr|ocr/i.test(content)) integracoes.push('OCR');
  if (/googleapis|drive\.google/i.test(content)) integracoes.push('Google Drive');
  return { tables: [...tables], rpcs: [...rpcs], buckets: [...buckets], integracoes };
}

const jsMeta = new Map();
for (const f of jsFiles) {
  const content = readFileSync(f, 'utf8');
  jsMeta.set(rel(f), { ...extract(content), lines: content.split('\n').length });
}

// ── matriz por página HTML ──────────────────────────────────────────────────
const csvEsc = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
const matriz = [['Rota', 'Página HTML', 'Arquivo principal', 'Arquivos complementares', 'Hotfixes carregados', 'Tabelas Supabase', 'RPCs', 'Buckets', 'Integrações'].map(csvEsc).join(';')];

for (const page of htmlPages.sort()) {
  const content = readFileSync(page, 'utf8');
  const scripts = [...content.matchAll(/src="\.\/(assets\/js\/[^"?]+)/g)].map((m) => m[1]);
  const pageName = basename(page, '.html').toLowerCase();
  const main = scripts.find((s) => basename(s, '.js').toLowerCase() === pageName)
    || scripts.find((s) => !HOTFIX_RE.test(basename(s)))
    || scripts[0] || '';
  const complementares = scripts.filter((s) => s !== main && !HOTFIX_RE.test(basename(s)));
  const hotfixes = scripts.filter((s) => HOTFIX_RE.test(basename(s)));
  const tables = new Set(); const rpcs = new Set(); const buckets = new Set(); const ints = new Set();
  for (const s of scripts) {
    const meta = jsMeta.get(s);
    if (!meta) continue;
    meta.tables.forEach((t) => tables.add(t));
    meta.rpcs.forEach((r) => rpcs.add(r));
    meta.buckets.forEach((b) => buckets.add(b));
    meta.integracoes.forEach((i) => ints.add(i));
  }
  matriz.push([
    basename(page, '.html'), rel(page), main,
    complementares.join(' | '), hotfixes.join(' | '),
    [...tables].sort().join(' | '), [...rpcs].sort().join(' | '),
    [...buckets].sort().join(' | '), [...ints].sort().join(' | '),
  ].map(csvEsc).join(';'));
}
writeFileSync(join(OUT, 'matriz-modulos.csv'), '\uFEFF' + matriz.join('\n') + '\n');

// ── tabelas e RPCs consolidadas ─────────────────────────────────────────────
const tableUse = new Map(); const rpcUse = new Map();
for (const [file, meta] of jsMeta) {
  meta.tables.forEach((t) => tableUse.set(t, [...(tableUse.get(t) || []), file]));
  meta.rpcs.forEach((r) => rpcUse.set(r, [...(rpcUse.get(r) || []), file]));
}
writeFileSync(join(OUT, 'tabelas-supabase.csv'),
  '\uFEFF' + ['Tabela;Qtde arquivos;Arquivos'].concat(
    [...tableUse.entries()].sort().map(([t, fs]) => [t, fs.length, fs.join(' | ')].map(csvEsc).join(';'))
  ).join('\n') + '\n');
writeFileSync(join(OUT, 'rpcs.csv'),
  '\uFEFF' + ['RPC;Qtde arquivos;Arquivos'].concat(
    [...rpcUse.entries()].sort().map(([r, fs]) => [r, fs.length, fs.join(' | ')].map(csvEsc).join(';'))
  ).join('\n') + '\n');

// ── hotfixes ────────────────────────────────────────────────────────────────
const hotfixFiles = jsFiles.map(rel).filter((f) => HOTFIX_RE.test(basename(f)));
writeFileSync(join(OUT, 'hotfixes.csv'),
  '\uFEFF' + ['Arquivo;Linhas;Módulo alvo (sugestão)'].concat(
    hotfixFiles.sort().map((f) => {
      const alvo = basename(f).replace(HOTFIX_RE, '').replace(/\.js$/, '').replace(/-$/, '');
      return [f, jsMeta.get(f)?.lines ?? '', `assets/js/${alvo}.js`].map(csvEsc).join(';');
    })
  ).join('\n') + '\n');

// ── resumo no console ───────────────────────────────────────────────────────
console.log(`Páginas HTML: ${htmlPages.length}`);
console.log(`Arquivos JS (assets/js): ${jsFiles.length}`);
console.log(`Arquivos CSS: ${cssFiles.length}`);
console.log(`Migrations: ${migrations.length}`);
console.log(`Edge Functions: ${edgeFunctions.length} → ${edgeFunctions.join(', ')}`);
console.log(`Hotfixes detectados: ${hotfixFiles.length}`);
console.log(`Tabelas Supabase referenciadas: ${tableUse.size}`);
console.log(`RPCs referenciadas: ${rpcUse.size}`);
console.log(`Saída em docs/inventario/`);
