import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// O navegador identifica um módulo pela URL COMPLETA, com o ?v=. Se dois importadores do mesmo módulo
// usarem ?v= diferentes, ele é carregado em DUAS cópias (estado duplicado, versões misturadas), e o service
// worker (stale-while-revalidate) ainda pode servir uma delas do cache. Os módulos programacao-*.js
// foram divididos em 14/10 e 15/10/2026; este teste exige que cada um tenha um único ?v= entre os
// importadores da própria família (programacao*.js). Importadores de fora (logistica.js, adm-conferencia...)
// carregam outros conjuntos de módulos e não entram aqui.

const dir = new URL('../assets/js/', import.meta.url);
const arquivos = readdirSync(dir).filter((f) => /^programacao.*\.js$/.test(f));

function importadoresDaFamilia() {
  const porAlvo = new Map();
  for (const arq of arquivos) {
    const src = readFileSync(new URL(arq, dir), 'utf8');
    for (const m of src.matchAll(/(?:from\s+|^import\s+)'\.\/(programacao[a-z-]*)\.js(\?v=[^']+)?'/gm)) {
      const alvo = m[1];
      if (`${alvo}.js` === arq) continue;
      const tokens = porAlvo.get(alvo) || porAlvo.set(alvo, new Map()).get(alvo);
      const token = m[2] || '(sem ?v)';
      tokens.set(token, [...(tokens.get(token) || []), arq]);
    }
  }
  return porAlvo;
}

test('cada módulo programacao-* é importado com o mesmo ?v= por todos os importadores da família', () => {
  const porAlvo = importadoresDaFamilia();
  assert.ok(porAlvo.size >= 25, `esperava ao menos 25 módulos importados, achei ${porAlvo.size}`);
  const mistos = [...porAlvo].filter(([, tokens]) => tokens.size > 1)
    .map(([alvo, tokens]) => `${alvo}: ${[...tokens].map(([t, a]) => `${t} (${a.join(', ')})`).join('  vs  ')}`);
  assert.deepEqual(mistos, [], `?v= diferente entre importadores:\n  ${mistos.join('\n  ')}`);
});

test('os pontos de carga do programacao.js usam o mesmo ?v= (roteador e página)', () => {
  const router = readFileSync(new URL('router.js', dir), 'utf8').match(/programacao\.js\?v=([^'")]+)/)?.[1];
  const pagina = readFileSync(new URL('../programacao.html', import.meta.url), 'utf8').match(/programacao\.js\?v=([^"]+)"/)?.[1];
  assert.ok(router && pagina, 'não achei o ?v= do programacao.js no roteador/página');
  assert.equal(router, pagina, `roteador usa ${router}, página usa ${pagina}`);
});

test('os módulos de apoio extraídos exportam o que programacao.js importa deles', () => {
  const principal = readFileSync(new URL('programacao.js', dir), 'utf8');
  for (const m of principal.matchAll(/import \{([^}]+)\} from '\.\/(programacao-(?:constantes|util|disponibilidade|acesso|dados-base|estilos))\.js\?v=[^']+';/g)) {
    const alvo = readFileSync(new URL(`${m[2]}.js`, dir), 'utf8');
    const exportados = new Set([...alvo.matchAll(/export \{([^}]+)\}/g)].flatMap((e) => e[1].split(',').map((x) => x.trim())).concat([...alvo.matchAll(/export (?:const|function|async function) (\w+)/g)].map((e) => e[1])));
    for (const nome of m[1].split(',').map((x) => x.trim()).filter(Boolean)) {
      assert.ok(exportados.has(nome), `${m[2]} deveria exportar ${nome}`);
    }
  }
});
