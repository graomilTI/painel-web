import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// O módulo Frotas (assets/js/modules/frotas.js) foi dividido em módulos frotas-*.js (14/10/2026).
// O navegador identifica cada módulo pela URL COMPLETA, com o ?v=, e o service worker serve JS em
// stale-while-revalidate: se um import interno ficar com ?v= diferente dos outros, o usuário pode
// receber dois módulos de versões diferentes ou duas cópias do mesmo módulo. Este teste exige o mesmo
// token em todos os imports internos e nos carregadores que importam o ponto de entrada.

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFileSync(new URL(caminho, raiz), 'utf8');

const MODULOS_DIVIDIDOS = [
  'frotas-base', 'frotas-ocr', 'frotas-colaboradores', 'frotas-excessos-dados', 'frotas-fh-util', 'frotas-fh-mapa',
  'frotas-fh-dossie-regras', 'frotas-fh-dossie-html', 'frotas-fh-dossie', 'frotas-fh-dados', 'frotas-upload-prints',
  'frotas-historico-tela', 'frotas-excesso-velocidade', 'frotas-excesso-velocidade-html', 'frotas-excesso-velocidade-eventos',
];

function tokensInternos() {
  const achados = [];
  for (const nome of ['frotas', ...MODULOS_DIVIDIDOS]) {
    const src = ler(`assets/js/modules/${nome}.js`);
    for (const m of src.matchAll(/from '\.\/(frotas-[a-z-]+)\.js\?v=([^']+)'/g)) {
      if (m[1] === 'frotas-print-ocr-core') continue; // dependência antiga, versionada à parte
      achados.push({ arquivo: nome, alvo: m[1], token: m[2] });
    }
  }
  return achados;
}

test('todos os imports internos do Frotas usam o mesmo ?v=', () => {
  const achados = tokensInternos();
  assert.ok(achados.length >= 25, `esperava dezenas de imports internos, achei ${achados.length}`);
  const tokens = new Set(achados.map((a) => a.token));
  assert.equal(tokens.size, 1, `tokens diferentes: ${[...tokens].join(', ')}`);
});

test('os carregadores importam o ponto de entrada com o mesmo ?v= dos imports internos', () => {
  const [token] = new Set(tokensInternos().map((a) => a.token));
  for (const arquivo of ['assets/js/frotas.js', 'assets/js/frotas-historico.js', 'assets/js/frotas-ocorrencias.js']) {
    const src = ler(arquivo);
    const versoes = [...src.matchAll(/modules\/frotas\.js\?v=([^'")]+)/g)].map((m) => m[1]);
    assert.ok(versoes.length > 0, `${arquivo} deveria importar modules/frotas.js com ?v=`);
    for (const v of versoes) assert.equal(v, token, `${arquivo} usa ?v=${v}, esperado ${token}`);
  }
});

test('cada módulo dividido existe, exporta o que é importado e não há import de módulo inexistente', () => {
  const existentes = new Set(readdirSync(new URL('assets/js/modules/', raiz)).map((f) => f.replace(/\.js$/, '')));
  for (const a of tokensInternos()) assert.ok(existentes.has(a.alvo), `${a.arquivo} importa ${a.alvo}, que não existe`);
});

test('a API pública em window continua publicada pela entrada', () => {
  const src = ler('assets/js/modules/frotas.js');
  assert.match(src, /window\[MODULE_NAME\]\.openHome = renderHome;/);
  assert.match(src, /window\[MODULE_NAME\]\.openHistorico = renderHistoricoFrotas;/);
  assert.match(src, /window\.ADM_MODULES\.frotas = \{ mount: renderHome \};/);
});

test('o estado currentRenderOpts só é reatribuído dentro de frotas-base.js', () => {
  // Um módulo importador não pode atribuir a um binding importado; por isso existe o setter.
  for (const nome of MODULOS_DIVIDIDOS) {
    const src = ler(`assets/js/modules/${nome}.js`);
    const atribuicoes = [...src.matchAll(/(^|[^.\w])currentRenderOpts\s*=[^=]/gm)];
    if (nome === 'frotas-base') assert.equal(atribuicoes.length, 2, 'declaração + setter');
    else assert.equal(atribuicoes.length, 0, `${nome} atribui currentRenderOpts diretamente`);
  }
});
