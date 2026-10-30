// Financeiro — textos da linha e do modal de pagamento (gestor/coordenação, conteúdo, código PAG-…).
// Extraído de setor-pagamentos.js em 30/10/2026; o código das funções foi movido sem alteração (só saiu de dentro da fábrica).
// Ao editar, troque o token v=20261030-fin17 em TODOS os imports internos (ver tests/financeiro-modulos-versao.test.mjs).
import { esc } from './util.js?v=20261030-fin17';
import { origemPagamentoLabel, ensureHttps } from './pagamentos.js?v=20261030-fin17';

export function getGestorCoordenacao(row) {
  const gestor = row._gestor || row.gestor || row.solicitante || '';
  const coordenacao = row._coordenacao || row.coordenacao || '';
  if (gestor || coordenacao) return { gestor, coordenacao };
  const texto = String(row.descricao || row.conteudo || '');
  const gMatch = texto.match(/gestor:\s*(.+)/i);
  const cMatch = texto.match(/coordena[çc][ãa]o:\s*(.+)/i);
  return { gestor: gMatch ? gMatch[1].trim() : '', coordenacao: cMatch ? cMatch[1].trim() : '' };
}

export function isLinkDados(value) {
  const s = String(value || '').trim();
  return /^https?:\/\//i.test(s) || /^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(s);
}

export function renderConteudoHtml(row) {
  const descricaoBase = row.descricao || row.conteudo || row.observacao || row.detalhes || '';
  const linhas = String(descricaoBase)
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^gestor\s*:/i.test(l))
    .filter((l) => !/^coordena[çc][ãa]o\s*:/i.test(l))
    .filter((l) => !/^forma\s*:/i.test(l))
    .filter((l) => !/^dados\s*:/i.test(l))
    .filter((l) => !/^tipo\s*:/i.test(l));

  const forma = row.forma_pagamento || '';
  const dados = row.dados_pagamento || row.link_pagamento || row.chave_pix || row.boleto_url || '';

  const parts = [];
  if (linhas.length) parts.push(`<div class="spay-items">${linhas.map((l) => esc(l)).join('<br>')}</div>`);
  if (forma) parts.push(`<div class="spay-meta"><span class="spay-meta-label">Forma:</span> ${esc(forma)}</div>`);
  if (dados) {
    // dados pode ser um bloco de várias linhas (link do produto + endereço
    // de entrega, um por linha) — linkifica só o trecho que é URL em cada
    // linha, em vez de tentar tratar o bloco inteiro como um link só.
    // Fica recolhido por padrão (details/summary) pra não estourar a
    // altura da linha da tabela com link grande + endereço.
    const dadosHtml = String(dados)
      .split(/\n+/)
      .map((linha) => {
        const m = linha.match(/https?:\/\/\S+/i);
        if (!m) return esc(linha);
        const url = m[0];
        const antes = linha.slice(0, m.index);
        const depois = linha.slice(m.index + url.length);
        return `${esc(antes)}<a class="spay-link" href="${esc(ensureHttps(url))}" target="_blank" rel="noopener">${esc(url)}</a>${esc(depois)}`;
      })
      .join('<br>');
    parts.push(`<details class="spay-dados-details"><summary>Ver dados${isLinkDados(dados) || /https?:\/\//i.test(dados) ? ' e link' : ''}</summary><div class="spay-meta">${dadosHtml}</div></details>`);
  }
  if (!parts.length) return `<span class="spay-empty">—</span>`;
  return parts.join('');
}

// Código do pagamento (PAG-AAMM-NNN): no registro real vem de `codigo`; nas linhas
// derivadas de compras_itens, `codigo` é o do item — o do pagamento fica em _codigo_pagamento.
export function codigoPagamento(row) {
  return String(row.id || '').startsWith('compra_') ? (row._codigo_pagamento || '') : (row.codigo || '');
}

export function renderConteudoModal(row) {
  const descricaoBase = row.descricao || row.conteudo || row.observacao || row.detalhes || '';
  const linhas = String(descricaoBase).split(/\n+/).map((l) => l.trim()).filter(Boolean)
    .filter((l) => !/^tipo\s*:/i.test(l))
    .filter((l) => !/^forma\s*:/i.test(l))
    .filter((l) => !/^dados\s*:/i.test(l));
  const dados = row.dados_pagamento || row.link_pagamento || row.chave_pix || row.boleto_url || '';
  const forma = row.forma_pagamento || '';
  const fornecedor = row.fornecedor || row.favorecido || row.beneficiario || '';
  const contato = row.contato || row.contato_fornecedor || '';
  const parts = [];
  if (linhas.length) parts.push(linhas.map((l) => esc(l)).join('<br>'));
  if (fornecedor) parts.push(`Fornecedor: ${esc(fornecedor)}`);
  if (contato) parts.push(`Contato: ${esc(contato)}`);
  if (forma) parts.push(`Forma: <strong>${esc(forma)}</strong>`);
  if (dados) {
    // dados pode ter várias linhas (link do produto + "Entrega: ...") —
    // linkifica só o trecho que é URL em cada linha, não o bloco inteiro.
    const dadosDisplay = String(dados)
      .split(/\n+/)
      .map((linha) => {
        const m = linha.match(/https?:\/\/\S+/i);
        if (!m) return `<strong class="fin-quebra">${esc(linha)}</strong>`;
        const url = m[0];
        const antes = linha.slice(0, m.index);
        const depois = linha.slice(m.index + url.length);
        return `${esc(antes)}<a class="fin-link" href="${esc(ensureHttps(url))}" target="_blank" rel="noopener">${esc(url)}</a>${esc(depois)}`;
      })
      .join('<br>');
    parts.push(`Dados: ${dadosDisplay}`);
  }
  // Itens derivados direto de compras_itens (não agrupados num
  // financeiro_pagamentos real) trazem entrega_tipo/entrega_endereco como
  // colunas próprias, não dentro de dados_pagamento — mostra também.
  if (row.entrega_tipo === 'entrega' && row.entrega_endereco) {
    parts.push(`Entrega: <strong>${esc(row.entrega_endereco)}</strong>`);
  } else if (row.entrega_tipo === 'retirada') {
    parts.push(`Retirada`);
  }
  return parts.join('<br>') || `Solicitação de ${esc(origemPagamentoLabel(row.origem || row.setor || row.modulo_origem))}`;
}
