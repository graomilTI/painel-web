// Fluxo consolidado de equipe + frota do mapa da Programação.
// O módulo principal é distribuído em partes compactadas para reduzir o bootstrap.
const PARTS = 5;

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function loadModule() {
  if (!('DecompressionStream' in window)) {
    throw new Error('Navegador sem suporte à descompactação do módulo.');
  }
  const urls = Array.from({ length: PARTS }, (_, index) =>
    new URL(`./runtime/programacao-frota-v4.payload-${index + 1}.txt`, import.meta.url));
  const responses = await Promise.all(urls.map(url => fetch(url, { cache: 'no-store' })));
  const failed = responses.find(response => !response.ok);
  if (failed) throw new Error(`Falha ao carregar o fluxo de frota (HTTP ${failed.status}).`);
  const payload = (await Promise.all(responses.map(response => response.text()))).join('').replace(/\s+/g, '');
  const stream = new Blob([decodeBase64(payload)]).stream().pipeThrough(new DecompressionStream('gzip'));
  const source = await new Response(stream).text();
  const blobUrl = URL.createObjectURL(new Blob([
    `${source}\n//# sourceURL=programacao-gestor-hotfix-manual-v4.runtime.js`,
  ], { type: 'text/javascript' }));
  try {
    await import(blobUrl);
    await import('./programacao-mapa-ux-fast.js?v=20260713-transition3');
    await import('./programacao-frota-os-auto-colaborador.js?v=20260713-osautocolab1');
    await import('./programacao-sugerir-equipe.js?v=20260713-sugerir1');
    await import('./programacao-limpar-conciliacoes.js?v=20260713-limpar1');
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

loadModule().catch(error => {
  console.error('[programacao-frota-v4] falha ao iniciar', error);
  const target = document.getElementById('pmgMsg');
  if (target) target.textContent = 'Falha ao carregar fluxo de frota';
});
