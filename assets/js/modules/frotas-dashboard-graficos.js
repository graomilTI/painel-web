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

// Barras + linha no mesmo gráfico, cada série na sua escala (multas e excessos têm ordens de grandeza diferentes).
// itens: [{ rotulo, barra, linha, dica }]. A linha é um SVG esticado (traço sem distorção) e os pontos são HTML, para o texto não deformar.
export function barrasLinha(itens, { tomBarra = 'azul', tomLinha = 'ambar' } = {}) {
  if (!itens.length) return '';
  const maxB = Math.max(1, ...itens.map((i) => i.barra || 0));
  const maxL = Math.max(1, ...itens.map((i) => i.linha || 0));
  const n = itens.length;
  const x = (idx) => ((idx + 0.5) / n) * 100;
  const y = (v) => 100 - (v / maxL) * 82; // folga no topo para o número do ponto
  const pontos = itens.map((i, idx) => `${x(idx).toFixed(2)},${y(i.linha || 0).toFixed(2)}`).join(' ');
  const colunas = itens.map((i) => `
    <div class="fd-bl-col" title="${esc(i.dica || i.rotulo)}">
      <span class="fd-bl-barra fd-g-fundo-${esc(tomBarra)}" style="height:${(((i.barra || 0) / maxB) * 78).toFixed(1)}%"><b>${i.barra || ''}</b></span>
    </div>`).join('');
  const marcas = itens.map((i, idx) => `<span class="fd-bl-ponto fd-g-fundo-${esc(tomLinha)}" style="left:${x(idx).toFixed(2)}%;top:${y(i.linha || 0).toFixed(2)}%" title="${esc(i.dica || i.rotulo)}"><em>${i.linha || 0}</em></span>`).join('');
  const rotulos = itens.map((i) => `<span>${esc(i.rotulo)}</span>`).join('');
  return `<div class="fd-bl" role="img" aria-label="Barras e linha por mês">
    <div class="fd-bl-plot">${colunas}
      <svg class="fd-bl-linha fd-g-${esc(tomLinha)}" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pontos}" fill="none" vector-effect="non-scaling-stroke"></polyline></svg>
      ${marcas}
    </div>
    <div class="fd-bl-eixo">${rotulos}</div>
  </div>`;
}

// Barra única dividida em partes proporcionais (100%). segmentos: [{ rotulo, valor, tom }]; a legenda vem junto.
export function pilha(segmentos) {
  const total = segmentos.reduce((s, x) => s + Math.max(0, x.valor || 0), 0);
  const partes = total ? segmentos.filter((x) => x.valor > 0).map((x) => `<span class="fd-g-fundo-${esc(x.tom)}" style="flex:${x.valor}" title="${esc(x.rotulo)}: ${x.valor}"></span>`).join('') : '';
  const legenda = segmentos.map((x) => `<li><i class="fd-g-fundo-${esc(x.tom)}"></i>${esc(x.rotulo)} <b>${x.valor}</b>${total ? ` <small>${Math.round((x.valor / total) * 100)}%</small>` : ''}</li>`).join('');
  return `<div class="fd-pilha"><div class="fd-pilha-barra">${partes}</div><ul class="fd-pilha-leg">${legenda}</ul></div>`;
}

// Medidor em meia-lua: percentual de 0 a 100 (acima ou abaixo é cortado), com texto no centro.
export function medidor(pct, { tom = 'verde', rotulo = '' } = {}) {
  const p = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  const comp = Math.PI * 50;
  return `<svg class="fd-medidor fd-g-${esc(tom)}" viewBox="0 0 120 74" role="img" aria-label="${esc(rotulo)} ${Math.round(p)}%">
    <path class="fd-g-trilho" d="M10 62 A50 50 0 0 1 110 62" fill="none" stroke-width="12" stroke-linecap="round"></path>
    <path class="fd-g-seg" d="M10 62 A50 50 0 0 1 110 62" fill="none" stroke-width="12" stroke-linecap="round" stroke-dasharray="${((p / 100) * comp).toFixed(2)} ${comp.toFixed(2)}"></path>
    <text class="fd-g-centro" x="60" y="56" text-anchor="middle">${Math.round(p)}%</text>
    <text class="fd-g-centro-s" x="60" y="72" text-anchor="middle">${esc(rotulo)}</text>
  </svg>`;
}
