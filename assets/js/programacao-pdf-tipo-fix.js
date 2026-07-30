import { supabase } from './supabaseClient.js';
import {
  loadColaboradoresRegional,
  loadCruzamentoTipoContrato,
  tipoContratoLetra,
} from './programacao-equipe.js?v=20260730-indisp-legado';
import {
  loadRosterDoDia,
  loadOsResumo,
  loadExtras,
} from './programacao-despesas.js?v=20260730-indisp-legado';
import { loadCustos } from './programacao-equipe.js?v=20260730-indisp-legado';

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function normalizeCpf(value) {
  return String(value || '').replace(/\D/g, '');
}

function firstFilled(...values) {
  return values.map((value) => String(value ?? '').trim()).find(Boolean) || '';
}

function todayIso() {
  const now = new Date();
  const tz = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tz).toISOString().slice(0, 10);
}

function brDate(iso) {
  if (!iso) return '-';
  const [ano, mes, dia] = String(iso).split('-');
  return `${dia}/${mes}/${ano}`;
}

function parseEmbarqueDetalhes(embarque) {
  const texto = String(embarque || '').trim();
  if (!texto) return { cidade: '', local: '' };
  const comUf = texto.match(/^([A-Za-z]{2})\s*[–-]\s*(.+)$/);
  const restante = comUf ? comUf[2].trim() : texto;
  const partes = restante.match(/^([^(]+?)\s*\(([^)]*)\)\s*$/);
  return {
    cidade: (partes ? partes[1] : restante).trim(),
    local: partes ? partes[2].trim() : '',
  };
}

function estadiaLabel(tipo) {
  return ({
    CASA: 'Casa',
    PERNOITE: 'Pernoite',
    ALOJAMENTO: 'Alojamento',
    HOTEL: 'Hotel',
  })[normalizeText(tipo)] || '';
}

function setFeedback(message, type = '') {
  const feedback = document.getElementById('progCtxFeedback');
  if (!feedback) return;
  feedback.className = `feedback mt-16 ${type ? `prog-feedback-${type}` : ''}`;
  feedback.textContent = message;
}

async function loadJsPdf() {
  if (window.jspdf?.jsPDF) return window.jspdf.jsPDF;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return window.jspdf.jsPDF;
}

async function loadTiposPorColaborador(supervisaoQuery) {
  const porCpf = await loadCruzamentoTipoContrato(supervisaoQuery);
  const porNome = new Map();

  try {
    let query = supabase.from('colaborador_cruzamento').select('*');
    if (Array.isArray(supervisaoQuery)) {
      const supervisoes = supervisaoQuery.filter(Boolean);
      if (supervisoes.length) query = query.in('supervisao', supervisoes);
    } else if (supervisaoQuery) {
      query = query.eq('supervisao', supervisaoQuery);
    }

    const { data, error } = await query.limit(5000);
    if (error) throw error;

    (data || []).forEach((row) => {
      const tipo = firstFilled(row.tipo_contrato, row.tipo, row.regime, row.vinculo);
      if (!tipo) return;

      const cpf = normalizeCpf(firstFilled(row.cpf, row.cpf_colaborador, row.documento));
      if (cpf && !porCpf.has(cpf)) porCpf.set(cpf, tipo);

      const nome = normalizeText(firstFilled(
        row.nome,
        row.colaborador,
        row.funcionario,
        row.nome_colaborador,
        row.colaborador_nome,
      ));
      if (nome && !porNome.has(nome)) porNome.set(nome, tipo);
    });
  } catch (error) {
    console.warn('[pdf-tipo] fallback por nome indisponível', error);
  }

  return { porCpf, porNome };
}

function tipoLetra(tipos, colaboradorId, nome) {
  const cpf = normalizeCpf(colaboradorId);
  const tipo = (cpf && tipos.porCpf.get(cpf)) || tipos.porNome.get(normalizeText(nome));
  const letra = tipoContratoLetra(tipo);
  return ['E', 'I', 'D'].includes(letra) ? letra : '-';
}

async function desenharPdf(linhas, semOsLinhas, meta = {}) {
  const JsPDF = await loadJsPdf();
  const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const PW = 297;
  const PH = 210;
  const M = 10;
  const LH = 4.2;
  let y = M;

  function desenharTabela(cols, dados) {
    function desenharCabecalho() {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      let x = M;
      cols.forEach((col) => {
        doc.text(col.label, x + 1, y + 4);
        x += col.width;
      });
      doc.setDrawColor(180);
      doc.line(M, y + 6, PW - M, y + 6);
      y += 8;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
    }

    desenharCabecalho();
    dados.forEach((linha) => {
      const linhasPorColuna = cols.map((col) => doc.splitTextToSize(String(linha[col.key] ?? ''), col.width - 2));
      const numeroLinhas = Math.max(...linhasPorColuna.map((item) => item.length), 1);
      const alturaLinha = numeroLinhas * LH + 2;

      if (y + alturaLinha > PH - M) {
        doc.addPage();
        y = M;
        desenharCabecalho();
      }

      let x = M;
      cols.forEach((col, index) => {
        doc.text(linhasPorColuna[index], x + 1, y + LH);
        x += col.width;
      });
      doc.setDrawColor(230);
      doc.line(M, y + alturaLinha - 1, PW - M, y + alturaLinha - 1);
      y += alturaLinha;
    });
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Programação — resumo por colaborador', M, y + 4);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`Supervisão: ${meta.supervisaoLabel || '-'}   ·   Data: ${brDate(meta.dataReferencia)}`, M, y);
  y += 6;

  desenharTabela([
    { key: 'os', label: 'O.S.', width: 15 },
    { key: 'colaborador', label: 'Colaborador', width: 33 },
    { key: 'tipo', label: 'Tipo', width: 10 },
    { key: 'cliente', label: 'Cliente', width: 33 },
    { key: 'local', label: 'Local', width: 29 },
    { key: 'cidade', label: 'Cidade', width: 20 },
    { key: 'deslocamento', label: 'Deslocamento', width: 25 },
    { key: 'estadia', label: 'Estadia', width: 20 },
    { key: 'cafe', label: 'Café', width: 10 },
    { key: 'almoco', label: 'Almoço', width: 11 },
    { key: 'janta', label: 'Janta', width: 10 },
    { key: 'extras', label: 'Extras', width: PW - 2 * M - (15 + 33 + 10 + 33 + 29 + 20 + 25 + 20 + 10 + 11 + 10) },
  ], linhas);

  if (semOsLinhas?.length) {
    y += 8;
    if (y + 16 > PH - M) {
      doc.addPage();
      y = M;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Sem O.S. — colaboradores da regional sem atendimento hoje', M, y + 4);
    y += 8;
    desenharTabela([
      { key: 'colaborador', label: 'Colaborador', width: 75 },
      { key: 'tipo', label: 'Tipo', width: 15 },
      { key: 'situacao', label: 'Situação', width: 40 },
      { key: 'observacao', label: 'Observação', width: PW - 2 * M - (75 + 15 + 40) },
    ], semOsLinhas);
  }

  const supervisaoArquivo = meta.supervisaoLabel || 'programacao';
  const dataArquivo = meta.dataReferencia || todayIso();
  const nomeArquivo = `programacao_${supervisaoArquivo.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${dataArquivo}.pdf`;
  doc.save(nomeArquivo);
}

async function gerarPdfComTipo(button) {
  const programacaoIdMap = window.__progGetProgramacaoIdMap?.();
  const programacaoId = window.__progGetProgramacaoId?.();
  const temMapa = programacaoIdMap instanceof Map && programacaoIdMap.size > 0;

  if (!programacaoId && !temMapa) {
    setFeedback('Carregue um contexto antes de gerar o PDF.', 'warn');
    return;
  }

  const textoOriginal = button.textContent;
  button.disabled = true;
  button.textContent = 'Gerando...';

  try {
    const programacaoIdQuery = temMapa ? [...programacaoIdMap.values()] : programacaoId;
    const supervisaoQuery = temMapa
      ? [...programacaoIdMap.keys()]
      : document.getElementById('progSup')?.value;
    const dataReferencia = document.getElementById('progDataRef')?.value || todayIso();

    const roster = await loadRosterDoDia(programacaoIdQuery);
    if (!roster.length) {
      setFeedback('Nenhum colaborador confirmado nesta programação ainda.', 'warn');
      return;
    }

    const osIds = [...new Set(roster.flatMap((row) => [...row.osIds]))];
    const colaboradorIds = roster.map((row) => row.colaboradorId);
    const [custos, osResumoPorId, extrasPorColab, tipos] = await Promise.all([
      loadCustos(programacaoIdQuery),
      loadOsResumo(osIds),
      loadExtras(programacaoIdQuery, colaboradorIds),
      loadTiposPorColaborador(supervisaoQuery),
    ]);

    const DESLOC_LABEL = {
      'NAO PRECISA': 'Não precisa',
      'MOTORISTA FROTA': 'Frota - Motorista',
      'CARONA FROTA': 'Frota - Carona',
      'UBER TAXI': 'Uber/Táxi',
      'REEMBOLSO KM': 'Reemb. km',
      ONIBUS: 'Ônibus',
      OUTRO: 'Outro',
    };

    const linhas = roster.map((row) => {
      const est = custos.est.get(row.colaboradorId) || {};
      const ali = custos.ali.get(row.colaboradorId) || { almoco: true };
      const des = custos.des.get(row.colaboradorId) || {};
      const extras = extrasPorColab.get(row.colaboradorId) || [];
      const osList = [...row.osIds].map((id) => osResumoPorId.get(String(id))).filter(Boolean);
      const embarqueDetalhes = osList.map((os) => parseEmbarqueDetalhes(os.embarque));
      const deslocLabel = DESLOC_LABEL[normalizeText(des.tipo_deslocamento || 'NÃO PRECISA')]
        || des.tipo_deslocamento
        || 'Não precisa';
      const temEstadia = est.tem_estadia === true
        || (!!est.tipo_estadia && normalizeText(est.tipo_estadia) !== 'CASA');
      const dias = est.checkin && est.checkout
        ? Math.max(1, Math.round((new Date(`${est.checkout}T00:00:00`) - new Date(`${est.checkin}T00:00:00`)) / 86400000))
        : 1;

      return {
        os: osList.length ? osList.map((os) => os.numero_os || '-').join(', ') : '-',
        colaborador: row.nome,
        tipo: tipoLetra(tipos, row.colaboradorId, row.nome),
        cliente: osList.length ? [...new Set(osList.map((os) => os.cliente || '-'))].join('; ') : '-',
        local: embarqueDetalhes.length ? [...new Set(embarqueDetalhes.map((item) => item.local || '-'))].join('; ') : '-',
        cidade: embarqueDetalhes.length ? [...new Set(embarqueDetalhes.map((item) => item.cidade || '-'))].join('; ') : '-',
        deslocamento: des.placa_veiculo ? `${deslocLabel} · ${des.placa_veiculo}` : deslocLabel,
        estadia: temEstadia ? `${estadiaLabel(est.tipo_estadia) || 'Hospedagem'} · ${dias}d` : 'Casa',
        cafe: ali.cafe ? 'Sim' : 'Não',
        almoco: ali.almoco !== false ? 'Sim' : 'Não',
        janta: ali.janta ? 'Sim' : 'Não',
        extras: extras.length
          ? extras.map((item) => `${item.tipo_despesa || 'Outro'} R$${(Number(item.valor) || 0).toFixed(2)}`).join('; ')
          : '-',
      };
    });

    const SITUACAO_LABEL = {
      ATESTADO: 'Atestado',
      FALTA: 'Falta',
      FERIAS: 'Férias',
      FOLGA: 'Folga',
    };
    const confirmadosIds = new Set(roster.map((row) => row.colaboradorId));
    const supervisoesAlvo = new Set((Array.isArray(supervisaoQuery) ? supervisaoQuery : [supervisaoQuery])
      .map((item) => normalizeText(item))
      .filter(Boolean));
    const regionalBruto = await loadColaboradoresRegional(supervisaoQuery);
    const semOsColabs = regionalBruto
      .filter((colaborador) => supervisoesAlvo.has(normalizeText(colaborador.supervisao)))
      .filter((colaborador) => !confirmadosIds.has(colaborador.colaboradorId));

    let situacoesPorColab = new Map();
    if (semOsColabs.length) {
      const idsProgramacao = Array.isArray(programacaoIdQuery) ? programacaoIdQuery : [programacaoIdQuery];
      const { data, error } = await supabase
        .from('programacao_colaboradores')
        .select('colaborador_id,disponibilidade,observacao')
        .in('programacao_id', idsProgramacao)
        .in('colaborador_id', semOsColabs.map((colaborador) => colaborador.colaboradorId));
      if (error) console.warn('[pdf-tipo] situações sem O.S.', error);
      situacoesPorColab = new Map((data || []).map((row) => [String(row.colaborador_id), row]));
    }

    const semOsLinhas = semOsColabs.map((colaborador) => {
      const row = situacoesPorColab.get(colaborador.colaboradorId);
      return {
        colaborador: colaborador.nome,
        tipo: tipoLetra(tipos, colaborador.colaboradorId, colaborador.nome),
        situacao: SITUACAO_LABEL[normalizeText(row?.disponibilidade || '')] || '-',
        observacao: row?.observacao || '-',
      };
    });

    await desenharPdf(linhas, semOsLinhas, {
      supervisaoLabel: temMapa ? 'Todas' : (supervisaoQuery || '-'),
      dataReferencia,
    });
  } catch (error) {
    console.error(error);
    setFeedback(error.message || 'Falha ao gerar o PDF.', 'error');
  } finally {
    button.disabled = false;
    button.textContent = textoOriginal;
  }
}

document.addEventListener('click', (event) => {
  const button = event.target.closest?.('#progGerarPdf');
  if (!button) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  void gerarPdfComTipo(button);
}, true);
