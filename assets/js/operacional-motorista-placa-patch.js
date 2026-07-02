// Patch carregado antes do motor inteligente do Mapa Operacional.
// Regras:
// 1) Motorista de frota deve aparecer como "MOTORISTA - PLACA".
// 2) Só considera motorista quem está com veículo ativo e leitura de patrimônio recente.

(function () {
  'use strict';

  if (window.__MO_MOTORISTA_PLACA_PATCH__) return;
  window.__MO_MOTORISTA_PLACA_PATCH__ = true;

  const originalFetch = window.fetch.bind(window);

  function replaceOrKeep(source, search, replacement, label) {
    if (!source.includes(search)) {
      console.warn(`[motorista-placa-patch] trecho não encontrado: ${label}`);
      return source;
    }
    return source.replace(search, replacement);
  }

  function patchOperacionalSource(source) {
    let out = source;

    out = replaceOrKeep(
      out,
      "  async function loadFrotaAtual() {\n    const [veiculos, posicoes] = await Promise.all([",
      `  function veiculoAtivoMapa(v) {
    const bruto = v?.status ?? v?.situacao ?? v?.ativo;
    if (typeof bruto === 'boolean') return bruto;
    if (typeof bruto === 'number') return bruto === 1;
    const s = norm(bruto);
    if (!s) return true;
    if (['INATIVO', 'INATIVA', 'DESATIVADO', 'DESATIVADA', 'REMOVIDO', 'REMOVIDA', 'BAIXADO', 'BAIXADA', 'VENDIDO', 'VENDIDA', 'BLOQUEADO', 'BLOQUEADA'].some(x => s.includes(x))) return false;
    return ['ATIVO', 'ATIVA', 'ACTIVE', 'DISPONIVEL', 'DISPONIVEL OPERACAO', 'EM USO', 'OPERANDO'].some(x => s.includes(x));
  }

  async function loadFrotaAtual() {
    const [veiculos, posicoes] = await Promise.all([`,
      'helper veículo ativo'
    );

    out = replaceOrKeep(
      out,
      "      const match = posKeys(p).map(k => veiculoPorChave.get(k)).find(Boolean) || {};\n      const placa = match.placa || match.placa_normalizada || match.bfleet_placa || match.bfleet_patente || p.placa || '';",
      "      const match = posKeys(p).map(k => veiculoPorChave.get(k)).find(Boolean) || {};\n      if (match.id && !veiculoAtivoMapa(match)) return;\n      const placa = match.placa || match.placa_normalizada || match.bfleet_placa || match.bfleet_patente || p.placa || '';",
      'veículos ativos no mapa'
    );

    out = replaceOrKeep(
      out,
      "    veiculos.forEach(v => {\n      const nome = v?.patrimonio_funcionario;",
      "    veiculos.filter(veiculoAtivoMapa).forEach(v => {\n      const nome = v?.patrimonio_funcionario;",
      'motoristas somente veículos ativos'
    );

    out = replaceOrKeep(
      out,
      "    if (st.nomesFrotaSet.has(norm(c.nome))) return { modo: 'frota', label: 'Motorista/frota (leitura de patrimônio recente)', custoFn: combustivelIdaVolta };",
      `    if (st.nomesFrotaSet.has(norm(c.nome))) {
      const placa = placaNorm(st.placaPorNome?.get(norm(c.nome)) || st.posicaoPorNome?.get(norm(c.nome))?.placa || '');
      return { modo: 'frota', label: \`MOTORISTA - \${placa || 'PLACA NÃO LOCALIZADA'}\`, custoFn: combustivelIdaVolta, placaMotorista: placa || '' };
    }`,
      'descrição MOTORISTA - PLACA'
    );

    return out;
  }

  window.fetch = async function patchedFetch(input, init) {
    const url = typeof input === 'string' ? input : input?.url;
    const isOperacionalJs = /\/assets\/js\/operacional\.js(?:\?|$)/.test(String(url || '')) || /(?:^|\/)operacional\.js(?:\?|$)/.test(String(url || ''));

    const response = await originalFetch(input, init);
    if (!isOperacionalJs || !response?.ok) return response;

    try {
      const text = await response.clone().text();
      const patched = patchOperacionalSource(text);
      const headers = new Headers(response.headers);
      headers.set('Content-Type', 'text/javascript; charset=utf-8');
      return new Response(patched, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      console.warn('[motorista-placa-patch] falha ao aplicar patch:', error);
      return response;
    }
  };
})();
