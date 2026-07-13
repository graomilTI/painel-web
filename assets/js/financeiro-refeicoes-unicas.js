import { supabase } from './supabaseClient.js';
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs';

const BOUND_ATTR = 'data-refeicoes-unicas-bound';
const IFOOD_CNPJ = '29.666.679/0001-34';

const flashCols = [
  { key: 'cpf', label: 'CPF' },
  { key: 'valor', label: 'Valor' }
];

const ifoodCols = [
  { key: 'cnpj', label: 'CNPJ' },
  { key: 'nome', label: 'Nome' },
  { key: 'cpf', label: 'CPF' },
  { key: 'nascimento', label: 'Data de nascimento' },
  { key: 'email', label: 'Email' },
  { key: 'celular', label: 'Celular' },
  { key: 'centro_custo', label: 'Centro de custo' },
  { key: 'convencao', label: 'Convenção Coletiva' },
  { key: 'grupo_entrega', label: 'Grupo de entrega' },
  { key: 'matricula', label: 'Matricula' },
  { key: 'filtro', label: 'Filtro para relatorio de recarga' },
  { key: 'refeicao', label: 'Refeição (Aderente ao PAT)' },
  { key: 'alimentacao', label: 'Alimentação (Aderente ao PAT)' },
  { key: 'livre', label: 'Livre' }
];

const confCols = [
  { key: 'data', label: 'Data' },
  { key: 'funcionario', label: 'Colaborador' },
  { key: 'cpf', label: 'CPF' },
  { key: 'destino', label: 'Destino' },
  { key: 'tipo', label: 'Tipo' },
  { key: 'valor', label: 'Valor' },
  { key: 'composicao', label: 'Composição' },
  { key: 'coordenacao', label: 'Coordenação' },
  { key: 'supervisao', label: 'Supervisão' },
  { key: 'banco', label: 'C. Banc. Despesas' },
  { key: 'observacao', label: 'Observação' }
];

function normalize(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function onlyDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function roundNumber(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function parseMoney(value) {
  const parsed = Number(
    String(value ?? '')
      .replace(/R\$/gi, '')
      .replace(/\s/g, '')
      .replace(/\./g, '')
      .replace(',', '.')
      .replace(/[^0-9.-]/g, '')
  );
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseBrDate(value) {
  const match = String(value ?? '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return String(value ?? '').slice(0, 10);
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function brDate(value) {
  const [year, month, day] = String(value ?? '').slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : String(value ?? '');
}

function mealCode(value) {
  const key = normalize(value);
  if (key.includes('cafe')) return 'CAFE';
  if (key.includes('janta')) return 'JANTA';
  return 'ALMOCO';
}

function mealLabel(value) {
  const code = mealCode(value);
  if (code === 'CAFE') return 'Café';
  if (code === 'JANTA') return 'Janta';
  return 'Almoço';
}

function mealKey({ data, cpf, funcionario, tipo }) {
  const identity = onlyDigits(cpf).padStart(11, '0').slice(-11) || normalize(funcionario);
  return `${String(data || '').slice(0, 10)}|${identity}|${mealCode(tipo)}`;
}

function hashText(value) {
  let hash = 0;
  const text = normalize(value);
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return `fin_refeicao_${Math.abs(hash)}_${text.length}`;
}

function setFeedback(message, type = '') {
  const element = document.getElementById('fbAlimentacao');
  if (!element) return;
  element.textContent = message;
  element.classList.remove('ok', 'err');
  if (type) element.classList.add(type);
}

function readApprovedRowsFromTable() {
  const rows = Array.from(document.querySelectorAll('#payConferenciaTbody tr'));
  const unique = new Map();

  for (const tr of rows) {
    const cells = tr.querySelectorAll('td');
    if (cells.length < 10) continue;
    if (!tr.querySelector('.pay-status-btn.active-ok')) continue;

    const item = {
      data: parseBrDate(cells[1].textContent),
      funcionario: cells[2].textContent.trim(),
      cpf: onlyDigits(cells[3].textContent),
      destino: cells[4].textContent.trim(),
      tipo: mealLabel(cells[5].textContent),
      valor: roundNumber(parseMoney(cells[6].textContent)),
      composicao: cells[7].textContent.trim(),
      supervisao: cells[8].textContent.trim(),
      observacao: cells[9].textContent.trim()
    };

    const key = mealKey(item);
    if (!unique.has(key)) unique.set(key, item);
  }

  return Array.from(unique.values());
}

async function loadSourceRows(dataRef) {
  const { data, error } = await supabase
    .from('financeiro_alimentacao_colaboradores')
    .select('id,data_ref,colaborador,cpf,coordenacao,supervisao,hora_identificada,local_nome,distancia_m,status,tipo_beneficio,ativo')
    .eq('data_ref', dataRef)
    .eq('ativo', true);
  if (error) throw error;
  return data || [];
}

async function loadColaboradores(cpfs) {
  const clean = [...new Set(cpfs.map(onlyDigits).filter((cpf) => cpf.length === 11))];
  const map = new Map();
  if (!clean.length) return map;

  for (let index = 0; index < clean.length; index += 500) {
    const { data, error } = await supabase
      .from('colaboradores')
      .select('cpf,nome,conta_bancaria_despesas,coordenacao,supervisao,data_nascimento,whatsapp,email_pessoal,email_empresa')
      .in('cpf', clean.slice(index, index + 500));
    if (error) throw error;
    for (const row of data || []) map.set(onlyDigits(row.cpf), row);
  }

  return map;
}

function groupSourceRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = mealKey({
      data: row.data_ref,
      cpf: row.cpf,
      funcionario: row.colaborador,
      tipo: row.tipo_beneficio
    });
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

async function loadPaidKeys(dates) {
  const uniqueDates = [...new Set(dates.filter(Boolean))];
  const result = new Set();
  if (!uniqueDates.length) return result;

  const { data, error } = await supabase
    .from('financeiro_pagamentos_linhas')
    .select('data,cpf,funcionario,tipo,status')
    .in('data', uniqueDates)
    .eq('status', 'PAGO');
  if (error) throw error;

  for (const row of data || []) {
    result.add(mealKey({
      data: row.data,
      cpf: row.cpf,
      funcionario: row.funcionario,
      tipo: row.tipo
    }));
  }
  return result;
}

function buildPaymentRows(approved, sourceGroups, colaboradoresMap) {
  const rows = [];
  const sourceByKey = new Map();

  for (const item of approved) {
    const key = mealKey(item);
    let source = sourceGroups.get(key) || [];

    if (!source.length) {
      const fallbackKey = `${item.data}|${normalize(item.funcionario)}|${mealCode(item.tipo)}`;
      source = Array.from(sourceGroups.entries())
        .find(([candidateKey, values]) => {
          const first = values[0];
          const candidateFallback = `${first?.data_ref}|${normalize(first?.colaborador)}|${mealCode(first?.tipo_beneficio)}`;
          return candidateFallback === fallbackKey || candidateKey === key;
        })?.[1] || [];
    }

    const primary = source[0] || {};
    const cpf = onlyDigits(item.cpf || primary.cpf);
    const colaborador = colaboradoresMap.get(cpf) || {};
    const banco = colaborador.conta_bancaria_despesas || '';
    const bancoNorm = normalize(banco);
    let destino = item.destino;
    if (bancoNorm.includes('flash')) destino = 'Flash';
    if (bancoNorm.includes('ifood')) destino = 'iFood';

    const row = {
      ...item,
      cpf,
      destino,
      banco,
      coordenacao: colaborador.coordenacao || primary.coordenacao || '',
      supervisao: item.supervisao || colaborador.supervisao || primary.supervisao || '',
      nascimento: colaborador.data_nascimento || '',
      email: colaborador.email_empresa || colaborador.email_pessoal || '',
      celular: onlyDigits(colaborador.whatsapp),
      unique_hash: hashText(`REFEICAO|${key}`),
      _meal_key: key,
      _source_ids: source.map((value) => value.id).filter(Boolean)
    };

    rows.push(row);
    sourceByKey.set(key, source);
  }

  return { rows, sourceByKey };
}

function buildOutputs(rows) {
  const flashMap = new Map();
  const ifoodMap = new Map();

  for (const row of rows) {
    const cpf = onlyDigits(row.cpf).padStart(11, '0').slice(-11);
    if (cpf.length !== 11 || !row.valor) continue;
    const destino = normalize(row.destino);

    if (destino.includes('flash')) {
      if (!flashMap.has(cpf)) flashMap.set(cpf, { cpf, nome: row.funcionario, valor: 0 });
      flashMap.get(cpf).valor = roundNumber(flashMap.get(cpf).valor + row.valor);
    } else if (destino.includes('ifood')) {
      if (!ifoodMap.has(cpf)) {
        ifoodMap.set(cpf, {
          cnpj: IFOOD_CNPJ,
          nome: row.funcionario,
          cpf,
          nascimento: row.nascimento || '',
          email: row.email || '',
          celular: row.celular || '',
          centro_custo: row.coordenacao || row.supervisao || '',
          convencao: '',
          grupo_entrega: '',
          matricula: '',
          filtro: '',
          refeicao: '',
          alimentacao: '',
          livre: 0
        });
      }
      ifoodMap.get(cpf).livre = roundNumber(ifoodMap.get(cpf).livre + row.valor);
    }
  }

  return {
    flash: Array.from(flashMap.values()).sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')),
    ifood: Array.from(ifoodMap.values()).sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'))
  };
}

function worksheetFromObjects(rows, columns) {
  const matrix = [columns.map((column) => column.label)];
  for (const row of rows) {
    matrix.push(columns.map((column) => {
      const value = row[column.key];
      return ['data', 'nascimento'].includes(column.key) ? brDate(value) : value;
    }));
  }
  return XLSX.utils.aoa_to_sheet(matrix);
}

function workbookFile(filename, sheetName, rows, columns) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheetFromObjects(rows, columns), sheetName.slice(0, 31));
  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  return {
    filename,
    blob: new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  };
}

function showDownloadPanel(files) {
  document.getElementById('refeicoesLoteDownloads')?.remove();
  if (!files.length) return;

  const overlay = document.createElement('div');
  overlay.id = 'refeicoesLoteDownloads';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:20px';

  const card = document.createElement('div');
  card.style.cssText = 'width:min(520px,100%);background:#07111f;border:1px solid rgba(34,197,94,.45);border-radius:16px;padding:22px;box-shadow:0 24px 80px rgba(0,0,0,.55);color:#e5edf7';
  card.innerHTML = '<h3 style="margin:0 0 6px">Planilhas das refeições</h3><p style="margin:0 0 16px;color:#aebdce">Os arquivos foram preparados sem duplicar Café, Almoço ou Janta do mesmo colaborador no dia.</p>';

  const list = document.createElement('div');
  list.style.cssText = 'display:grid;gap:10px';
  const urls = [];

  for (const file of files) {
    const url = URL.createObjectURL(file.blob);
    urls.push(url);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.filename;
    link.textContent = `Baixar ${file.filename}`;
    link.style.cssText = 'display:block;padding:11px 14px;border-radius:10px;background:rgba(34,197,94,.14);border:1px solid rgba(34,197,94,.35);color:#86efac;font-weight:700;text-decoration:none';
    list.appendChild(link);
  }

  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Fechar';
  close.style.cssText = 'margin-top:16px;width:100%;padding:11px 14px;border-radius:10px;border:1px solid rgba(148,163,184,.32);background:rgba(255,255,255,.05);color:#e5edf7;font-weight:700;cursor:pointer';
  close.onclick = () => {
    urls.forEach((url) => URL.revokeObjectURL(url));
    overlay.remove();
  };

  card.append(list, close);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  Array.from(list.querySelectorAll('a')).forEach((link, index) => {
    window.setTimeout(() => link.click(), index * 900);
  });
}

async function savePaymentLines(rows, executionId, apiData) {
  const paidAt = new Date().toISOString();
  const payload = rows.map((row) => ({
    execucao_id: executionId,
    unique_hash: row.unique_hash,
    data: row.data,
    funcionario: row.funcionario,
    cpf: onlyDigits(row.cpf) || null,
    destino: row.destino || null,
    tipo: row.tipo,
    valor: Number(row.valor || 0),
    composicao: row.composicao || null,
    coordenacao: row.coordenacao || null,
    supervisao: row.supervisao || null,
    banco: row.banco || null,
    observacao: row.observacao || null,
    status: 'PAGO',
    pago_em: paidAt,
    api_retorno: apiData || null
  }));

  const { error } = await supabase
    .from('financeiro_pagamentos_linhas')
    .upsert(payload, { onConflict: 'unique_hash' });
  if (error) throw error;
}

async function saveNotasResumo(rows, executionId) {
  const groups = new Map();
  const today = new Date().toISOString().slice(0, 10);

  for (const row of rows) {
    const regional = row.coordenacao || row.supervisao || 'Sem regional';
    const destino = row.destino || 'Pagamento';
    const key = `${regional}|${destino}`;
    if (!groups.has(key)) {
      groups.set(key, {
        pagamento_execucao_id: executionId,
        data_pagamento: today,
        regional,
        destino,
        valor_total: 0,
        quantidade: 0,
        modulo_origem: 'FINANCEIRO'
      });
    }
    const group = groups.get(key);
    group.valor_total = roundNumber(group.valor_total + Number(row.valor || 0));
    group.quantidade += 1;
  }

  const payload = Array.from(groups.values());
  if (!payload.length) return;
  const { error } = await supabase
    .from('financeiro_notas_fiscais_resumo')
    .upsert(payload, { onConflict: 'data_pagamento,regional,destino,modulo_origem' });
  if (error) throw error;
}

async function moveSourceRowsToHistory(rows) {
  const paidAt = new Date().toISOString();
  const primaryIds = [];
  const duplicateIds = [];

  for (const row of rows) {
    const ids = [...new Set(row._source_ids || [])];
    if (!ids.length) continue;
    primaryIds.push(ids[0]);
    duplicateIds.push(...ids.slice(1));
  }

  if (primaryIds.length) {
    const { error } = await supabase
      .from('financeiro_alimentacao_colaboradores')
      .update({ status: 'PAGO', processado_em: paidAt, ativo: true })
      .in('id', primaryIds);
    if (error) throw error;
  }

  if (duplicateIds.length) {
    const { error } = await supabase
      .from('financeiro_alimentacao_colaboradores')
      .update({ status: 'DUPLICADO', processado_em: paidAt, ativo: false })
      .in('id', duplicateIds);
    if (error) throw error;
  }
}

async function pagarRefeicoesUnicas(button) {
  const approved = readApprovedRowsFromTable();
  if (!approved.length) {
    setFeedback('Nenhuma refeição marcada como OK.', 'err');
    return;
  }

  button.disabled = true;
  setFeedback('Consolidando Café, Almoço e Janta por colaborador e dia...');

  try {
    const dates = [...new Set(approved.map((row) => row.data).filter(Boolean))];
    const sourceRows = [];
    for (const date of dates) sourceRows.push(...await loadSourceRows(date));

    const sourceGroups = groupSourceRows(sourceRows);
    const colaboradores = await loadColaboradores(approved.map((row) => row.cpf));
    const { rows } = buildPaymentRows(approved, sourceGroups, colaboradores);
    const paidKeys = await loadPaidKeys(dates);
    const eligible = rows.filter((row) => !paidKeys.has(row._meal_key));
    const alreadyPaid = rows.filter((row) => paidKeys.has(row._meal_key));

    let executionId = null;
    let apiData = { ok: true, skipped: true };

    if (eligible.length) {
      const outputs = buildOutputs(eligible);
      const platformRows = eligible.filter((row) => ['flash', 'ifood'].some((destination) => normalize(row.destino).includes(destination)));
      const total = eligible.reduce((sum, row) => sum + Number(row.valor || 0), 0);
      const { data: authData } = await supabase.auth.getUser();
      const responsible = authData?.user?.email || null;

      const { data: execution, error: executionError } = await supabase
        .from('financeiro_pagamentos_execucoes')
        .insert({
          tipo: 'Refeições',
          periodo: dates.length === 1 ? dates[0] : `${dates[0]} a ${dates[dates.length - 1]}`,
          status: 'PROCESSANDO',
          total_valor: roundNumber(total),
          total_linhas: eligible.length,
          responsavel: responsible
        })
        .select('id')
        .single();
      if (executionError) throw executionError;
      executionId = execution.id;

      if (platformRows.length) {
        const response = await supabase.functions.invoke('financeiro-pagar-beneficios', {
          body: {
            execucao_id: executionId,
            tipo: 'Refeições',
            periodo: dates.length === 1 ? dates[0] : dates.join(','),
            flash: outputs.flash,
            ifood: outputs.ifood,
            linhas: platformRows
          }
        });
        if (response.error) throw new Error(response.error.message || 'Falha na API de pagamento Flash/iFood.');
        if (response.data?.ok === false) throw new Error(response.data.error || 'API de pagamento retornou erro.');
        apiData = response.data || { ok: true };
      }

      await savePaymentLines(eligible, executionId, apiData);
      await saveNotasResumo(eligible, executionId);
      await supabase
        .from('financeiro_pagamentos_execucoes')
        .update({ status: 'PAGO', api_retorno: apiData })
        .eq('id', executionId);

      const compactDate = (dates[0] || new Date().toISOString().slice(0, 10)).replace(/\D/g, '');
      const files = [workbookFile(`CONFERENCIA_REFEICOES_${compactDate}.xlsx`, 'Conferencia', eligible, confCols)];
      if (outputs.flash.length) files.push(workbookFile(`PGTO_FLASH_${compactDate}.xlsx`, 'PGTO_FLASH', outputs.flash, flashCols));
      if (outputs.ifood.length) files.push(workbookFile(`PGTO_IFOOD_${compactDate}.xlsx`, 'PGTO_IFOOD', outputs.ifood, ifoodCols));
      showDownloadPanel(files);
    }

    // Tudo que estava OK sai da conferência. Um registro representativo vai
    // para o histórico; logins repetidos do mesmo tipo ficam inativos.
    await moveSourceRowsToHistory(rows);

    document.getElementById('btnGerarAlmoco')?.click();
    window.setTimeout(() => document.querySelector('[data-pay-tab="historico"]')?.click(), 350);

    setFeedback(
      `${rows.length} refeição(ões) movida(s) para o histórico` +
      `${eligible.length ? ` · ${eligible.length} pagamento(s) novo(s)` : ''}` +
      `${alreadyPaid.length ? ` · ${alreadyPaid.length} já registrado(s)` : ''}.`,
      'ok'
    );
  } catch (error) {
    console.error('[Financeiro] Erro no pagamento único de refeições:', error);
    setFeedback(error.message || 'Erro ao pagar refeições.', 'err');
    button.disabled = false;
  }
}

function deduplicateVisibleTable() {
  const tbody = document.getElementById('payConferenciaTbody');
  if (!tbody) return;

  const seen = new Set();
  for (const row of Array.from(tbody.querySelectorAll('tr'))) {
    const cells = row.querySelectorAll('td');
    if (cells.length < 6) continue;
    const key = mealKey({
      data: parseBrDate(cells[1].textContent),
      cpf: cells[3].textContent,
      funcionario: cells[2].textContent,
      tipo: cells[5].textContent
    });
    if (seen.has(key)) row.remove();
    else seen.add(key);
  }
}

function deduplicateHistoryTable() {
  const tbody = document.getElementById('payHistoricoTbody');
  if (!tbody) return;

  const seen = new Set();
  for (const row of Array.from(tbody.querySelectorAll('tr'))) {
    const cells = row.querySelectorAll('td');
    if (cells.length < 3) continue;
    const key = `${parseBrDate(cells[0].textContent)}|${normalize(cells[2].textContent)}|${mealCode(cells[1].textContent)}`;
    if (seen.has(key)) row.remove();
    else seen.add(key);
  }
}

function bindButton() {
  const current = document.getElementById('btnPagarBeneficios');
  if (!current || current.hasAttribute(BOUND_ATTR)) return;

  const replacement = current.cloneNode(true);
  replacement.setAttribute(BOUND_ATTR, '1');
  current.replaceWith(replacement);
  replacement.addEventListener('click', () => pagarRefeicoesUnicas(replacement));
}

const observer = new MutationObserver(() => {
  bindButton();
  deduplicateVisibleTable();
  deduplicateHistoryTable();
});
observer.observe(document.documentElement, { childList: true, subtree: true });

bindButton();
deduplicateVisibleTable();
deduplicateHistoryTable();
