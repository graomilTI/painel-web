// Frotas › Dashboard: gráficos (funções puras: dados entram, string sai). Sem biblioteca: cores e fontes vêm do CSS
// (classes fd-g-*), então o tema fica todo em assets/css/frotas-dashboard.css. Todo rótulo passa por esc().

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Rosca: segmentos [{ rotulo, valor, tom }], com o total no centro. Sem nenhum valor desenha só o anel vazio.
export function rosca(segmentos, { centro = '', legendaCentro = '', tamanho = 168, espessura = 22 } = {}) {
  const r = (tamanho - espessura) / 2;
  const c = tamanho / 2;
  const perimetro = 2 * Math.PI * r;
  const total = segmentos.reduce((s, x) => s + Math.max(0, x.valor || 0), 0);
  let acumulado = 0;
  const arcos = total
    ? segmentos.filter((x) => x.valor > 0).map((x) => {
      const parte = (x.valor / total) * perimetro;
      const arco = `<circle class="fd-g-seg fd-g-${esc(x.tom)}" cx="${c}" cy="${c}" r="${r}" stroke-dasharray="${parte.toFixed(2)} ${(perimetro - parte).toFixed(2)}" stroke-dashoffset="${(-acumulado).toFixed(2)}"><title>${esc(x.rotulo)}: ${x.valor}</title></circle>`;
      acumulado += parte;
      return arco;
    }).join('')
    : '';
  return `<svg class="fd-rosca" viewBox="0 0 ${tamanho} ${tamanho}" role="img" aria-label="${esc(legendaCentro || 'Composição')}: ${esc(centro)}">
    <circle class="fd-g-trilho" cx="${c}" cy="${c}" r="${r}" stroke-width="${espessura}"></circle>
    <g transform="rotate(-90 ${c} ${c})" stroke-width="${espessura}" fill="none">${arcos}</g>
    <text class="fd-g-centro" x="${c}" y="${c + 4}" text-anchor="middle">${esc(centro)}</text>
    <text class="fd-g-centro-s" x="${c}" y="${c + 22}" text-anchor="middle">${esc(legendaCentro)}</text>
  </svg>`;
}

// Barras verticais, empilháveis, em HTML/CSS (o texto não distorce ao redimensionar). itens: [{ rotulo, valores: [n, n…], dica }];
// tons: cor de cada camada. destacarUltimo realça o período corrente; formatar() só afeta o número em cima da barra.
export function barras(itens, { tons = ['verde'], formatar = (n) => String(n), destacarUltimo = false } = {}) {
  if (!itens.length) return '';
  const totais = itens.map((i) => i.valores.reduce((s, n) => s + (n || 0), 0));
  const maior = Math.max(...totais, 0);
  const colunas = itens.map((item, idx) => {
    const total = totais[idx];
    const camadas = item.valores.map((v, k) => (v > 0 && total
      ? `<span class="fd-g-camada fd-g-${esc(tons[k] || tons[0])}" style="height:${((v / total) * 100).toFixed(1)}%"></span>` : '')).join('');
    return `<div class="fd-barra${destacarUltimo && idx !== itens.length - 1 ? ' fd-g-fraca' : ''}" title="${esc(item.dica || item.rotulo)}">
      <span class="fd-barra-area">
        <span class="fd-barra-v">${total ? esc(formatar(total)) : ''}</span>
        <span class="fd-barra-col" style="height:${maior ? ((total / maior) * 80).toFixed(1) : 0}%">${camadas}</span>
      </span>
      <span class="fd-barra-r">${esc(item.rotulo)}</span></div>`;
  }).join('');
  return `<div class="fd-barras" role="img" aria-label="Gráfico de barras">${colunas}</div>`;
}
