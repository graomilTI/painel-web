// Plantão (Início): desenha a imagem de divulgação num canvas a partir do modelo montado em regras.js (montarModeloImagem).
// Mesma identidade visual da escala do RH (fundo verde-escuro, cartões por setor), em dois formatos:
//   horizontal (1600 px, dois cartões lado a lado) e vertical (1080 px, um cartão por linha, para status/grupos do WhatsApp).
const VERDE = '#6fd0a5';
const TEXTO = '#dff5e8';

export const FORMATOS = {
  horizontal: { largura: 1600, margem: 56, colunas: 2, escala: 1, alturaMin: 900, rotulo: 'Horizontal' },
  vertical: { largura: 1080, margem: 56, colunas: 1, escala: 1.25, alturaMin: 1350, rotulo: 'Vertical (WhatsApp)' },
};

// ── primitivas ──────────────────────────────────────────────────────────────
function retangulo(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function caixa(ctx, x, y, w, h, r, fundo, borda = '', espessura = 1) {
  retangulo(ctx, x, y, w, h, r);
  if (fundo) { ctx.fillStyle = fundo; ctx.fill(); }
  if (borda) { ctx.strokeStyle = borda; ctx.lineWidth = espessura; ctx.stroke(); }
}

function ajustar(ctx, texto, largura) {
  let t = String(texto || '');
  if (!t || ctx.measureText(t).width <= largura) return t;
  while (t.length > 4 && ctx.measureText(`${t}…`).width > largura) t = t.slice(0, -1);
  return `${t}…`;
}

function fundo(ctx, w, h) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#020c05');
  grad.addColorStop(0.5, '#030e07');
  grad.addColorStop(1, '#051209');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const brilho1 = ctx.createRadialGradient(120, h * 0.45, 0, 120, h * 0.45, 320);
  brilho1.addColorStop(0, 'rgba(22,163,74,.2)');
  brilho1.addColorStop(1, 'rgba(22,163,74,0)');
  ctx.fillStyle = brilho1;
  ctx.fillRect(0, 0, w, h);

  const brilho2 = ctx.createRadialGradient(w * 0.8, h * 0.1, 0, w * 0.8, h * 0.1, 280);
  brilho2.addColorStop(0, 'rgba(34,197,94,.10)');
  brilho2.addColorStop(1, 'rgba(34,197,94,0)');
  ctx.fillStyle = brilho2;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = VERDE;
  ctx.lineWidth = 1;
  const raio = 26;
  const largHex = raio * Math.sqrt(3);
  const altHex = raio * 2;
  for (let linha = -1; linha < Math.ceil(h / (altHex * 0.75)) + 2; linha++) {
    for (let col = -1; col < Math.ceil(w / largHex) + 2; col++) {
      const cx = col * largHex + (linha % 2 === 0 ? 0 : largHex / 2);
      const cy = linha * altHex * 0.75;
      ctx.beginPath();
      for (let a = 0; a < 6; a++) {
        const ang = (Math.PI / 3) * a - Math.PI / 6;
        const px = cx + raio * Math.cos(ang);
        const py = cy + raio * Math.sin(ang);
        if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.restore();
}

async function logo(ctx, x, y, w, h) {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = new URL('../../../../logo-grao1000.svg', import.meta.url).href;
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });
    ctx.drawImage(img, x, y, w, h);
  } catch {
    ctx.fillStyle = VERDE;
    ctx.font = 'bold 30px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('GRÃO 1000', x, y + 8);
  }
}

// ── ícones ──────────────────────────────────────────────────────────────────
function traco(ctx, largura = 1.7) {
  ctx.strokeStyle = VERDE;
  ctx.lineWidth = largura;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

function iconeCalendario(ctx, cx, cy, s) {
  ctx.save(); traco(ctx, 1.6);
  ctx.strokeRect(cx - s * 0.85, cy - s * 0.6, s * 1.7, s * 1.3);
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.85, cy - s * 0.15); ctx.lineTo(cx + s * 0.85, cy - s * 0.15);
  ctx.moveTo(cx - s * 0.28, cy - s * 0.9); ctx.lineTo(cx - s * 0.28, cy - s * 0.28);
  ctx.moveTo(cx + s * 0.28, cy - s * 0.9); ctx.lineTo(cx + s * 0.28, cy - s * 0.28);
  ctx.stroke();
  ctx.restore();
}

function iconeTelefone(ctx, cx, cy, s) {
  ctx.save(); traco(ctx);
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.5, cy - s * 0.8);
  ctx.lineTo(cx - s * 0.5, cy + s * 0.8);
  ctx.arcTo(cx - s * 0.5, cy + s * 0.8, cx + s * 0.5, cy + s * 0.8, s * 0.3);
  ctx.lineTo(cx + s * 0.5, cy - s * 0.8);
  ctx.arcTo(cx + s * 0.5, cy - s * 0.8, cx - s * 0.5, cy - s * 0.8, s * 0.3);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy + s * 0.5, s * 0.2, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function iconeEmail(ctx, cx, cy, s) {
  ctx.save(); traco(ctx);
  ctx.strokeRect(cx - s * 0.75, cy - s * 0.5, s * 1.5, s);
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.75, cy - s * 0.5); ctx.lineTo(cx, cy + s * 0.1); ctx.lineTo(cx + s * 0.75, cy - s * 0.5);
  ctx.stroke();
  ctx.restore();
}

function iconeRelogio(ctx, cx, cy, s) {
  ctx.save(); traco(ctx);
  ctx.beginPath(); ctx.arc(cx, cy, s * 0.78, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - s * 0.44); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + s * 0.32, cy + s * 0.2); ctx.stroke();
  ctx.restore();
}

function iconeSetor(ctx, cx, cy, r, setor) {
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(22,101,52,.32)'; ctx.fill();
  ctx.strokeStyle = 'rgba(111,208,165,.45)'; ctx.lineWidth = 1.5; ctx.stroke();
  traco(ctx, 1.9);
  const s = r * 0.46;
  const nome = String(setor || '').toLowerCase();
  if (nome === 'rh') {
    ctx.beginPath(); ctx.arc(cx, cy - s * 0.4, s * 0.38, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.72, cy + s * 0.88);
    ctx.quadraticCurveTo(cx - s * 0.72, cy + s * 0.1, cx, cy + s * 0.05);
    ctx.quadraticCurveTo(cx + s * 0.72, cy + s * 0.1, cx + s * 0.72, cy + s * 0.88);
    ctx.stroke();
  } else if (nome.startsWith('log')) {
    const bw = s * 1.3; const bh = s * 1.05;
    ctx.strokeRect(cx - bw / 2, cy - bh / 2, bw, bh);
    ctx.beginPath();
    ctx.moveTo(cx - bw / 2, cy - bh / 2 + bh * 0.38); ctx.lineTo(cx + bw / 2, cy - bh / 2 + bh * 0.38);
    ctx.moveTo(cx, cy - bh / 2); ctx.lineTo(cx, cy - bh / 2 + bh * 0.38);
    ctx.stroke();
  } else if (nome === 'frotas') {
    ctx.strokeRect(cx - s * 0.85, cy - s * 0.38, s * 1.15, s * 0.85);
    ctx.strokeRect(cx + s * 0.3, cy - s * 0.72, s * 0.55, s * 0.72);
    ctx.beginPath();
    ctx.arc(cx - s * 0.42, cy + s * 0.48, s * 0.2, 0, Math.PI * 2);
    ctx.arc(cx + s * 0.57, cy + s * 0.48, s * 0.2, 0, Math.PI * 2);
    ctx.stroke();
  } else if (nome === 'caixas') {
    ctx.strokeRect(cx - s * 0.72, cy - s * 0.42, s * 1.44, s * 0.84);
    ctx.beginPath(); ctx.arc(cx, cy, s * 0.28, 0, Math.PI * 2); ctx.stroke();
  } else if (nome.startsWith('troca')) {
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.75, cy - s * 0.28); ctx.lineTo(cx + s * 0.35, cy - s * 0.28);
    ctx.moveTo(cx + s * 0.08, cy - s * 0.62); ctx.lineTo(cx + s * 0.75, cy - s * 0.28); ctx.lineTo(cx + s * 0.08, cy + s * 0.06);
    ctx.moveTo(cx + s * 0.75, cy + s * 0.28); ctx.lineTo(cx - s * 0.35, cy + s * 0.28);
    ctx.moveTo(cx - s * 0.08, cy - s * 0.06); ctx.lineTo(cx - s * 0.75, cy + s * 0.28); ctx.lineTo(cx - s * 0.08, cy + s * 0.62);
    ctx.stroke();
  } else {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      const px = cx + s * 0.82 * Math.cos(a); const py = cy + s * 0.82 * Math.sin(a);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.stroke();
  }
  ctx.restore();
}

// ── cartão de setor ─────────────────────────────────────────────────────────
function linhasDaPessoa(p) {
  return [
    p.telefone && [iconeTelefone, p.telefone],
    p.email && [iconeEmail, p.email],
    p.horario && [iconeRelogio, p.horario],
  ].filter(Boolean);
}

function alturaPessoa(p, e) {
  return (p.dias ? 24 * e : 0) + 42 * e + linhasDaPessoa(p).length * 32 * e + 12 * e;
}

function alturaCartao(cartao, e) {
  const pessoas = cartao.pessoas.reduce((soma, p) => soma + alturaPessoa(p, e), 0);
  return 22 * e + 44 * e + 14 * e + pessoas + (cartao.pessoas.length - 1) * 10 * e + 14 * e;
}

function desenharPessoa(ctx, x, y, w, p, e) {
  let cy = y;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  if (p.dias) {
    ctx.font = `bold ${14 * e}px Arial`;
    ctx.fillStyle = VERDE;
    ctx.fillText(ajustar(ctx, p.dias, w), x, cy);
    cy += 24 * e;
  }
  ctx.font = `bold ${29 * e}px Arial`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(ajustar(ctx, String(p.nome || '').toUpperCase(), w), x, cy);
  cy += 42 * e;
  for (const [icone, texto] of linhasDaPessoa(p)) {
    icone(ctx, x + 10 * e, cy + 15 * e, 9 * e);
    ctx.font = `${18 * e}px Arial`;
    ctx.fillStyle = TEXTO;
    ctx.textBaseline = 'middle';
    ctx.fillText(ajustar(ctx, texto, w - 32 * e), x + 30 * e, cy + 16 * e);
    ctx.textBaseline = 'top';
    cy += 32 * e;
  }
}

function desenharCartao(ctx, x, y, w, cartao, e) {
  const altura = alturaCartao(cartao, e);
  const pad = 22 * e;
  caixa(ctx, x, y, w, altura, 18 * e, 'rgba(3,10,6,.96)', 'rgba(22,163,74,.38)', 1.8);

  let cy = y + pad;
  const raioIcone = 22 * e;
  iconeSetor(ctx, x + pad + raioIcone, cy + raioIcone, raioIcone, cartao.setor);
  ctx.font = `bold ${22 * e}px Arial`;
  const larguraTexto = ctx.measureText(cartao.setor).width;
  const bx = x + pad + raioIcone * 2 + 12 * e;
  const bh = 38 * e;
  caixa(ctx, bx, cy + raioIcone - bh / 2, larguraTexto + 30 * e, bh, 11 * e, 'rgba(22,101,52,.28)', 'rgba(111,208,165,.28)', 1.2);
  ctx.fillStyle = '#dcfce7';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(cartao.setor, bx + 15 * e, cy + raioIcone + 1);
  cy += 44 * e + 14 * e;

  ctx.fillStyle = 'rgba(111,208,165,.13)';
  ctx.fillRect(x + pad, cy - 8 * e, w - pad * 2, 1);

  cartao.pessoas.forEach((p, i) => {
    desenharPessoa(ctx, x + pad, cy, w - pad * 2, p, e);
    cy += alturaPessoa(p, e);
    if (i < cartao.pessoas.length - 1) {
      ctx.fillStyle = 'rgba(111,208,165,.07)';
      ctx.fillRect(x + pad, cy - 4 * e, w - pad * 2, 1);
      cy += 10 * e;
    }
  });
  return altura;
}

// Distribui os cartões na coluna mais baixa (equilibra as colunas sem trocar a ordem dos setores).
export function distribuirCartoes(cartoes, colunas, larguraCartao, e) {
  const cols = Array.from({ length: colunas }, () => ({ itens: [], altura: 0 }));
  for (const cartao of cartoes) {
    const alvo = cols.reduce((menor, c) => (c.altura < menor.altura ? c : menor), cols[0]);
    const h = alturaCartao(cartao, e);
    alvo.itens.push({ cartao, h, y: alvo.altura });
    alvo.altura += h + 20 * e;
  }
  return cols;
}

// ── imagem completa ─────────────────────────────────────────────────────────
export async function desenharImagem(canvas, modelo, { formato = 'horizontal' } = {}) {
  const f = FORMATOS[formato] || FORMATOS.horizontal;
  const e = f.escala;
  const { largura, margem } = f;
  const horizontal = formato === 'horizontal';
  const colunas = Math.min(f.colunas, Math.max(1, modelo.cartoes.length));
  const gap = 20 * e;
  const larguraCartao = (largura - margem * 2 - gap * (colunas - 1)) / colunas;
  const cols = distribuirCartoes(modelo.cartoes, colunas, larguraCartao, e);
  const alturaCartoes = modelo.cartoes.length ? Math.max(...cols.map((c) => c.altura - gap)) : 170;

  const alturaCabecalho = horizontal ? 196 : 318;
  const alturaRodape = 84;
  const altura = Math.max(f.alturaMin, Math.ceil(alturaCabecalho + alturaCartoes + 30 + alturaRodape));

  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext('2d');
  fundo(ctx, largura, altura);

  // Cabeçalho: no horizontal o logo fica ao lado do título; no vertical, acima dele.
  const tituloX = horizontal ? margem + 212 : margem;
  const tituloY = horizontal ? 34 : 128;
  await logo(ctx, margem, horizontal ? 38 : 40, horizontal ? 184 : 200, horizontal ? 76 : 82);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${horizontal ? 66 : 84}px Arial`;
  ctx.fillText(modelo.titulo, tituloX, tituloY);

  const pillY = tituloY + (horizontal ? 86 : 108);
  ctx.font = `bold ${horizontal ? 24 : 30}px Arial`;
  const textoPeriodo = ajustar(ctx, modelo.periodo, largura - tituloX - margem - 60);
  const pillW = ctx.measureText(textoPeriodo).width + 66;
  const pillH = horizontal ? 46 : 58;
  caixa(ctx, tituloX, pillY, pillW, pillH, 999, 'rgba(255,255,255,.055)', 'rgba(111,208,165,.22)', 1);
  iconeCalendario(ctx, tituloX + 28, pillY + pillH / 2, horizontal ? 10 : 12);
  ctx.fillStyle = VERDE;
  ctx.textBaseline = 'middle';
  ctx.fillText(textoPeriodo, tituloX + 52, pillY + pillH / 2 + 1);

  ctx.fillStyle = 'rgba(111,208,165,.18)';
  ctx.fillRect(margem, alturaCabecalho - 22, largura - margem * 2, 1.5);

  // Cartões
  if (!modelo.cartoes.length) {
    caixa(ctx, margem, alturaCabecalho, largura - margem * 2, 150, 18, 'rgba(3,10,6,.88)', 'rgba(22,163,74,.25)', 1.5);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Nenhum plantonista informado', largura / 2, alturaCabecalho + 75);
  } else {
    cols.forEach((col, i) => {
      const x = margem + i * (larguraCartao + gap);
      col.itens.forEach((item) => desenharCartao(ctx, x, alturaCabecalho + item.y, larguraCartao, item.cartao, e));
    });
  }

  // Rodapé
  const rodapeY = altura - alturaRodape + 10;
  ctx.fillStyle = 'rgba(111,208,165,.18)';
  ctx.fillRect(margem, rodapeY, largura - margem * 2, 1.5);
  ctx.textBaseline = 'middle';
  ctx.font = 'italic 17px Arial';
  ctx.fillStyle = 'rgba(185,210,195,.65)';
  if (horizontal) {
    ctx.textAlign = 'left';
    ctx.fillText('Compromisso, agilidade e confiança para manter o agro sempre em movimento.', margem, rodapeY + 38);
    ctx.textAlign = 'right';
    ctx.fillStyle = VERDE;
    ctx.font = 'bold 18px Arial';
    ctx.fillText('www.grao1000.com.br', largura - margem, rodapeY + 38);
  } else {
    ctx.textAlign = 'center';
    ctx.fillText('Compromisso, agilidade e confiança para manter o agro sempre em movimento.', largura / 2, rodapeY + 28);
    ctx.fillStyle = VERDE;
    ctx.font = 'bold 22px Arial';
    ctx.fillText('www.grao1000.com.br', largura / 2, rodapeY + 58);
  }
  return canvas;
}

// ── saída: baixar, copiar, compartilhar ─────────────────────────────────────
export const canvasParaBlob = (canvas) => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Não foi possível gerar a imagem.'))), 'image/png');
});

export async function baixarImagem(canvas, nomeArquivo) {
  const blob = await canvasParaBlob(canvas);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const podeCopiarImagem = () => typeof ClipboardItem !== 'undefined' && Boolean(navigator.clipboard?.write);

export async function copiarImagem(canvas) {
  const blob = await canvasParaBlob(canvas);
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

export function podeCompartilhar(arquivoTeste) {
  return typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [arquivoTeste] });
}

export async function compartilharImagem(canvas, nomeArquivo, titulo) {
  const blob = await canvasParaBlob(canvas);
  const arquivo = new File([blob], nomeArquivo, { type: 'image/png' });
  await navigator.share({ files: [arquivo], title: titulo });
}
