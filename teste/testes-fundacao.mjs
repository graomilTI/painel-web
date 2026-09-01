// teste/testes-fundacao.mjs
// Testes automatizados leves dos fluxos críticos (plano, seção 13).
// Rodar com: node teste/testes-fundacao.mjs
// Sem dependências externas: valida regras de negócio puras dos módulos e a
// integridade estrutural do projeto (rotas, menu, arquivos referenciados).

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
let total = 0;
let falhas = 0;

function teste(nome, fn) {
  total += 1;
  try {
    fn();
    console.log(`  ok    ${nome}`);
  } catch (err) {
    falhas += 1;
    console.error(`  FALHA ${nome}: ${err.message}`);
  }
}

function igual(recebido, esperado, msg = '') {
  const a = JSON.stringify(recebido);
  const b = JSON.stringify(esperado);
  if (a !== b) throw new Error(`${msg} esperado=${b} recebido=${a}`);
}

function verdadeiro(cond, msg = 'condição falsa') {
  if (!cond) throw new Error(msg);
}

// ── 1. Regras de negócio de Notas Fiscais (6.3/6.4/6.5) ─────────────────────
// O service importa o supabaseClient (CDN https), que o Node não resolve.
// Para testar as regras puras fora do navegador, o teste carrega o fonte e o
// reexporta sem os imports de infraestrutura, mantendo o código idêntico.
console.log('\nNotas Fiscais — regras puras');
async function importarServicoIsolado() {
  const fonte = readFileSync(join(raiz, 'assets/js/modules/notas-fiscais/service.js'), 'utf8');
  const semImports = fonte.replace(/^import[\s\S]*?from\s+'[^']+';\s*$/gm, '');
  const stubs = `
    const listarItensComNf = async () => [];
    const listarPagamentosPorItens = async () => ({});
    const marcarItensLancados = async () => {};
    const estornarItens = async () => {};
    const salvarDadosNfNoPagamento = async () => {};
    const registrarAuditoria = async () => {};
    const { validarParaLancamento } = await import('file://${join(raiz, 'assets/js/modules/notas-fiscais/validators.js').replace(/\\/g, '/')}');
  `;
  const dataUrl = 'data:text/javascript;base64,' + Buffer.from(stubs + semImports).toString('base64');
  return import(dataUrl);
}
const nfService = await importarServicoIsolado().catch((e) => { console.error('  aviso:', e.message); return null; });

if (nfService) {
  teste('sugerirCategoria identifica EPI', () => {
    igual(nfService.sugerirCategoria({ itens: [{ material: 'Bota de segurança bidensidade' }] }), 'EPI');
  });
  teste('sugerirCategoria identifica Informática', () => {
    igual(nfService.sugerirCategoria({ itens: [{ material: 'Mouse sem fio' }] }), 'Informática');
  });
  teste('sugerirCategoria cai em Geral sem correspondência', () => {
    igual(nfService.sugerirCategoria({ itens: [{ material: 'Item aleatório xyz' }] }), 'Geral');
  });
  teste('pendenciasDoGrupo aponta grupo incompleto', () => {
    const p = nfService.pendenciasDoGrupo({ numero: null, cnpj: '-', fornecedor: '-', comprovante_url: null, valor_total: 0 });
    verdadeiro(p.length === 5, `esperava 5 pendências, veio ${p.length}`);
  });
  teste('pendenciasDoGrupo vazio para grupo completo', () => {
    const p = nfService.pendenciasDoGrupo({ numero: '123', cnpj: '00.000.000/0001-00', fornecedor: 'ACME', comprovante_url: 'https://x/c.pdf', valor_total: 10 });
    igual(p, []);
  });
  teste('agruparPorNf agrupa por nf_url, soma valores e marca pendências', () => {
    const grupos = nfService.agruparPorNf([
      { id: 1, nf_url: 'u1', valor_total: 10, nf_lancado: false, material: 'bota', compras_solicitacoes: { solicitante: 'Ana', coordenacao: 'Sul' } },
      { id: 2, nf_url: 'u1', valor_total: 5, nf_lancado: false, material: 'luva', compras_solicitacoes: { solicitante: 'Ana', coordenacao: 'Sul' } },
      { id: 3, nf_url: 'u2', valor_total: 7, nf_lancado: true, nf_lancado_em: '2026-07-01', material: 'papel', compras_solicitacoes: {} },
    ], {});
    verdadeiro(grupos.length === 2, 'esperava 2 grupos');
    const g1 = grupos.find((g) => g.key === 'u1');
    igual(g1.valor_total, 15, 'soma do grupo');
    igual(g1.categoria, 'EPI', 'categoria do grupo');
    verdadeiro(g1.pendencias.length > 0, 'grupo pendente deve ter pendências');
  });
  teste('resumo separa pendentes e lançados', () => {
    const r = nfService.resumo([
      { nf_lancado: false, valor_total: 10 },
      { nf_lancado: true, valor_total: 7 },
    ]);
    igual(r.pendentes, 1); igual(r.lancados, 1);
    igual(r.totalPendente, 10); igual(r.totalLancado, 7);
  });
} else {
  teste('módulo notas-fiscais/service.js importável', () => {
    throw new Error('não foi possível importar o service (verifique dependências de browser no topo do arquivo)');
  });
}

// ── 2. Validadores de lançamento (6.4/6.6) ───────────────────────────────────
console.log('\nNotas Fiscais — validadores');
const validadores = await import(`file://${join(raiz, 'assets/js/modules/notas-fiscais/validators.js')}`)
  .catch(() => null);
if (validadores?.validarParaLancamento) {
  teste('validarParaLancamento reprova sem valor', () => {
    const r = validadores.validarParaLancamento({ numero_nf: '1', valor: 0, data_emissao: '2026-01-01', categoria: 'x', origem_id: 1 }, { exigirOrigem: true });
    verdadeiro(!r.valido, 'deveria ser inválido');
  });
  teste('validarParaLancamento aprova payload completo', () => {
    const r = validadores.validarParaLancamento({ numero_nf: '1', valor: 10, data_emissao: '2026-01-01', categoria: 'x', origem_id: 1 }, { exigirOrigem: true });
    verdadeiro(r.valido, `pendências: ${JSON.stringify(r.pendencias)}`);
  });
}

// ── 3. Comparação anterior × novo da auditoria (12.5) ───────────────────────
console.log('\nAuditoria — diff anterior × novo');
async function importarRelatoriosIsolado() {
  const fonte = readFileSync(join(raiz, 'assets/js/services/relatoriosService.js'), 'utf8');
  const semImports = fonte.replace(/^import[\s\S]*?from\s+'[^']+';\s*$/gm, '');
  const stubs = 'const listar=async()=>({rows:[],total:0});const inserir=async()=>[];const atualizar=async()=>[];const excluir=async()=>{};const registrarAuditoria=async()=>{};';
  const dataUrl = 'data:text/javascript;base64,' + Buffer.from(stubs + semImports).toString('base64');
  return import(dataUrl);
}
const rel = await importarRelatoriosIsolado().catch((e) => { console.error('  aviso:', e.message); return null; });
if (rel?.compararValores) {
  teste('compararValores marca campo alterado', () => {
    const diff = rel.compararValores({ status: 'pendente' }, { status: 'lancado' });
    const c = diff.find((d) => d.campo === 'status');
    verdadeiro(c && c.alterado, 'status deveria constar como alterado');
  });
  teste('compararValores lida com valores nulos', () => {
    const diff = rel.compararValores(null, { a: 1 });
    verdadeiro(Array.isArray(diff) && diff.length === 1, 'deveria listar 1 campo');
  });
}

// ── 4. Integridade estrutural: rotas × arquivos × menu ──────────────────────
console.log('\nEstrutura — rotas, menu e arquivos');
const routerSrc = readFileSync(join(raiz, 'assets/js/router.js'), 'utf8');
const menuSrc = readFileSync(join(raiz, 'assets/js/menuConfig.js'), 'utf8');

teste('todas as importações do router apontam para arquivos existentes', () => {
  const imports = [...routerSrc.matchAll(/import\('\.\/([^']+?)(?:\?[^']*)?'\)/g)].map((m) => m[1]);
  const faltando = imports.filter((rel) => !existsSync(join(raiz, 'assets/js', rel)));
  igual(faltando, [], 'arquivos ausentes');
});

teste('todo path do menu tem rota no router ou página html', () => {
  const paths = [...menuSrc.matchAll(/item\("[^"]+",\s*"[^"]+",\s*"([^"#?]+)/g)].map((m) => m[1]);
  const faltando = [...new Set(paths)].filter((p) =>
    !routerSrc.includes(`['${p}'`) && !existsSync(join(raiz, `${p}.html`)));
  igual(faltando, [], 'paths sem rota/página');
});

teste('página auditoria-central registrada no router e no menu', () => {
  verdadeiro(routerSrc.includes("'auditoria-central'"), 'rota ausente');
  verdadeiro(menuSrc.includes('auditoria_central'), 'menu ausente');
  verdadeiro(existsSync(join(raiz, 'auditoria-central.html')), 'html ausente');
});

teste('migrations versionadas presentes', () => {
  verdadeiro(existsSync(join(raiz, 'supabase/migrations/20260726120000_fundacao_auditoria.sql')));
  verdadeiro(existsSync(join(raiz, 'supabase/migrations/20260727090000_reestruturacao_completa.sql')));
});

teste('serviços de domínio presentes (2.4)', () => {
  const servicos = ['programacaoService', 'logisticaService', 'logisticaApoioService', 'operacionalService',
    'financeiroService', 'hospedagemService', 'frotasService', 'rhService', 'tiService', 'relatoriosService'];
  const faltando = servicos.filter((s) => !existsSync(join(raiz, `assets/js/services/${s}.js`)));
  igual(faltando, [], 'serviços ausentes');
});

// ── resultado ────────────────────────────────────────────────────────────────
console.log(`\n${total - falhas}/${total} testes passaram.`);
if (falhas > 0) process.exit(1);
