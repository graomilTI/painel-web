import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';

const BUCKET = 'propostas-pdf';
const ASSET_FILES = {
  capa: 'capa.jpg',
  mapa: 'mapa-estados.jpg',
  parceiros: 'parceiros.jpg',
  calador: 'calador.jpg',
  impressora: 'mobile-printer.jpg',
  contatosRegionais: 'contatos-regionais.jpg',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type TextAlign = 'left' | 'center' | 'justify';
type ImageAlign = 'left' | 'center';
type ParagraphOptions = { align?: TextAlign; justify?: boolean };
type ImageOptions = { maxWidth?: number; maxHeight?: number; caption?: string; align?: ImageAlign };

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json; charset=utf-8' },
  });
}

function cleanFileName(value: string) {
  return String(value || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function brDate(value: string | null | undefined) {
  if (!value) return '-';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : String(value);
}

function val(value: unknown, fallback = '-') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function wrapText(font: any, text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  const paragraphs = String(text ?? '').split('\n');
  for (const para of paragraphs) {
    if (!para.trim()) { lines.push(''); continue; }
    const words = para.split(/\s+/).filter(Boolean);
    let current = '';
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

const GREEN = rgb(0.06, 0.36, 0.18);
const GRAY_TEXT = rgb(0.18, 0.18, 0.18);
const GRAY_LIGHT = rgb(0.55, 0.55, 0.55);
const BORDER = rgb(0.82, 0.82, 0.82);

class PdfFlow {
  doc: PDFDocument;
  fontReg: any;
  fontBold: any;
  margin = 50;
  pageWidth = 595.28;
  pageHeight = 841.89;
  contentWidth: number;
  page: any;
  y = 0;

  constructor(doc: PDFDocument, fontReg: any, fontBold: any) {
    this.doc = doc;
    this.fontReg = fontReg;
    this.fontBold = fontBold;
    this.contentWidth = this.pageWidth - this.margin * 2;
    this.addPage();
  }

  addPage() {
    this.page = this.doc.addPage([this.pageWidth, this.pageHeight]);
    this.y = this.pageHeight - this.margin;
  }

  ensure(h: number) {
    if (this.y - h < this.margin) this.addPage();
  }

  spacer(h = 10) {
    this.y -= h;
  }

  heading(text: string, size = 14) {
    const barHeight = size + 16;
    this.ensure(barHeight + 10);
    this.page.drawRectangle({ x: 0, y: this.y - barHeight, width: this.pageWidth, height: barHeight, color: GREEN });
    this.page.drawText(text, {
      x: this.margin, y: this.y - barHeight + (barHeight - size) / 2 - 2, size, font: this.fontBold, color: rgb(1, 1, 1),
    });
    this.y -= barHeight + 10;
  }

  async coverPage(bytes: Uint8Array | null) {
    if (!bytes) return;
    let img;
    try {
      img = await this.doc.embedJpg(bytes);
    } catch {
      return;
    }
    const scale = Math.max(this.pageWidth / img.width, this.pageHeight / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    const x = (this.pageWidth - w) / 2;
    const y = (this.pageHeight - h) / 2;
    this.page.drawImage(img, { x, y, width: w, height: h });
  }

  private drawTextLine(
    line: string,
    x: number,
    y: number,
    size: number,
    font: any,
    color: any,
    maxWidth: number,
    align: TextAlign = 'left',
    justify = false,
  ) {
    const text = String(line ?? '').trim();
    if (!text) return;

    if (align === 'center') {
      const textWidth = font.widthOfTextAtSize(text, size);
      this.page.drawText(text, { x: x + Math.max((maxWidth - textWidth) / 2, 0), y, size, font, color });
      return;
    }

    if (justify) {
      const words = text.split(/\s+/).filter(Boolean);
      if (words.length > 1) {
        const wordsWidth = words.reduce((sum, word) => sum + font.widthOfTextAtSize(word, size), 0);
        const gap = (maxWidth - wordsWidth) / (words.length - 1);
        if (Number.isFinite(gap) && gap > 2 && gap < 18) {
          let cursorX = x;
          for (const word of words) {
            this.page.drawText(word, { x: cursorX, y, size, font, color });
            cursorX += font.widthOfTextAtSize(word, size) + gap;
          }
          return;
        }
      }
    }

    this.page.drawText(text, { x, y, size, font, color });
  }

  subheading(text: string, size = 11, align: TextAlign = 'left') {
    this.ensure(size + 6);
    this.drawTextLine(text, this.margin, this.y - size, size, this.fontBold, GRAY_TEXT, this.contentWidth, align, false);
    this.y -= size + 6;
  }

  paragraph(text: string, size = 10, opts: ParagraphOptions = {}) {
    const lineHeight = size * 1.4;
    const align = opts.align || 'justify';
    const lines = wrapText(this.fontReg, text, size, this.contentWidth);
    lines.forEach((line, idx) => {
      this.ensure(lineHeight);
      const isLastLine = idx === lines.length - 1 || lines[idx + 1] === '';
      const shouldJustify = align === 'justify' && opts.justify !== false && !isLastLine;
      this.drawTextLine(line, this.margin, this.y - size, size, this.fontReg, GRAY_TEXT, this.contentWidth, align, shouldJustify);
      this.y -= lineHeight;
    });
    this.y -= 4;
  }

  bullets(items: string[], size = 10) {
    const lineHeight = size * 1.4;
    const indent = 14;
    const textX = this.margin + indent;
    const textWidth = this.contentWidth - indent;
    for (const item of items) {
      const lines = wrapText(this.fontReg, item, size, textWidth);
      lines.forEach((line, idx) => {
        this.ensure(lineHeight);
        if (idx === 0) {
          this.page.drawText('-', { x: this.margin, y: this.y - size, size, font: this.fontReg, color: GRAY_TEXT });
        }
        this.drawTextLine(line, textX, this.y - size, size, this.fontReg, GRAY_TEXT, textWidth, 'justify', idx < lines.length - 1);
        this.y -= lineHeight;
      });
    }
    this.y -= 4;
  }

  table(rows: [string, string][], size = 9) {
    const lineHeight = size * 1.3;
    const col1 = this.contentWidth * 0.62;
    const col2 = this.contentWidth - col1;
    const pad = 5;
    for (const [label, value] of rows) {
      const labelLines = wrapText(this.fontReg, label, size, col1 - pad * 2);
      const valueLines = wrapText(this.fontBold, value, size, col2 - pad * 2);
      const rowLines = Math.max(labelLines.length, valueLines.length, 1);
      const rowHeight = rowLines * lineHeight + pad * 2;
      this.ensure(rowHeight);
      const topY = this.y;
      this.page.drawRectangle({
        x: this.margin, y: topY - rowHeight, width: this.contentWidth, height: rowHeight,
        borderColor: BORDER, borderWidth: 0.5,
      });
      this.page.drawLine({
        start: { x: this.margin + col1, y: topY }, end: { x: this.margin + col1, y: topY - rowHeight },
        thickness: 0.5, color: BORDER,
      });
      labelLines.forEach((line, i) => this.page.drawText(line, {
        x: this.margin + pad, y: topY - pad - size - i * lineHeight, size, font: this.fontReg, color: GRAY_TEXT,
      }));
      valueLines.forEach((line, i) => this.page.drawText(line, {
        x: this.margin + col1 + pad, y: topY - pad - size - i * lineHeight, size, font: this.fontBold, color: GREEN,
      }));
      this.y -= rowHeight;
    }
    this.y -= 6;
  }

  async image(bytes: Uint8Array | null, opts: ImageOptions = {}) {
    if (!bytes) return;
    let img;
    try {
      img = await this.doc.embedJpg(bytes);
    } catch {
      return;
    }
    const maxWidth = opts.maxWidth || this.contentWidth;
    const maxHeight = opts.maxHeight || 320;
    let scale = Math.min(maxWidth / img.width, 1);
    if (img.height * scale > maxHeight) scale = maxHeight / img.height;
    const w = img.width * scale;
    const h = img.height * scale;
    const x = opts.align === 'center' ? this.margin + (this.contentWidth - w) / 2 : this.margin;
    this.ensure(h + (opts.caption ? 16 : 0) + 14);
    this.page.drawImage(img, { x, y: this.y - h, width: w, height: h });
    this.y -= h + 4;
    if (opts.caption) {
      const captionWidth = this.fontReg.widthOfTextAtSize(opts.caption, 8);
      const captionX = opts.align === 'center' ? this.margin + (this.contentWidth - captionWidth) / 2 : x;
      this.page.drawText(opts.caption, { x: captionX, y: this.y - 9, size: 8, font: this.fontReg, color: GRAY_LIGHT });
      this.y -= 14;
    }
    this.y -= 8;
  }

  async imagesRow(items: ImageOptions[] & { bytes?: Uint8Array | null }[]) {
    const valid = items.filter((it) => it.bytes) as { bytes: Uint8Array; maxWidth?: number; maxHeight?: number; caption?: string }[];
    if (!valid.length) return;
    const gap = 20;
    const colWidth = (this.contentWidth - gap * (valid.length - 1)) / valid.length;
    const prepared: { img: any; w: number; h: number; caption?: string }[] = [];
    for (const it of valid) {
      let img;
      try {
        img = await this.doc.embedJpg(it.bytes);
      } catch {
        continue;
      }
      const maxWidth = Math.min(it.maxWidth || colWidth, colWidth);
      const maxHeight = it.maxHeight || 320;
      let scale = Math.min(maxWidth / img.width, 1);
      if (img.height * scale > maxHeight) scale = maxHeight / img.height;
      prepared.push({ img, w: img.width * scale, h: img.height * scale, caption: it.caption });
    }
    if (!prepared.length) return;
    const rowHeight = Math.max(...prepared.map((it) => it.h));
    const hasCaption = prepared.some((it) => it.caption);
    this.ensure(rowHeight + (hasCaption ? 16 : 0) + 14);
    let x = this.margin;
    for (const it of prepared) {
      const colX = x + (colWidth - it.w) / 2;
      this.page.drawImage(it.img, { x: colX, y: this.y - it.h, width: it.w, height: it.h });
      if (it.caption) {
        const captionWidth = this.fontReg.widthOfTextAtSize(it.caption, 8);
        this.page.drawText(it.caption, { x: x + (colWidth - captionWidth) / 2, y: this.y - it.h - 9, size: 8, font: this.fontReg, color: GRAY_LIGHT });
      }
      x += colWidth + gap;
    }
    this.y -= rowHeight + (hasCaption ? 16 : 0) + 8;
  }

  async imageFillRemaining(bytes: Uint8Array | null, opts: { caption?: string } = {}) {
    if (!bytes) return;
    let img;
    try {
      img = await this.doc.embedJpg(bytes);
    } catch {
      return;
    }
    const captionSpace = opts.caption ? 16 : 0;
    const availW = this.contentWidth;
    const availH = this.y - this.margin - captionSpace;
    const scale = Math.min(availW / img.width, availH / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    const x = this.margin + (availW - w) / 2;
    const y = this.margin + captionSpace + (availH - h);
    this.page.drawImage(img, { x, y, width: w, height: h });
    this.y = y;
    if (opts.caption) {
      const captionWidth = this.fontReg.widthOfTextAtSize(opts.caption, 8);
      this.page.drawText(opts.caption, { x: this.margin + (availW - captionWidth) / 2, y: this.y - 9, size: 8, font: this.fontReg, color: GRAY_LIGHT });
      this.y -= 14;
    }
  }

  pageNumbers() {
    const pages = this.doc.getPages();
    pages.forEach((p, idx) => {
      p.drawText(`${idx + 1}/${pages.length}`, {
        x: this.pageWidth - this.margin - 24, y: this.margin - 18, size: 8, font: this.fontReg, color: GRAY_LIGHT,
      });
    });
  }
}

async function fetchAsset(supabaseUrl: string, fileName: string): Promise<Uint8Array | null> {
  try {
    const url = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${BUCKET}/assets/${fileName}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Método não permitido.' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !anonKey || !serviceKey) throw new Error('Variáveis Supabase não configuradas.');

    const authHeader = req.headers.get('authorization') || '';
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser();
    if (authError || !authData?.user) return jsonResponse({ error: 'Usuário não autenticado.' }, 401);

    const { proposta_id } = await req.json();
    if (!proposta_id) return jsonResponse({ error: 'Informe proposta_id.' }, 400);

    const db = createClient(supabaseUrl, serviceKey);
    const { data: proposta, error: propostaError } = await db
      .from('propostas_comerciais')
      .select('*')
      .eq('id', proposta_id)
      .single();
    if (propostaError) throw propostaError;
    if (!proposta) throw new Error('Proposta não encontrada.');
    if (!proposta.numero || !proposta.cliente) throw new Error('Proposta sem número ou cliente.');

    const [capaBytes, mapaBytes, parceirosBytes, caladorBytes, impressoraBytes, contatosBytes] = await Promise.all([
      fetchAsset(supabaseUrl, ASSET_FILES.capa),
      fetchAsset(supabaseUrl, ASSET_FILES.mapa),
      fetchAsset(supabaseUrl, ASSET_FILES.parceiros),
      fetchAsset(supabaseUrl, ASSET_FILES.calador),
      fetchAsset(supabaseUrl, ASSET_FILES.impressora),
      fetchAsset(supabaseUrl, ASSET_FILES.contatosRegionais),
    ]);

    const doc = await PDFDocument.create();
    const fontReg = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
    const flow = new PdfFlow(doc, fontReg, fontBold);

    // Capa (página cheia)
    await flow.coverPage(capaBytes);
    flow.addPage();
    flow.heading('PROPOSTA TÉCNICA E COMERCIAL', 18);
    flow.subheading(`Nº ${val(proposta.numero)}`, 12);
    flow.spacer(6);
    flow.paragraph(`Cascavel, PR, ${brDate(proposta.data_proposta)}.`);
    flow.spacer(10);

    flow.heading('Objetivo');
    flow.paragraph(
      'O objetivo principal da presente proposta é estabelecer o escopo dos serviços de inspeção e ' +
      'classificação de grãos a serem realizados pela Grão 1000, visando atender às necessidades da ' +
      'contratante em termos de qualidade, confiabilidade e eficiência.'
    );

    flow.heading('Proposta destinada a');
    flow.subheading(val(proposta.cliente));
    flow.paragraph(`Atendimento às demandas de todas as unidades no estado do ${val(proposta.estados)}.`);

    flow.heading('Escopo');
    flow.paragraph(
      'A proposta em questão define o escopo dos serviços de inspeção e classificação de grãos a serem ' +
      'prestados pela Grão 1000, de acordo com as normas do Ministério da Agricultura e Pecuária (MAPA), ou ' +
      'outras legislações pertinentes, levando em consideração a destinação final do produto.'
    );
    flow.paragraph(
      'Os serviços serão realizados nos pontos de embarque dos produtos da contratante, conforme programação ' +
      'informada com pelo menos 1 (um) dia de antecedência. Correndo por conta da Grão 1000 todas as despesas da operação.'
    );
    flow.paragraph(
      'A Grão 1000 disponibilizará uma equipe de profissionais experientes e treinados. Todos os colaboradores ' +
      'estarão devidamente uniformizados, além de portar os EPIs necessários para a realização dos serviços, ' +
      'bem como equipamentos modernos e calibrados para garantir a precisão e a confiabilidade dos resultados.'
    );
    flow.paragraph(
      'A contratada fornecerá informações detalhadas e em tempo real, de todos os serviços realizados, que ' +
      'estarão disponíveis no portal: https://www.grmserver.com.br/'
    );
    flow.paragraph(
      'A Grão 1000 se compromete a fornecer serviços de alta qualidade, atendendo às expectativas da contratada ' +
      'em termos de precisão, agilidade e eficiência.'
    );

    flow.heading('Dados Proponente');
    flow.paragraph('Grão Mil Ltda (Grão 1000)');
    flow.paragraph('Avenida Brasil, 2732, Apto 1, CEP 85816-294, Bairro São Cristóvão – Cascavel/Paraná');
    flow.paragraph('CNPJ 29.666.679/0001-34');
    flow.paragraph('Validade da Proposta: 30 dias');
    flow.paragraph(`Prazo de contrato: ${brDate(proposta.prazo_inicial)} a ${brDate(proposta.prazo_final)}.`);

    flow.heading('Quem somos');
    flow.paragraph(
      'A Grão 1000 é uma empresa inovadora que, como o próprio nome sugere, carrega o DNA do compromisso com a ' +
      'excelência e a completude. Desde 2010, solidificamos parcerias bem-sucedidas com algumas das principais ' +
      'empresas do ramo agrícola, proporcionando a elas a confiança e a tranquilidade necessárias para continuar prosperando.'
    );
    flow.paragraph(
      'Somos um grupo especializado em certificar produtos de origem vegetal. Sabemos que o mercado atual exige ' +
      'soluções sustentáveis e eficientes, por isso, nossa razão de existir é o constante desenvolvimento de ' +
      'soluções que facilitem e agilizem processos.'
    );
    flow.paragraph(
      'Ao optar pela Grão 1000, sua empresa contará com uma equipe dedicada, experiente e comprometida em ' +
      'fornecer soluções que gerem valor e satisfação para os nossos parceiros.'
    );

    flow.subheading('MISSÃO', 11, 'center');
    flow.paragraph('Ser sinônimo de garantia de qualidade de grãos, gerando segurança para o cliente.', 10, { align: 'center', justify: false });
    flow.subheading('VISÃO', 11, 'center');
    flow.paragraph('Ser reconhecida como a empresa referência no segmento de classificação de grãos, pela pontualidade, profissionalismo e aperfeiçoamento constante.', 10, { align: 'center', justify: false });
    flow.subheading('VALORES', 11, 'center');
    flow.paragraph('Respeito, ética, transparência, excelência e profissionalismo.', 10, { align: 'center', justify: false });

    flow.heading('Estrutura e Abrangência');
    flow.bullets([
      '600 classificadores distribuídos em 14 estados brasileiros, atendendo nos horários em que o cliente precisar;',
      'Frota de 230 veículos que garante mobilidade com maior agilidade;',
      'Mais de 2.000 equipamentos de classificação garantindo que todo classificador esteja devidamente equipado para realizar seu trabalho;',
      'Plataforma com acesso às informações das Ordens de Serviços, acompanhamento de laudos emitidos em tempo real, informações atualizadas de hora em hora dos pontos de embarque, aprovação de faturamento, troca de notas e diversos tipos de relatórios das operações.',
    ]);
    await flow.imageFillRemaining(mapaBytes, { caption: 'Estados de atuação' });
    await flow.image(parceirosBytes, { maxWidth: 360, caption: 'Alguns parceiros e clientes' });

    flow.heading('Equipamentos');
    flow.bullets([
      'Medidores de umidade Motomco 919 Fb – equipamentos aprovados pelo INMETRO',
      'Balança digital de precisão aprovada INMETRO',
      'Peneiras – conjunto de peneiras de soja, milho e trigo',
      'Alicate e cortador de grãos, pinça',
      'Caladores 3 estágios, INOX',
      'Impressoras térmicas para impressão de laudos',
      'Homogeneizador e quarteador',
    ]);
    await flow.imagesRow([
      { bytes: caladorBytes, maxWidth: 160, maxHeight: 220, caption: 'Calador 3 estágios, inox' },
      { bytes: impressoraBytes, maxWidth: 140, maxHeight: 180, caption: 'Impressora térmica para laudos' },
    ]);

    flow.heading('Tarifas e Serviços');
    flow.table([
      ['Tarifa de classificação de grãos (FOB) por tonelada', val(proposta.fob)],
      ['Volume de cadência mínima local de embarque/dia (FOB) (toneladas)', val(proposta.cad)],
      ['Auditoria/por carga', val(proposta.aud)],
      ['Diária CIF por colaborador', val(proposta.cif)],
      ['Diária para lacrar carga e conferir carga no destino', val(proposta.lacrar)],
      ['Mensal classificador (turno de 12x36)', val(proposta.m_12h)],
      ['Mensal classificador turno de 8 horas (5 dias/semana/pessoa)', val(proposta.m_8h)],
      ['Quality Check detalhado por silo/armazém', val(proposta.quality)],
      ['Adicional de supervisor em ponto crítico', val(proposta.add_sup)],
      ['Adicional de classificador no ponto', val(proposta.add_claf)],
      ['Testes Aflatoxina milho (material não fornecido)', val(proposta.t_aflas)],
      ['Testes Aflatoxina milho (material fornecido)', val(proposta.t_aflac)],
      ['Testes Transgenia Soja - GMO (material não fornecido)', val(proposta.t_gmos)],
      ['Testes Transgenia Soja - GMO (material fornecido)', val(proposta.t_gmoc)],
      ['Testes Don micotoxina Trigo por tonelada', val(proposta.t_don)],
      ['Testes de Intacta Soja por tonelada', val(proposta.intacta)],
      ['Troca de Notas por tonelada', val(proposta.tn)],
    ]);
    flow.paragraph('Obs: Tarifa para troca de notas somente em pontos onde for realizada a classificação de grãos.', 8);

    flow.heading('Prazos de faturamento e pagamento');
    flow.paragraph(
      `Contratada realizará o faturamento ${val(proposta.prazo_fatura)}, ficando o mesmo disponível na plataforma ` +
      'da Grão 1000 para aprovação e também poderá ser enviado por e-mail o relatório detalhado do faturamento, ' +
      'para aprovação. Aprovação esta que deverá ser feita em até 3 (três) dias úteis, registrando eventuais ' +
      'contestações ou acordo de novo prazo para validação dos relatórios. Caso não haja nenhuma resposta no prazo ' +
      'estabelecido, fica acordado entre as Partes que os relatórios de ordem de serviços serão considerados ' +
      'aprovados. Neste mesmo período a contratante irá apresentar os valores de possíveis descontos inerentes aos ' +
      'desvios de classificação ou custos referentes a condições logísticas, para que possam ser abatidos na ' +
      'formação de custo final do período em medição.'
    );
    flow.paragraph(
      'Após aprovados os relatórios de faturamento, a Grão 1000 emitirá nota fiscal de serviços e disponibilizará ' +
      'a mesma na plataforma e via e-mail, no prazo máximo de 2 dias após a aprovação.'
    );
    flow.paragraph('A nota fiscal será emitida com o código de serviços 17.09 – Perícias, laudos, exames técnicos e análises técnicas.');
    flow.paragraph(`Após a emissão da nota fiscal, a contratante efetuará o pagamento em prazo máximo de ${val(proposta.prazo_pgto)}, em conta indicada em contrato.`);

    flow.heading('Condições relevantes');
    flow.bullets([
      'Carregamento só poderá iniciar com a presença do classificador nomeado Grão 1000, que fará a inspeção visual do veículo vazio;',
      'A Classificação será realizada de acordo com as instruções normativas do MAPA;',
      'O tempo de trânsito do veículo somente terá responsabilidade da contratada no destino no prazo de 5 dias a partir da classificação;',
      'Em caso de divergência no destino a equipe da Grão 1000 deve ser acionada de imediato para auditar a carga. Se a carga for descarregada antes da presença do auditor da contratada no local, a mesma será eximida de qualquer responsabilidade ou custo referente a esta carga;',
      'O tempo máximo para auditoria é de 12 horas a partir da solicitação;',
      'A contratada não se responsabiliza por resultados diferentes de testes Aflatoxinas e Transgenia no destino, por se tratar de teste laboratorial;',
      'Quando a CONTRATADA identificar cargas com presença de insetos vivos/mortos, sementes tratadas, sementes tóxicas, sementes quarentenárias ou quaisquer tipos de sementes na origem, deve comunicar o CONTRATANTE imediatamente via e-mail ou telefone (WhatsApp), cabendo ao CONTRATANTE decidir sobre a continuidade ou não do embarque;',
      'Sendo constatada alguma divergência de qualidade no destino, e após a realização da auditoria for confirmada a responsabilidade da CONTRATADA, passará a ser feita retenção de até 30% do valor das faturas até que seja realizada reunião entre as partes para a definição/levantamento/acerto dos valores e condições de ressarcimento, que deverá ser realizada mensalmente ou no máximo trimestralmente.',
    ]);

    flow.heading('Contatos Regionais');
    await flow.image(contatosBytes, { maxWidth: flow.contentWidth, maxHeight: 420, align: 'center' });

    flow.heading('Atenciosamente');
    flow.subheading(val(proposta.solicitante));
    flow.paragraph(val(proposta.cargo));
    flow.paragraph(`Fone/WhatsApp: ${val(proposta.telefone)}`);
    flow.paragraph(`E-mail: ${val(proposta.email)}`);
    flow.spacer(10);
    flow.paragraph('Marcos Mota, Diretor de Qualidade – Fone/WhatsApp: (44) 9 9711-9843 – E-mail: marcos.mota@grao1000.com.br');
    flow.paragraph('Carlos Henrique Delabeneta, Diretor de Operações – Fone/WhatsApp: (45) 9 9917-2391 – E-mail: carlos@grao1000.com.br');
    flow.paragraph('Elizeu Mota, Diretor Geral – Fone/WhatsApp: 45 99846-1000 – E-mail: elizeu@grao1000.com.br');

    flow.pageNumbers();

    const pdfBytes = await doc.save();

    const fileSlug = cleanFileName(`${proposta.numero}-${proposta.cliente}`).replace(/\s+/g, '-').toLowerCase();
    const fileName = `Proposta-${fileSlug}.pdf`;
    const storagePath = `propostas/${fileSlug}-${Date.now()}.pdf`;

    const { error: uploadError } = await db.storage
      .from(BUCKET)
      .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: true });
    if (uploadError) throw uploadError;

    const { data: pub } = db.storage.from(BUCKET).getPublicUrl(storagePath);
    const publicUrl = pub?.publicUrl || '';

    const { error: updateError } = await db
      .from('propostas_comerciais')
      .update({
        status: proposta.status === 'rascunho' ? 'gerada' : proposta.status,
        link_proposta: publicUrl,
        arquivo_drive_id: storagePath,
        arquivo_drive_nome: fileName,
        formato_ultima_geracao: 'PDF',
        gerada_em: new Date().toISOString(),
      })
      .eq('id', proposta_id);
    if (updateError) throw updateError;

    return jsonResponse({
      ok: true,
      formato: 'PDF',
      arquivo_nome: fileName,
      link_proposta: publicUrl,
    });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : 'Erro ao gerar proposta.';
    return jsonResponse({ error: message }, 500);
  }
});