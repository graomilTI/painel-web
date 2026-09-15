import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const patch = readFileSync(new URL('../assets/js/programacao-equipe-os-atual-fix.js', import.meta.url), 'utf8');
const drawer = readFileSync(new URL('../assets/js/programacao-lista-drawer.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../programacao.html', import.meta.url), 'utf8');

test('escolherProgramacao volta a cair pra mais recente até a data quando não há confirmação exata de hoje', () => {
  // Regressão: entre 14/09 e 15/09 esta função só aceitava a data aberta
  // exata e devolvia null sem isso — "reconfirmação diária obrigatória".
  // Essa regra é o motivo do relato "colaborador não tá salvando" (Jean
  // Carlos, O.S. 92611/92659; Kawan Egon, O.S. 92489, 15/09/2026): revertida
  // a pedido do usuário depois de confirmar que loadEquipeReaproveitada()
  // (programacao-despesas.js) já cobre o caso corretamente gravando uma
  // confirmação de hoje de verdade.
  assert.match(patch, /const exata = ordenadas\.find\(\(p\) => String\(p\.data_referencia\)\.slice\(0, 10\) === dataReferencia\);/);
  assert.match(patch, /if \(exata\) return exata;/);
  assert.match(
    patch,
    /return ordenadas\.find\(\(p\) => String\(p\.data_referencia\)\.slice\(0, 10\) <= dataReferencia\) \|\| null;/,
  );
  assert.doesNotMatch(
    patch,
    /return ordenadas\.find\(\(p\) => String\(p\.data_referencia\)\.slice\(0, 10\) === dataReferencia\) \|\| null;\s*\n\}/,
  );
});

test('programacao-lista-drawer.js continua roteado pelo patch de programacao-equipe.js via import-map', () => {
  // O import precisa usar exatamente a mesma query string que a chave do
  // import-map em programacao.html, senão o navegador carrega
  // programacao-equipe.js direto (sem o patch de loadEquipeDaOsPorId) e a
  // gaveta volta a trazer o histórico inteiro da O.S. — achado nesta mesma
  // sessão ao mudar essa string sem querer.
  const chaveImportMap = html.match(/"\.\/assets\/js\/(programacao-equipe\.js\?v=[^"]+)":/)?.[1];
  assert.ok(chaveImportMap, 'import-map de programacao.html deveria mapear programacao-equipe.js');
  assert.match(drawer, new RegExp(`\\} from '\\./${chaveImportMap.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}';`));
});
