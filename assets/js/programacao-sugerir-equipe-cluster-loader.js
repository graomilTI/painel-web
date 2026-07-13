// Sugestão integrada de equipe e frota com agrupamento por proximidade.
const PARTS = 3;

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function loadClusterSuggestion() {
  if (!('DecompressionStream' in window)) {
    throw new Error('Navegador sem suporte à descompactação da sugestão agrupada.');
  }

  const urls = Array.from({ length: PARTS }, (_, index) =>
    new URL(`./runtime/programacao-sugerir-cluster-v2.payload-${index + 1}.txt`, import.meta.url));
  const responses = await Promise.all(urls.map(url => fetch(url, { cache: 'no-store' })));
  const failed = responses.find(response => !response.ok);
  if (failed) throw new Error(`Falha ao carregar sugestão agrupada (HTTP ${failed.status}).`);

  const payload = (await Promise.all(responses.map(response => response.text()))).join('').replace(/\s+/g, '');
  const stream = new Blob([decodeBase64(payload)]).stream().pipeThrough(new DecompressionStream('gzip'));
  const source = await new Response(stream).text();
  const blobUrl = URL.createObjectURL(new Blob([
    `${source}\n//# sourceURL=programacao-sugerir-equipe-cluster.runtime.js`,
  ], { type: 'text/javascript' }));

  try {
    await import(blobUrl);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

loadClusterSuggestion().catch(error => {
  console.error('[programacao-sugerir-cluster] falha ao iniciar', error);
  const target = document.getElementById('pmgMsg');
  if (target) target.textContent = 'Falha ao carregar sugestão agrupada de frota';
});
