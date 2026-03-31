import { requireAuth } from './authGuard.js';
import { supabase } from './supabaseClient.js';
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs';

function normalizeText(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s || null;
}

function normalizeCPF(value) {
  if (value === null || value === undefined || value === '') return null;
  return String(value).replace(/\D/g, '').padStart(11, '0');
}

function normalizePhone(value) {
  if (!value) return null;
  const s = String(value).replace(/\D/g, '');
  return s || null;
}

function excelDateToISO(value) {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    const m = String(parsed.m).padStart(2, '0');
    const d = String(parsed.d).padStart(2, '0');
    return `${parsed.y}-${m}-${d}`;
  }

  const s = String(value).trim();
  if (!s) return null;

  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return s;

  return null;
}

function normalizeCurrency(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;

  const s = String(value)
    .trim()
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function computeAtivo(situacao, desligamento) {
  if (desligamento) return false;
  const s = String(situacao || '').toLowerCase();
  if (!s) return true;
  return !s.includes('deslig');
}

function mapRow(row, dataReferencia, importacaoId) {
  const situacao = normalizeText(row['Situação']);
  const desligamento = excelDateToISO(row['Desligamento']);

  return {
    importacao_id: importacaoId,
    data_referencia: dataReferencia,

    cpf: normalizeCPF(row['CPF']),
    nome: normalizeText(row['Nome']),
    situacao,
    admissao: excelDateToISO(row['Admissão']),
    desligamento,
    salario: normalizeCurrency(row['Salário']),
    conta_bancaria: normalizeText(row['C. Banc. Despesas']),

    empresa: normalizeText(row['Empresa']),
    coordenacao: normalizeText(row['Coordenação']),
    supervisao: normalizeText(row['Supervisão']),
    tipo: normalizeText(row['Tipo']),

    cep: normalizeText(row['CEP']),
    estado: normalizeText(row['Estado']),
    cidade: normalizeText(row['Cidade']),
    bairro: normalizeText(row['Bairro']),
    endereco: normalizeText(row['Endereço']),
    complemento: normalizeText(row['Complemento']),

    data_nascimento: excelDateToISO(row['Data de Nascimento']),
    cargo: normalizeText(row['Cargo']),

    whatsapp: normalizePhone(row['Whatsapp']),
    email_pessoal: normalizeText(row['E-mail Pessoal']),
    email_empresa: normalizeText(row['E-mail da Empresa']),

    ativo: computeAtivo(situacao, desligamento)
  };
}

async function insertBatches(table, rows, batchSize = 300, onProgress) {
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) throw error;
    if (onProgress) onProgress(Math.min(i + chunk.length, rows.length), rows.length);
  }
}

function setSummary({ linhas = 0, validas = 0, status = 'Aguardando' }) {
  const elLinhas = document.getElementById('sumLinhas');
  const elValidas = document.getElementById('sumValidas');
  const elStatus = document.getElementById('sumStatus');

  if (elLinhas) elLinhas.textContent = String(linhas);
  if (elValidas) elValidas.textContent = String(validas);
  if (elStatus) elStatus.textContent = status;
}

async function run() {
  const ctx = await requireAuth();
  if (!ctx) return;

  const dataInput = document.getElementById('dataReferencia');
  const fileInput = document.getElementById('arquivoExcel');
  const origemInput = document.getElementById('origemCarga');
  const obsInput = document.getElementById('observacoes');
  const feedback = document.getElementById('feedback');
  const btnImportar = document.getElementById('btnImportar');
  const btnLimpar = document.getElementById('btnLimpar');

  if (!dataInput.value) {
    dataInput.value = new Date().toISOString().slice(0, 10);
  }

  function setFeedback(message) {
    feedback.textContent = message;
  }

  btnLimpar?.addEventListener('click', () => {
    fileInput.value = '';
    obsInput.value = '';
    origemInput.value = 'upload_manual';
    setFeedback('Selecione um arquivo e clique em "Importar planilha".');
    setSummary({});
  });

  btnImportar?.addEventListener('click', async () => {
    let importacaoId = null;

    try {
      btnImportar.disabled = true;

      const file = fileInput.files?.[0];
      const dataReferencia = dataInput.value;
      const origem = origemInput.value || 'upload_manual';
      const observacoes = obsInput.value?.trim() || null;

      if (!file) throw new Error('Selecione o arquivo Excel.');
      if (!dataReferencia) throw new Error('Informe a data de referência.');

      setFeedback('Lendo arquivo Excel...');
      setSummary({ linhas: 0, validas: 0, status: 'Lendo arquivo' });

      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
      const firstSheet = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheet];

      const rows = XLSX.utils.sheet_to_json(sheet, {
        defval: null,
        raw: true
      });

      if (!rows.length) throw new Error('A planilha está vazia.');

      setSummary({ linhas: rows.length, validas: 0, status: 'Criando importação' });
      setFeedback(`Arquivo lido com sucesso.\nAba: ${firstSheet}\nLinhas encontradas: ${rows.length}\nCriando registro de importação...`);

      const { data: importacao, error: impError } = await supabase
        .from('colaborador_importacoes')
        .insert({
          data_referencia: dataReferencia,
          arquivo_nome: file.name,
          origem,
          importado_por: ctx.user.id,
          status: 'processando',
          total_linhas: rows.length,
          observacoes
        })
        .select()
        .single();

      if (impError) throw impError;
      importacaoId = importacao.id;

      const mapped = rows
        .map((row) => mapRow(row, dataReferencia, importacaoId))
        .filter((row) => row.nome);

      setSummary({ linhas: rows.length, validas: mapped.length, status: 'Importando' });
      setFeedback(
        `Importação criada.\nID: ${importacaoId}\nLinhas lidas: ${rows.length}\nLinhas válidas: ${mapped.length}\n\nEnviando registros ao banco...`
      );

      await insertBatches('colaborador_snapshot', mapped, 300, (done, total) => {
        setFeedback(
          `Importação criada.\nID: ${importacaoId}\nLinhas lidas: ${rows.length}\nLinhas válidas: ${mapped.length}\n\nEnviando registros ao banco...\nProgresso: ${done}/${total}`
        );
      });

      const { error: updError } = await supabase
        .from('colaborador_importacoes')
        .update({
          status: 'processado',
          total_linhas: mapped.length
        })
        .eq('id', importacaoId);

      if (updError) throw updError;

      setSummary({ linhas: rows.length, validas: mapped.length, status: 'Concluído' });
      setFeedback(
        `Importação concluída com sucesso.\n\nID da importação: ${importacaoId}\nArquivo: ${file.name}\nLinhas lidas: ${rows.length}\nLinhas válidas: ${mapped.length}\nData de referência: ${dataReferencia}`
      );

      fileInput.value = '';
    } catch (err) {
      console.error(err);

      if (importacaoId) {
        await supabase
          .from('colaborador_importacoes')
          .update({
            status: 'erro',
            observacoes: `${obsInput.value?.trim() || ''}\nErro: ${err.message || err}`.trim()
          })
          .eq('id', importacaoId);
      }

      setSummary({ status: 'Erro' });
      setFeedback(`Erro na importação:\n${err.message || err}`);
    } finally {
      btnImportar.disabled = false;
    }
  });
}

run().catch((err) => {
  console.error(err);
});
