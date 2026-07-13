// Substitui a ação SUGERIR por uma organização integrada de equipe e frota.
// O código principal fica compactado para manter o bootstrap da Programação leve.
const PARTS = 2;

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function loadProximitySuggestion() {
  if (!('DecompressionStream' in window)) {
    throw new Error('Navegador sem suporte à descompactação da sugestão por proximidade.');
  }

  const urls = Array.from({ length: PARTS }, (_, index) =>
    new URL(`./runtime/programacao-sugerir-proximidade.payload-${index + 1}.txt`, import.meta.url));
  const responses = await Promise.all(urls.map(url => fetch(url, { cache: 'no-store' })));
  const failed = responses.find(response => !response.ok);
  if (failed) throw new Error(`Falha ao carregar sugestão por proximidade (HTTP ${failed.status}).`);

  const payload = (await Promise.all(responses.map(response => response.text()))).join('').replace(/\s+/g, '');
  const stream = new Blob([decodeBase64(payload)]).stream().pipeThrough(new DecompressionStream('gzip'));
  const source = await new Response(stream).text();
  const blobUrl = URL.createObjectURL(new Blob([
    `${source}\n//# sourceURL=programacao-sugerir-equipe-proximidade.runtime.js`,
  ], { type: 'text/javascript' }));

  try {
    await import(blobUrl);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

loadProximitySuggestion().catch(error => {
  console.error('[programacao-sugerir-proximidade] falha ao iniciar', error);
  const target = document.getElementById('pmgMsg');
  if (target) target.textContent = 'Falha ao carregar sugestão por proximidade';
});
