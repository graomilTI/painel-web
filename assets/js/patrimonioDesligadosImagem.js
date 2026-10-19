// Imagem (PNG) dos patrimônios de um desligado, para o usuário enviar ao gestor
// conferir o recolhimento. Desenhada direto no canvas (sem dependência).

import { formatarDia, formatarReais } from './patrimonioDesligadosRegras.js?v=20261019-agrupar';

const LARGURA = 1080;
const ESCALA = 2;
const PAD = 48;
const ALTURA_LINHA = 58;

const CHIP = {
  ok: ['#166534', '#dcfce7'],
  urgente: ['#92400e', '#fef3c7'],
  hoje: ['#92400e', '#fef3c7'],
  vencido: ['#991b1b', '#fee2e2'],
  caixa: ['#3730a3', '#e0e7ff'],
};

const FONTE = '"Segoe UI", Roboto, Helvetica, Arial, sans-serif';

function arredondado(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Corta o texto com reticências para caber em `largura`. */
function caber(ctx, texto, largura) {
  const t = String(texto ?? '');
  if (ctx.measureText(t).width <= largura) return t;
  let s = t;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > largura) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

/**
 * @param {{nome:string,cargo?:string,supervisao?:string,motivo?:string,dataDesligamento:string,prazo:string,
 *   estado:{classe:string,texto:string},lancado?:boolean,itens:{patrimonio_codigo?:string,identificacao?:string,valor?:number|null}[]}} e
 * @returns {Promise<Blob>}
 */
export function gerarImagemDesligado(e, geradoEm = new Date()) {
  const itens = e.itens || [];
  const comValor = itens.some((i) => i.valor != null);
  const total = itens.reduce((t, i) => t + (i.valor == null ? 0 : Number(i.valor)), 0);
  const altura = 96 + 214 + 52 + itens.length * ALTURA_LINHA + (comValor ? 150 : 100);

  const canvas = document.createElement('canvas');
  canvas.width = LARGURA * ESCALA;
  canvas.height = altura * ESCALA;
  const ctx = canvas.getContext('2d');
  ctx.scale(ESCALA, ESCALA);
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, LARGURA, altura);

  // Faixa de título
  ctx.fillStyle = '#064e3b';
  ctx.fillRect(0, 0, LARGURA, 96);
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 30px ${FONTE}`;
  ctx.fillText('Materiais a recolher', PAD, 50);
  ctx.font = `400 19px ${FONTE}`;
  ctx.fillStyle = '#a7f3d0';
  ctx.fillText('Grão 1000 · Patrimônios de colaborador desligado', PAD, 78);

  // Colaborador
  let y = 96 + 58;
  ctx.fillStyle = '#0f172a';
  ctx.font = `700 34px ${FONTE}`;
  ctx.fillText(caber(ctx, e.nome, LARGURA - PAD * 2), PAD, y);
  y += 34;
  ctx.fillStyle = '#475569';
  ctx.font = `400 21px ${FONTE}`;
  ctx.fillText(caber(ctx, [e.cargo || 'Colaborador', e.supervisao].filter(Boolean).join(' · '), LARGURA - PAD * 2), PAD, y);

  // Datas + situação do prazo
  y += 54;
  ctx.fillStyle = '#64748b';
  ctx.font = `600 15px ${FONTE}`;
  ctx.fillText('DESLIGAMENTO', PAD, y);
  ctx.fillText('PRAZO PARA RECOLHER', PAD + 250, y);
  ctx.fillText('SITUAÇÃO', PAD + 560, y);
  y += 34;
  ctx.fillStyle = '#0f172a';
  ctx.font = `600 26px ${FONTE}`;
  ctx.fillText(formatarDia(e.dataDesligamento), PAD, y);
  ctx.fillText(formatarDia(e.prazo), PAD + 250, y);
  const [corTexto, corFundo] = CHIP[e.estado?.classe] || CHIP.ok;
  ctx.font = `700 20px ${FONTE}`;
  const rotulo = e.estado?.texto || '';
  const larguraChip = ctx.measureText(rotulo).width + 36;
  ctx.fillStyle = corFundo;
  arredondado(ctx, PAD + 560, y - 27, larguraChip, 40, 20);
  ctx.fill();
  ctx.fillStyle = corTexto;
  ctx.fillText(rotulo, PAD + 560 + 18, y);

  if (e.motivo) {
    y += 38;
    ctx.fillStyle = '#475569';
    ctx.font = `400 19px ${FONTE}`;
    ctx.fillText(caber(ctx, `Motivo: ${e.motivo}`, LARGURA - PAD * 2), PAD, y);
  } else {
    y += 6;
  }

  // Tabela
  y += 40;
  ctx.fillStyle = '#ecfdf5';
  arredondado(ctx, PAD, y, LARGURA - PAD * 2, 44, 10);
  ctx.fill();
  ctx.fillStyle = '#065f46';
  ctx.font = `700 15px ${FONTE}`;
  const xCod = PAD + 20;
  const xMat = PAD + 190;
  const xValor = LARGURA - PAD - 20;
  ctx.fillText('PATRIMÔNIO', xCod, y + 28);
  ctx.fillText('MATERIAL', xMat, y + 28);
  if (comValor) {
    ctx.textAlign = 'right';
    ctx.fillText('VALOR ESTIMADO', xValor, y + 28);
    ctx.textAlign = 'left';
  }
  y += 44;

  itens.forEach((item, i) => {
    if (i % 2 === 1) {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(PAD, y, LARGURA - PAD * 2, ALTURA_LINHA);
    }
    ctx.fillStyle = '#0f172a';
    ctx.font = `700 24px ${FONTE}`;
    ctx.fillText(String(item.patrimonio_codigo || '-'), xCod, y + 37);
    ctx.font = `400 23px ${FONTE}`;
    ctx.fillText(caber(ctx, item.identificacao || '-', (comValor ? xValor - 190 : LARGURA - PAD - 20) - xMat - 10), xMat, y + 37);
    if (comValor) {
      ctx.textAlign = 'right';
      ctx.fillStyle = item.valor == null ? '#94a3b8' : '#0f172a';
      ctx.fillText(item.valor == null ? 'sem valor' : formatarReais(item.valor), xValor, y + 37);
      ctx.textAlign = 'left';
    }
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, y + ALTURA_LINHA - 0.5);
    ctx.lineTo(LARGURA - PAD, y + ALTURA_LINHA - 0.5);
    ctx.stroke();
    y += ALTURA_LINHA;
  });

  // Rodapé
  y += 44;
  ctx.fillStyle = '#0f172a';
  ctx.font = `700 24px ${FONTE}`;
  ctx.fillText(`${itens.length} ${itens.length === 1 ? 'item' : 'itens'} a recolher`, PAD, y);
  if (comValor) {
    ctx.textAlign = 'right';
    ctx.fillText(`Caixa estimado: ${formatarReais(total)}`, LARGURA - PAD, y);
    ctx.textAlign = 'left';
  }
  y += 40;
  ctx.fillStyle = '#94a3b8';
  ctx.font = `400 16px ${FONTE}`;
  const quando = geradoEm.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
  ctx.fillText(`Gerado em ${quando} (Brasília) · posição dos patrimônios no momento da geração`, PAD, y);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Não foi possível gerar a imagem.'))), 'image/png');
  });
}

export function nomeArquivoImagem(nome, ymd) {
  const slug = String(nome || 'colaborador')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `materiais-a-recolher-${slug}-${ymd}.png`;
}

const ALTURA_ITEM_LOTE = 50;

function alturaBlocoColaborador(e) {
  return 40 + 36 + 14 + (e.itens || []).length * ALTURA_ITEM_LOTE + 34;
}

/**
 * Imagem com TODOS os desligados de uma supervisão e os materiais de cada um — para cobrar o gestor
 * em lote (um envio por supervisão).
 * @param {string} supervisao
 * @param {Parameters<typeof gerarImagemDesligado>[0][]} lista
 * @returns {Promise<Blob>}
 */
export function gerarImagemSupervisao(supervisao, lista, geradoEm = new Date()) {
  const totalItens = lista.reduce((t, e) => t + (e.itens || []).length, 0);
  const comValor = lista.some((e) => (e.itens || []).some((i) => i.valor != null));
  const total = lista.reduce((t, e) => t + (e.itens || []).reduce((s, i) => s + (i.valor == null ? 0 : Number(i.valor)), 0), 0);
  const altura = 96 + 30 + lista.reduce((t, e) => t + alturaBlocoColaborador(e), 0) + (comValor ? 130 : 90);

  const canvas = document.createElement('canvas');
  canvas.width = LARGURA * ESCALA;
  canvas.height = altura * ESCALA;
  const ctx = canvas.getContext('2d');
  ctx.scale(ESCALA, ESCALA);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, LARGURA, altura);

  ctx.fillStyle = '#064e3b';
  ctx.fillRect(0, 0, LARGURA, 96);
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 30px ${FONTE}`;
  ctx.fillText('Materiais a recolher', PAD, 50);
  ctx.font = `400 19px ${FONTE}`;
  ctx.fillStyle = '#a7f3d0';
  ctx.fillText(caber(ctx, `Supervisão: ${supervisao}`, LARGURA - PAD * 2), PAD, 78);

  const xCod = PAD + 20;
  const xMat = PAD + 190;
  const xValor = LARGURA - PAD - 20;
  let y = 96 + 30;

  lista.forEach((e) => {
    // Nome + situação do prazo
    const [corTexto, corFundo] = CHIP[e.estado?.classe] || CHIP.ok;
    ctx.font = `700 17px ${FONTE}`;
    const rotulo = e.estado?.texto || '';
    const larguraChip = ctx.measureText(rotulo).width + 28;
    ctx.fillStyle = '#0f172a';
    ctx.font = `700 26px ${FONTE}`;
    ctx.fillText(caber(ctx, e.nome, LARGURA - PAD * 2 - larguraChip - 16), PAD, y + 28);
    ctx.fillStyle = corFundo;
    arredondado(ctx, LARGURA - PAD - larguraChip, y + 4, larguraChip, 32, 16);
    ctx.fill();
    ctx.fillStyle = corTexto;
    ctx.font = `700 17px ${FONTE}`;
    ctx.fillText(rotulo, LARGURA - PAD - larguraChip + 14, y + 26);
    y += 40;

    ctx.fillStyle = '#475569';
    ctx.font = `400 19px ${FONTE}`;
    ctx.fillText(caber(ctx, `${e.cargo || 'Colaborador'} · Desligado em ${formatarDia(e.dataDesligamento)} · Prazo até ${formatarDia(e.prazo)}`, LARGURA - PAD * 2), PAD, y + 20);
    y += 36 + 14;

    (e.itens || []).forEach((item, i) => {
      if (i % 2 === 0) {
        ctx.fillStyle = '#f1f5f9';
        arredondado(ctx, PAD, y, LARGURA - PAD * 2, ALTURA_ITEM_LOTE - 4, 8);
        ctx.fill();
      }
      ctx.fillStyle = '#0f172a';
      ctx.font = `700 22px ${FONTE}`;
      ctx.fillText(String(item.patrimonio_codigo || '-'), xCod, y + 32);
      ctx.font = `400 21px ${FONTE}`;
      ctx.fillText(caber(ctx, item.identificacao || '-', (comValor ? xValor - 190 : LARGURA - PAD - 20) - xMat - 10), xMat, y + 32);
      if (comValor) {
        ctx.textAlign = 'right';
        ctx.fillStyle = item.valor == null ? '#94a3b8' : '#0f172a';
        ctx.fillText(item.valor == null ? 'sem valor' : formatarReais(item.valor), xValor, y + 32);
        ctx.textAlign = 'left';
      }
      y += ALTURA_ITEM_LOTE;
    });
    y += 34;
  });

  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, y - 12);
  ctx.lineTo(LARGURA - PAD, y - 12);
  ctx.stroke();
  y += 22;
  ctx.fillStyle = '#0f172a';
  ctx.font = `700 24px ${FONTE}`;
  ctx.fillText(`${lista.length} ${lista.length === 1 ? 'colaborador' : 'colaboradores'} · ${totalItens} ${totalItens === 1 ? 'item' : 'itens'} a recolher`, PAD, y);
  if (comValor) {
    ctx.textAlign = 'right';
    ctx.fillText(`Caixa estimado: ${formatarReais(total)}`, LARGURA - PAD, y);
    ctx.textAlign = 'left';
  }
  y += 40;
  ctx.fillStyle = '#94a3b8';
  ctx.font = `400 16px ${FONTE}`;
  const quando = geradoEm.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
  ctx.fillText(`Gerado em ${quando} (Brasília) · posição dos patrimônios no momento da geração`, PAD, y);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Não foi possível gerar a imagem.'))), 'image/png');
  });
}
