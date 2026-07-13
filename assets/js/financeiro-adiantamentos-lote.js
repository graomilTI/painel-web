import { supabase } from './supabaseClient.js';
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs';

const IFOOD_CNPJ = '29.666.679/0001-34';
const BOUND_ATTR = 'data-lote-adiantamentos-bound';

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
    .replace(/\s+/g, ' ');
}

function onlyDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function roundNumber(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function hashText(value) {
  let hash = 0;
  const text = normalize(value);
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return `fin_${Math.abs(hash)}_${text.length}`;
}

function makePaymentHash(row) {
  return hashText([
    row.data || '',
    row.funcionario || '',
    row.cpf || '',
    row.destino || '',
    row.tipo || '',
    row.valor || 0,
    row.composicao || ''
  ].join('|'));
}

function brDate(value) {
  const [year, month, day] = String(value || '').slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : String(value || '');
}

function worksheetFromObjects(rows, columns) {
  const matrix = [columns.map((column) => column.label)];
  for (const row of rows) {
    matrix.push(columns.map((column) => {
      const value = row[column.key];
      return column.key === 'data' || column.key === 'nascimento' ? brDate(value) : value;
    }));
  }
  return XLSX.utils.aoa_to_sheet(matrix);
}

function workbookFile(filename, sheetName, rows, columns) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    worksheetFromObjects(rows, columns),
    sheetName.slice(0, 31)
  );
  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  return {
    filename,
    blob: new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    })
  };
}

function setFeedback(message, type = '') {
  const element = document.getElementById('fbAdiantamentos');
  if (!element) return;
  element.textContent = message;
  element.classList.remove('ok', 'err');
  if (type) element.classList.add(type);
}

function showDownloadPanel(files) {
  document.getElementById('adiantamentosLoteDownloads')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'adiantamentosLoteDownloads';
  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:100000',
    'background:rgba(0,0,0,.72)',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'padding:20px'
  ].join(';');

  const card = document.createElement('div');
  card.style.cssText = [
    'width:min(520px,100%)',
    'background:#07111f',
    'border:1px solid rgba(34,197,94,.45)',
    'border-radius:16px',
    'padding:22px',
    'box-shadow:0 24px 80px rgba(0,0,0,.55)',
    'color:#e5edf7'
  ].join(';');

  const title = document.createElement('h3');
  title.textContent = 'Planilhas do pagamento';
  title.style.margin = '0 0 6px';

  const subtitle = document.createElement('p');
  subtitle.textContent = `${files.length} arquivo(s) criado(s). Os downloads serão iniciados automaticamente. Caso o navegador bloqueie algum, use os botões abaixo.`;
  subtitle.style.cssText = 'margin:0 0 16px;color:#aebdce;line-height:1.45';

  const list = document.createElement('div');
  list.style.cssText = 'display:grid;gap:10px';

  const urls = [];
  files.forEach((file) => {
    const url = URL.createObjectURL(file.blob);
    urls.push(url);

    const link = document.createElement('a');
    link.href = url;
    link.download = file.filename;
    link.textContent = `Baixar ${file.filename}`;
    link.style.cssText = [
      'display:block',
      'padding:11px 14px',
      'border-radius:10px',
      'background:rgba(34,197,94,.14)',
      'border:1px solid rgba(34,197,94,.35)',
      'color:#86efac',
      'font-weight:700',
      'text-decoration:none'
    ].join(';');
    list.appendChild(link);
  });

  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Fechar';
  close.style.cssText = [
    'margin-top:16px',
    'width:100%',
    'padding:11px 14px',
    'border-radius:10px',
    'border:1px solid rgba(148,163,184,.32)',
    'background:rgba(255,255,255,.05)',
    'color:#e5edf7',
    'font-weight:700',
    'cursor:pointer'
  ].join(';');
  close.onclick = () => {
    urls.forEach((url) => URL.revokeObjectURL(url));
    overlay.remove();
  };

  card.append(title, subtitle, list, close);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  // Downloads espaçados evitam que o SheetJS dispare todos no mesmo milissegundo.
  Array.from(list.querySelectorAll('a')).forEach((link, index) => {
    window.setTimeout(() => link.click(), index * 900);
  });
}

function buildOutputs(rows) {
  const flashMap = new Map();
  const ifoodMap = new Map();

  for (const row of rows) {
    const cpf = onlyDigits(row.cpf).padStart(11, '0').slice(0, 11);
    const valor = roundNumber(row.valor);
    if (cpf.length !== 11 || !valor) continue;

    const destino = normalize(row.destino);
    if (destino.includes('flash')) {
      if (!flashMap.has(cpf)) flashMap.set(cpf, { cpf, nome: row.funcionario, valor: 0 });
      flashMap.get(cpf).valor = roundNumber(flashMap.get(cpf).valor + valor);
    } else if (destino.includes('ifood')) {
      if (!ifoodMap.has(cpf)) {
        ifoodMap.set(cpf, {
          cnpj: IFOOD_CNPJ,
          nome: row.funcionario,
          cpf,
          nascimento: '',
          email: '',
          celular: '',
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
      ifoodMap.get(cpf).livre = roundNumber(ifoodMap.get(cpf).livre + valor);
    }
  }

  return {
    flash: Array.from(flashMap.values()).sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')),
    ifood: Array.from(ifoodMap.values()).sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'))
  };
}

async function fetchAlreadyPaid(hashes) {
  const paid = new Set();
  const unique = [...new Set(hashes.filter(Boolean))];

  for (let i = 0; i < unique.length; i += 500) {
    const { data, error } = await supabase
      .from('financeiro_pagamentos_linhas')
      .select('unique_hash,status')
      .in('unique_hash', unique.slice(i, i + 500));
    if (error) throw error;
    for (const row of data || []) {
      if (String(row.status || '').toUpperCase() === 'PAGO') paid.add(row.unique_hash);
    }
  }
  return paid;
}

async function savePaymentLines(rows, executionId, paidAt) {
  const payload = rows.map((row) => ({
    execucao_id: executionId,
    unique_hash: row.unique_hash,
    data: row.data || null,
    funcionario: row.funcionario || null,
    cpf: onlyDigits(row.cpf) || null,
    destino: row.destino || null,
    tipo: row.tipo || null,
    valor: Number(row.valor || 0),
    composicao: row.composicao || null,
    coordenacao: row.coordenacao || null,
    supervisao: row.supervisao || null,
    banco: row.banco || null,
    observacao: row.observacao || null,
    status: 'PAGO',
    pago_em: paidAt,
    api_retorno: null
  }));

  const { error } = await supabase
    .from('financeiro_pagamentos_linhas')
    .upsert(payload, { onConflict: 'unique_hash' });
  if (error) throw error;
}

async function saveNotasResumo(rows, executionId) {
  const map = new Map();
  const today = new Date().toISOString().slice(0, 10);

  for (const row of rows) {
    const regional = row.coordenacao || row.supervisao || 'Sem regional';
    const destino = row.destino || 'Pagamento';
    const key = `${regional}|${destino}`;
    if (!map.has(key)) {
      map.set(key, {
        pagamento_execucao_id: executionId,
        data_pagamento: today,
        regional,
        destino,
        valor_total: 0,
        quantidade: 0,
        modulo_origem: 'FINANCEIRO'
      });
    }
    const item = map.get(key);
    item.valor_total = roundNumber(item.valor_total + Number(row.valor || 0));
    item.quantidade += 1;
  }

  const payload = Array.from(map.values());
  if (!payload.length) return;
  const { error } = await supabase
    .from('financeiro_notas_fiscais_resumo')
    .upsert(payload, { onConflict: 'data_pagamento,regional,destino,modulo_origem' });
  if (error) throw error;
}

async function pagarAdiantamentosEmLote(button) {
  button.disabled = true;
  setFeedback('Conferindo solicitações e preparando o lote...');

  try {
    const { data: decisions, error: decisionsError } = await supabase
      .from('financeiro_adiantamentos_decisoes')
      .select('ofr_code,status')
      .eq('status', 'ok');
    if (decisionsError) throw decisionsError;

    const codes = (decisions || []).map((row) => row.ofr_code).filter((value) => value !== null && value !== undefined);
    if (!codes.length) throw new Error('Marque ✓ em pelo menos uma solicitação antes de pagar.');

    const { data: imports, error: importsError } = await supabase
      .from('grm_adiantamentos_importacoes')
      .select('ofr_code,data_solicitacao,colaborador,cpf,coordenacao,supervisao,conta,valor,descricao,pendente_no_grm')
      .in('ofr_code', codes);
    if (importsError) throw importsError;

    const conference = (imports || [])
      .filter((row) => row.pendente_no_grm !== false)
      .map((row) => {
        const account = normalize(row.conta);
        const destination = account.includes('ifood')
          ? 'iFood'
          : account.includes('flash')
            ? 'Flash'
            : 'Pendente';

        const item = {
          data: row.data_solicitacao,
          funcionario: row.colaborador,
          cpf: onlyDigits(row.cpf),
          destino: destination,
          tipo: 'Adiantamento',
          valor: roundNumber(row.valor),
          composicao: row.descricao || 'Adiantamento',
          coordenacao: row.coordenacao || '',
          supervisao: row.supervisao || '',
          banco: row.conta || '',
          observacao: destination === 'Pendente' ? 'Conta não reconhecida para Flash/iFood' : 'OK',
          _ofr_code: row.ofr_code
        };
        return { ...item, unique_hash: makePaymentHash(item) };
      });

    const payable = conference.filter((row) => row.destino !== 'Pendente');
    const withoutDestination = conference.filter((row) => row.destino === 'Pendente');
    if (!payable.length) throw new Error('Nenhuma solicitação selecionada possui conta Flash ou iFood reconhecida.');

    const alreadyPaid = await fetchAlreadyPaid(payable.map((row) => row.unique_hash));
    const eligible = payable.filter((row) => !alreadyPaid.has(row.unique_hash));
    if (!eligible.length) throw new Error('Todas as solicitações selecionadas já constam como pagas. Nenhum lote novo foi criado.');

    const outputs = buildOutputs(eligible);
    const total = eligible.reduce((sum, row) => sum + Number(row.valor || 0), 0);
    const today = new Date().toISOString().slice(0, 10);
    const compactDate = today.replace(/\D/g, '');
    const { data: authData } = await supabase.auth.getUser();
    const responsible = authData?.user?.email || null;

    const { data: execution, error: executionError } = await supabase
      .from('financeiro_pagamentos_execucoes')
      .insert({
        tipo: 'Adiantamentos',
        periodo: today,
        status: 'PAGO',
        total_valor: roundNumber(total),
        total_linhas: eligible.length,
        responsavel: responsible
      })
      .select('id')
      .single();
    if (executionError) throw executionError;

    const paidAt = new Date().toISOString();
    await savePaymentLines(eligible, execution.id, paidAt);
    await saveNotasResumo(eligible, execution.id);

    const paidDecisions = eligible.map((row) => ({
      ofr_code: row._ofr_code,
      status: 'pago',
      execucao_id: execution.id,
      pago_em: paidAt,
      decidido_por: responsible,
      decidido_em: paidAt
    }));
    const { error: updateError } = await supabase
      .from('financeiro_adiantamentos_decisoes')
      .upsert(paidDecisions, { onConflict: 'ofr_code' });
    if (updateError) throw updateError;

    const files = [
      workbookFile(
        `CONFERENCIA_ADIANTAMENTOS_${compactDate}.xlsx`,
        'Conferencia',
        eligible,
        confCols
      )
    ];

    // Arquivo da plataforma só é criado quando há ao menos um registro nela.
    if (outputs.flash.length) {
      files.push(workbookFile(
        `PGTO_FLASH_${compactDate}.xlsx`,
        'PGTO_FLASH',
        outputs.flash,
        flashCols
      ));
    }
    if (outputs.ifood.length) {
      files.push(workbookFile(
        `PGTO_IFOOD_${compactDate}.xlsx`,
        'PGTO_IFOOD',
        outputs.ifood,
        ifoodCols
      ));
    }

    showDownloadPanel(files);
    setFeedback(
      `Pagamento registrado: ${eligible.length} linha(s), ${files.length} arquivo(s) criado(s)` +
      `${withoutDestination.length ? ` · ${withoutDestination.length} sem conta Flash/iFood` : ''}.`,
      'ok'
    );

    document.getElementById('btnAtualizarAdiantamentos')?.click();
  } catch (error) {
    console.error('[Financeiro] Erro no lote de adiantamentos:', error);
    setFeedback(error.message || 'Erro ao pagar adiantamentos.', 'err');
    button.disabled = false;
  }
}

function bindButton() {
  const current = document.getElementById('btnPagarAdiantamentos');
  if (!current || current.hasAttribute(BOUND_ATTR)) return;

  // Remove o listener antigo de financeiro.js sem alterar o restante da tela.
  const replacement = current.cloneNode(true);
  replacement.setAttribute(BOUND_ATTR, '1');
  current.replaceWith(replacement);
  replacement.addEventListener('click', () => pagarAdiantamentosEmLote(replacement));
}

const observer = new MutationObserver(bindButton);
observer.observe(document.documentElement, { childList: true, subtree: true });
bindButton();
