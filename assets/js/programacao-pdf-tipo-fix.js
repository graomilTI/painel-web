import { supabase } from './supabaseClient.js';
import {
  loadColaboradoresRegional,
  loadCruzamentoTipoContrato,
  tipoContratoLetra,
} from './programacao-equipe.js?v=20260828-desligamento-readmitido1';
import {
  loadRosterDoDia,
  loadOsResumo,
  loadExtras,
} from './programacao-despesas.js?v=20260810-agrupar-hoteis';
import { loadCustos } from './programacao-equipe.js?v=20260828-desligamento-readmitido1';

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
      { key: 'colaborador', label: 'Colaborador', width: 55 },
      { key: 'tipo', label: 'Tipo', width: 13 },
      { key: 'situacao', label: 'Situação', width: 28 },
      { key: 'cafe', label: 'Café', width: 13 },
      { key: 'almoco', label: 'Almoço', width: 15 },
      { key: 'janta', label: 'Janta', width: 13 },
      { key: 'pernoite', label: 'Pernoite', width: 20 },
      { key: 'extras', label: 'Extras', width: 50 },
      { key: 'observacao', label: 'Observação', width: PW - 2 * M - (55 + 13 + 28 + 13 + 15 + 13 + 20 + 50) },
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
    const dataReferencia = window.__progGetDataReferencia?.() || document.getElementById('progDataRef')?.value || todayIso();

    const roster = await loadRosterDoDia(programacaoIdQuery);

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

    const disponiveisIds = semOsColabs
      .filter((colaborador) => normalizeText(situacoesPorColab.get(colaborador.colaboradorId)?.disponibilidade) === 'DISPONIVEL')
      .map((colaborador) => colaborador.colaboradorId);
    const extrasDisponiveis = disponiveisIds.length
      ? await loadExtras(programacaoIdQuery, disponiveisIds)
      : new Map();
    const semOsLinhas = semOsColabs.map((colaborador) => {
      const row = situacoesPorColab.get(colaborador.colaboradorId);
      const ali = custos.ali.get(colaborador.colaboradorId) || {};
      const est = custos.est.get(colaborador.colaboradorId) || {};
      const extras = extrasDisponiveis.get(colaborador.colaboradorId) || [];
      return {
        colaborador: colaborador.nome,
        tipo: tipoLetra(tipos, colaborador.colaboradorId, colaborador.nome),
        situacao: normalizeText(row?.disponibilidade) === 'DISPONIVEL' ? 'Disponível' : (SITUACAO_LABEL[normalizeText(row?.disponibilidade || '')] || '-'),
        cafe: ali.cafe ? 'Sim' : '-',
        almoco: ali.almoco ? 'Sim' : '-',
        janta: ali.janta ? 'Sim' : '-',
        pernoite: normalizeText(est.tipo_estadia) === 'PERNOITE' ? 'Sim' : '-',
        extras: extras.length ? extras.map((item) => `${item.tipo_despesa || 'Outro'} R$${(Number(item.valor) || 0).toFixed(2)}`).join('; ') : '-',
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

// Mesma leitura de dados do PDF (roster + custos + resumo de O.S.), só que
// agrupada em texto pra compartilhar: por Local (quem atende ali) e por
// Motorista de Frota (quem pega carona com ele, casado pela placa gravada em
// programacao_deslocamento — mesmo campo que o card de despesas já usa pra
// "Frota - Motorista"/"Frota - Carona").
async function montarTextoCompartilhar() {
  const programacaoIdMap = window.__progGetProgramacaoIdMap?.();
  const programacaoId = window.__progGetProgramacaoId?.();
  const temMapa = programacaoIdMap instanceof Map && programacaoIdMap.size > 0;
  if (!programacaoId && !temMapa) throw new Error('Carregue um contexto antes de compartilhar.');

  const programacaoIdQuery = temMapa ? [...programacaoIdMap.values()] : programacaoId;
  const dataReferencia = window.__progGetDataReferencia?.() || document.getElementById('progDataRef')?.value || todayIso();

  const roster = await loadRosterDoDia(programacaoIdQuery);

  const osIds = [...new Set(roster.flatMap((row) => [...row.osIds]))];
  const [custos, osResumoPorId, vinculosRes] = await Promise.all([
    loadCustos(programacaoIdQuery),
    loadOsResumo(osIds),
    osIds.length ? supabase
      .from('operacional_os_colaboradores')
      .select('os_id,colaborador_key,colaborador_cpf,origem_sugestao')
      .in('os_id', osIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (vinculosRes.error) throw vinculosRes.error;

  const papelPorVinculo = new Map();
  (vinculosRes.data || []).forEach((vinculo) => {
    const colaborador = firstFilled(vinculo.colaborador_key, vinculo.colaborador_cpf);
    if (!colaborador) return;
    papelPorVinculo.set(
      `${String(vinculo.os_id)}|${normalizeCpf(colaborador) || colaborador}`,
      normalizeText(vinculo.origem_sugestao) === 'PROGRAMACAO FROTA LOGISTICA' ? 'LOGISTICA' : 'ATENDIMENTO',
    );
  });

  const locais = new Map(); // "cliente|cidade|local" -> { cliente, cidade, local, nomes: [] }
  const motoristasPorPlaca = new Map(); // placa -> nome
  const caronasPorPlaca = new Map(); // placa -> [nome]

  for (const row of roster) {
    const des = custos.des.get(row.colaboradorId) || {};
    const tipoDesl = normalizeText(des.tipo_deslocamento || '');
    const placa = String(des.placa_veiculo || '').trim().toUpperCase();

    const osAtendidas = [...row.osIds].filter((osId) => {
      const key = `${String(osId)}|${normalizeCpf(row.colaboradorId) || row.colaboradorId}`;
      return papelPorVinculo.get(key) !== 'LOGISTICA';
    });
    const somenteLogistica = row.osIds.size > 0 && osAtendidas.length === 0;

    if (somenteLogistica) {
      if (placa) motoristasPorPlaca.set(placa, row.nome);
      continue;
    }
    if (tipoDesl === 'CARONA FROTA' && placa) {
      caronasPorPlaca.set(placa, [...(caronasPorPlaca.get(placa) || []), row.nome]);
    }

    for (const osId of osAtendidas) {
      const os = osResumoPorId.get(String(osId));
      if (!os) continue;
      const { cidade, local } = parseEmbarqueDetalhes(os.embarque);
      const cliente = String(os.cliente || '').trim();
      const key = `${cliente}|${cidade}|${local}`;
      const grupo = locais.get(key) || { cliente, cidade, local, nomes: [] };
      if (!grupo.nomes.includes(row.nome)) grupo.nomes.push(row.nome);
      locais.set(key, grupo);
    }
  }

  const blocosLocal = [...locais.values()].map(({ cliente, cidade, local, nomes }) => {
    const rotulo = [local, cidade].filter(Boolean).join(' - ') || '-';
    return `Cliente: ${cliente || '-'}\nLocal: ${rotulo}\nColaboradores:\n${nomes.length ? nomes.join('\n') : '-'}`;
  });

  const placas = new Set([...motoristasPorPlaca.keys(), ...caronasPorPlaca.keys()]);
  const blocosMotorista = [...placas].map((placa) => {
    const nomeMotorista = motoristasPorPlaca.get(placa) || `Placa ${placa} (motorista não cadastrado nesta O.S.)`;
    const caronas = caronasPorPlaca.get(placa) || [];
    return `Motorista: ${nomeMotorista}\nCaronas:\n${caronas.length ? caronas.join('\n') : '-'}`;
  });

  const { data: disponiveisRows, error: disponiveisError } = await supabase
    .from('programacao_colaboradores')
    .select('programacao_id,colaborador_id,nome_colaborador')
    .in('programacao_id', Array.isArray(programacaoIdQuery) ? programacaoIdQuery : [programacaoIdQuery])
    .eq('disponibilidade', 'DISPONIVEL');
  if (disponiveisError) throw disponiveisError;
  const disponiveisIds = (disponiveisRows || []).map((row) => row.colaborador_id);
  const extrasDisponiveis = disponiveisIds.length ? await loadExtras(programacaoIdQuery, disponiveisIds) : new Map();
  const blocosDisponiveis = (disponiveisRows || []).map((row) => {
    const ali = custos.ali.get(row.colaborador_id) || {};
    const est = custos.est.get(row.colaborador_id) || {};
    const extras = extrasDisponiveis.get(row.colaborador_id) || [];
    const despesas = [
      ali.cafe ? 'Café' : '', ali.almoco ? 'Almoço' : '', ali.janta ? 'Janta' : '',
      normalizeText(est.tipo_estadia) === 'PERNOITE' ? 'Pernoite' : '',
      ...extras.map((item) => `${item.tipo_despesa || 'Extra'}${Number(item.valor) > 0 ? ` R$ ${(Number(item.valor)).toFixed(2)}` : ''}`),
    ].filter(Boolean);
    return `• ${row.nome_colaborador || row.colaborador_id}${despesas.length ? ` — ${despesas.join(', ')}` : ''}`;
  });

  const partes = [`📋 Programação — ${brDate(dataReferencia)}`, ...blocosLocal];
  if (blocosMotorista.length) partes.push(...blocosMotorista);
  if (blocosDisponiveis.length) partes.push(`Disponíveis:\n${blocosDisponiveis.join('\n')}`);
  return partes.join('\n\n');
}

async function compartilharPrograma(button) {
  const textoOriginal = button.textContent;
  button.disabled = true;
  button.textContent = 'Montando...';
  try {
    const texto = await montarTextoCompartilhar();
    // montarTextoCompartilhar faz consultas assíncronas. Ao final delas, a
    // ativação transitória do clique já pode ter expirado e navigator.share()
    // passa a lançar NotAllowedError em vários navegadores móveis. O link do
    // WhatsApp não depende dessa ativação e funciona com a mesma mensagem.
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(texto)}`;
    window.location.assign(whatsappUrl);
  } catch (error) {
    console.error(error);
    setFeedback(error.message || 'Falha ao montar a mensagem de compartilhamento.', 'error');
  } finally {
    button.disabled = false;
    button.textContent = textoOriginal;
  }
}

document.addEventListener('click', (event) => {
  const button = event.target.closest?.('#progCompartilhar');
  if (!button) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  void compartilharPrograma(button);
}, true);
