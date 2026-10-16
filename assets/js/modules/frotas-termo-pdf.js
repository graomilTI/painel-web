// Termo de Responsabilidade por Utilização de Veículo da Empresa (PDF). Usado por Frotas > Cadastros >
// Termo de Utilização de Veículos e por Motoristas > Gerar termo: a redação fica só aqui.
const EMPRESA_NOME = 'GRAO MIL LTDA';

export function todayBr() {
  const d = new Date();
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export function dateInputToBr(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

async function loadJsPdf() {
  if (window.jspdf?.jsPDF) return window.jspdf.jsPDF;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Não foi possível carregar o gerador de PDF.'));
    document.head.appendChild(script);
  });
  return window.jspdf.jsPDF;
}

const TERMO_BULLETS = [
  'Zelar pela conservação do veículo da empresa e mensalmente, no dia 20 de cada mês, preencher o checklist através do app Bfleet, com as informações sobre as condições do veículo da empresa.',
  'Comunicar diretamente à EMPRESA a necessidade de manutenção ou conserto do veículo, não podendo esse procedimento (conserto ou manutenção) ser feito sem prévio consentimento ou por pessoa não autorizada pela EMPRESA, excetuando-se aquelas de pequena monta, imprescindíveis à continuidade de viagens. Esta comunicação deverá ser através do app Bfleet, onde será inserida a informação da manutenção necessária, juntamente com a foto da peça/serviço solicitado.',
  'Comunicar imediatamente a empresa qualquer ocorrência relacionada ao veículo, tais como, danos, avarias e roubo ou furto.',
  'Comunicar imediatamente a empresa em caso de recebimento de multa por qualquer tipo de infração de trânsito.',
  'Pagar as multas decorrentes de infração de trânsito de minha responsabilidade.',
  'Controlar o consumo conforme as normas, mediante apresentação da nota fiscal do abastecimento, e anotação da quilometragem no momento do abastecimento.',
  'Não utilizar o veículo para viagens particulares, salvo se houver liberação formal, por escrito da EMPRESA.',
];

const TERMO_PROIBICOES = [
  'A utilização do veículo por terceiros;',
  'A utilização do veículo para fins particulares;',
  'A concessão de carona para terceiros, que não colaboradores da empresa.',
  'Conduzir o veículo sob o efeito de bebidas, drogas ou qualquer outro entorpecente.',
];

const TERMO_PARAGRAFOS_FINAIS = [
  'Os encargos e despesas com abastecimento, manutenção, licenciamento, seguro e pedágio ficam a encargo da EMPRESA.',
  'Em caso de danos ou avarias no veículo, decorrentes de negligência ou má utilização do mesmo, bem como o recebimento de multas por infração de trânsito ou ainda pelo não cumprimento das determinações acima, AUTORIZO a empresa a proceder a desconto em folha de pagamento do valor correspondente ao mesmo.',
  'Em caso de acidente por descuido ou negligência minha, RESPONDEREI, civil e criminalmente, pelos danos eventualmente causados a terceiros e ainda pagarei à empresa o valor do prejuízo causado pelo acidente.',
  'Tenho conhecimento de que nenhuma indenização me será devida pela EMPRESA, pela condução do veículo, haja vista que o mesmo é fornecido para que eu tenha condições de desempenhar a função para a qual fui contratado.',
  'O presente Termo terá início a partir da data assinatura e vigorará por prazo indeterminado, enquanto durar o vínculo empregatício, podendo ser revogado a qualquer tempo.',
  'E por estar de pleno acordo com as condições ora pactuadas, assino o presente instrumento.',
];

export async function montarDocTermo({ nome, empresa, cnhNumero, cnhValidadeBr }) {
  const JsPDF = await loadJsPdf();
  const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const marginX = 20;
  const pageWidth = 210;
  const pageHeight = 297;
  const contentWidth = pageWidth - marginX * 2;
  const lineHeight = 4.6;
  let y = 20;

  function ensureSpace(needed) {
    if (y + needed > pageHeight - 18) { doc.addPage(); y = 20; }
  }

  function paragraph(text, { gapAfter = 4, bold = false } = {}) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(text, contentWidth);
    ensureSpace(lines.length * lineHeight + gapAfter);
    lines.forEach((line) => { doc.text(line, marginX, y); y += lineHeight; });
    y += gapAfter;
  }

  function indentedItem(prefix, text, indent) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(text, contentWidth - indent);
    ensureSpace(lines.length * lineHeight + 3);
    doc.text(prefix, marginX, y);
    lines.forEach((line) => { doc.text(line, marginX + indent, y); y += lineHeight; });
    y += 3;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Termo de Responsabilidade por Utilização de Veículo da Empresa', pageWidth / 2, y, { align: 'center' });
  y += 11;

  paragraph('Eu, abaixo nomeado, pela assinatura no presente instrumento, COMPROMETO-ME a:', { gapAfter: 5 });

  TERMO_BULLETS.forEach((item) => indentedItem('•', item, 6));

  y += 1;
  paragraph('Declaro ainda ter conhecimento que a utilização do veículo da empresa, destina-se única e exclusivamente para fins de exercício das atividades inerentes à função, sendo expressamente PROIBIDO:', { gapAfter: 5 });

  TERMO_PROIBICOES.forEach((item, idx) => indentedItem(`${String.fromCharCode(97 + idx)})`, item, 8));

  y += 1;
  TERMO_PARAGRAFOS_FINAIS.forEach((p) => paragraph(p, { gapAfter: 5 }));

  ensureSpace(10);
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Cascavel PR, ${todayBr()}`, pageWidth - marginX, y, { align: 'right' });
  y += 16;

  ensureSpace(40);
  doc.setFont('helvetica', 'normal');
  doc.text(`Empresa: ${String(empresa || EMPRESA_NOME).toUpperCase()}`, marginX, y); y += 6;
  doc.text(`Colaborador Condutor ${nome.toUpperCase()}`, marginX, y); y += 6;
  doc.text(`CNH ${cnhNumero}  B ${cnhValidadeBr}`, marginX, y); y += 16;
  doc.line(marginX, y, marginX + 90, y);
  y += 5;
  doc.text('Assinatura', marginX, y);

  const slug = nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'colaborador';
  return { doc, slug };
}

