// Lint mínimo, focado em BUG (não em estilo). Regras que já passam limpas são
// "error" e travam o CI; o resto começa como "warn" e vai subindo conforme
// o código for limpo. Rodar: `npm run lint`.
import js from '@eslint/js';
import globals from 'globals';

const regrasDeBug = {
  'no-dupe-keys': 'error',
  'no-dupe-args': 'error',
  'no-duplicate-case': 'error',
  'no-unreachable': 'warn', // há blocos desativados de propósito com return antes
  'no-unsafe-finally': 'warn',
  'no-unsafe-negation': 'error',
  'no-self-assign': 'error',
  'no-compare-neg-zero': 'error',
  'no-cond-assign': ['error', 'except-parens'],
  'no-const-assign': 'error',
  'no-dupe-else-if': 'error',
  'no-import-assign': 'error',
  'no-invalid-regexp': 'error',
  'use-isnan': 'error',
  'valid-typeof': 'error',
  'getter-return': 'error',
  'no-func-assign': 'warn',
  'no-class-assign': 'error',
  'no-undef': 'error',
  // catch vazio esconde erro de produção; começa como aviso (havia ~150).
  'no-empty': ['warn', { allowEmptyCatch: false }],
};

export default [
  {
    ignores: [
      '**/node_modules/**', '.claude/**', 'saidas/**', '.tmp_sql/**', 'server/**', 'server-patches/**',
      '**/*.bundle.cjs', 'agentes-grm-sync/exploracao-distribuicao-os/**', 'supabase/**', 'types/**',
    ],
  },
  {
    files: ['assets/js/**/*.js', 'sw.js', 'service-worker.js', 'script.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.browser, ...globals.serviceworker,
        // Bibliotecas carregadas por <script> de CDN nas páginas.
        XLSX: 'readonly', Chart: 'readonly', jspdf: 'readonly', jsPDF: 'readonly', html2canvas: 'readonly',
        Tesseract: 'readonly', PDFLib: 'readonly', JSZip: 'readonly', L: 'readonly', supabase: 'readonly',
      },
    },
    rules: regrasDeBug,
  },
  {
    files: ['agentes-grm-sync/**/*.js', 'scripts/**/*.js'],
    // globals de navegador: código dentro de page.evaluate() do Puppeteer roda no browser.
    languageOptions: { ecmaVersion: 2024, sourceType: 'commonjs', globals: { ...globals.node, ...globals.browser } },
    rules: regrasDeBug,
  },
  {
    files: ['email-worker/**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.node } },
    rules: regrasDeBug,
  },
  {
    files: ['**/*.mjs'],
    // testes simulam o browser via globalThis.window
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.node, window: 'readonly' } },
    rules: regrasDeBug,
  },
];
