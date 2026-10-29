import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

// anexarArquivoNaNf (Notas Fiscais > ✎ Completar dados > Anexo da NF). O service é carregado numa cópia temporária
// com os imports de rede (Supabase, auditoria, repositório) trocados por simuladores.
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'js', 'modules', 'notas-fiscais');
const temp = path.join(dir, `.tmp-service-${process.pid}.mjs`);
const origem = readFileSync(path.join(dir, 'service.js'), 'utf8')
  .replace(/import \{[^}]*\} from '\.\/repository\.js';/, '')
  .replace(/import \{ registrarAuditoria \} from '[^']+';/, 'const registrarAuditoria = async (a) => { globalThis.__audit.push(a); };')
  .replace(/import \{ validarParaLancamento \} from '[^']+';/, '')
  .replace(/import \{ supabase \} from '[^']+';/, 'const supabase = new Proxy({}, { get: (_, k) => globalThis.__sb[k] });');
writeFileSync(temp, origem);
const { anexarArquivoNaNf } = await import(pathToFileURL(temp).href);
unlinkSync(temp);

function banco() {
  const chamadas = { updates: [], uploads: [] };
  globalThis.__audit = [];
  globalThis.__sb = {
    storage: { from: () => ({
      upload: async (caminho, file) => { chamadas.uploads.push({ caminho, nome: file.name }); return { error: null }; },
      getPublicUrl: (caminho) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/notas-fiscais/${caminho}` } }),
    }) },
    from: (tabela) => ({ update: (patch) => ({ eq: async (col, val) => { chamadas.updates.push({ tabela, patch, col, val }); return { error: null }; } }) }),
  };
  return chamadas;
}
const arquivo = { name: 'NF correta ç.pdf', type: 'application/pdf' };
const urlAntiga = 'https://x.supabase.co/storage/v1/object/public/notas-fiscais/compras/nf/2026/velho.pdf';
const grupo = (extra = {}) => ({
  nf_url: urlAntiga, ids: ['i1', 'i2'], nf_lancado: false, valor_total: 420, grm: { id: 'g1', status: 'AGUARDANDO_DADOS' },
  itens: [{ id: 'i1', nf_anexos: [] }, { id: 'i2', nf_anexos: [] }], ...extra,
});

test('trocar: troca nf_url de todos os itens, cancela a linha antiga e audita', async () => {
  const c = banco();
  const url = await anexarArquivoNaNf(grupo(), arquivo, { modo: 'trocar' });
  assert.match(c.uploads[0].caminho, /^compras\/nf\/\d{4}\/\d+_NF_correta_c\.pdf$/);
  assert.ok(url.endsWith(c.uploads[0].caminho));
  const itens = c.updates.filter((u) => u.tabela === 'compras_itens');
  assert.deepEqual(itens.map((u) => [u.val, u.patch]), [['i1', { nf_url: url }], ['i2', { nf_url: url }]]);
  assert.deepEqual(c.updates.find((u) => u.tabela === 'grm_nf_lancamentos'), { tabela: 'grm_nf_lancamentos', patch: { status: 'CANCELADO' }, col: 'id', val: 'g1' });
  assert.equal(globalThis.__audit[0].acao, 'nf_arquivo_trocado');
});

test('adicionar: acrescenta em nf_anexos sem perder os atuais e sem cancelar nada', async () => {
  const c = banco();
  const g = grupo({ itens: [{ id: 'i1', nf_anexos: [{ url: 'https://x/a.pdf', nome: 'a.pdf' }] }, { id: 'i2', nf_anexos: [] }] });
  const url = await anexarArquivoNaNf(g, arquivo, { modo: 'adicionar' });
  const i1 = c.updates.find((u) => u.val === 'i1').patch.nf_anexos;
  assert.deepEqual(i1, [{ url: 'https://x/a.pdf', nome: 'a.pdf' }, { url, nome: arquivo.name }]);
  assert.deepEqual(c.updates.find((u) => u.val === 'i2').patch.nf_anexos, [{ url, nome: arquivo.name }]);
  assert.ok(!c.updates.some((u) => u.tabela === 'grm_nf_lancamentos'));
});

test('trocar numa linha que é arquivo extra: troca só ele dentro de nf_anexos', async () => {
  const c = banco();
  const extra = 'https://x/extra.pdf';
  const g = grupo({
    nf_url: extra, documento_de: urlAntiga,
    itens: [{ id: 'i1', nf_url: urlAntiga, nf_anexos: [{ url: extra, nome: 'extra.pdf' }, { url: 'https://x/outro.pdf', nome: 'o.pdf' }] }],
  });
  const url = await anexarArquivoNaNf(g, arquivo, { modo: 'trocar' });
  assert.deepEqual(c.updates[0].patch, { nf_anexos: [{ url, nome: arquivo.name }, { url: 'https://x/outro.pdf', nome: 'o.pdf' }] });
  assert.ok(!c.updates.some((u) => u.patch.nf_url), 'a NF principal não muda');
});

test('recusa NF já lançada, arquivo ausente e modo inválido sem subir nada', async () => {
  const c = banco();
  await assert.rejects(() => anexarArquivoNaNf(grupo({ nf_lancado: true }), arquivo), /já foi lançada/);
  await assert.rejects(() => anexarArquivoNaNf(grupo(), null), /Escolha o arquivo/);
  await assert.rejects(() => anexarArquivoNaNf(grupo(), arquivo, { modo: 'apagar' }), /Modo inválido/);
  assert.equal(c.uploads.length, 0);
});
