// Migra objetos do Storage: painel (EUA) -> painel-web (BR)
// Uso: SRC_KEY=<sb_secret origem> DST_KEY=<sb_secret destino> node migrar-storage.mjs
import { createClient } from '@supabase/supabase-js';

const SRC_URL = 'https://xyzpnuumdqhegxakkyws.supabase.co';
const DST_URL = 'https://jbzmcyycanrlnfhedcup.supabase.co';
const SRC_KEY = process.env.SRC_KEY;
const DST_KEY = process.env.DST_KEY;
if (!SRC_KEY || !DST_KEY) { console.error('Defina SRC_KEY e DST_KEY no ambiente.'); process.exit(1); }

const src = createClient(SRC_URL, SRC_KEY);
const dst = createClient(DST_URL, DST_KEY);

const BUCKETS = ['comunicacao-midias','contato-cliente-anexos','email-anexos','notas-fiscais','propostas-pdf','relatorios-uploads'];

async function listAll(bucket, prefix = '') {
  const out = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await src.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    if (!data?.length) break;
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) {
        // pasta: desce recursivamente
        out.push(...await listAll(bucket, path));
      } else {
        out.push(path);
      }
    }
    if (data.length < 1000) break;
    offset += 1000;
  }
  return out;
}

let total = 0, ok = 0, falhas = [];
for (const bucket of BUCKETS) {
  const paths = await listAll(bucket);
  console.log(`[${bucket}] ${paths.length} objetos`);
  total += paths.length;
  for (const path of paths) {
    try {
      const { data: blob, error: e1 } = await src.storage.from(bucket).download(path);
      if (e1) throw new Error(`download: ${e1.message}`);
      const buf = Buffer.from(await blob.arrayBuffer());
      const { error: e2 } = await dst.storage.from(bucket).upload(path, buf, {
        contentType: blob.type || 'application/octet-stream',
        upsert: true,
      });
      if (e2) throw new Error(`upload: ${e2.message}`);
      ok++;
      if (ok % 25 === 0) console.log(`  ...${ok}/${total}`);
    } catch (err) {
      falhas.push(`${bucket}/${path}: ${err.message}`);
      console.error(`  FALHA ${bucket}/${path}: ${err.message}`);
    }
  }
}
console.log(`\nConcluído: ${ok}/${total} objetos copiados.`);
if (falhas.length) { console.log('Falhas:'); falhas.forEach(f => console.log(' - ' + f)); process.exit(1); }
