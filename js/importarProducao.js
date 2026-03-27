import { requireAuth } from './authGuard.js';
import { supabase } from './supabaseClient.js';
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs';

function normalizeText(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
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
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return s;
  return null;
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;
  const s = String(value).trim().replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function mapRow(row, dataReferencia, importacaoId) {
  return {
    importacao_id: importacaoId,
    data_referencia: dataReferencia,
    coordenacao: normalizeText(row['Coordenação']),
    supervisao: normalizeText(row['Supervisão']),
    funcionario: normalizeText(row['Funcionário']),
    tipo: normalizeText(row['Tipo']),
    data: excelDateToISO(row['Data']) || dataReferencia,
    os: normalizeText(row['O.S.']),
    cliente: normalizeText(row['Cliente']),
    servico: normalizeText(row['Serviço']),
    cidade: normalizeText(row['Cidade']),
    local_embarque: normalizeText(row['Local de Embarque']),
    checkin: normalizeText(row['Check-in']),
    checkout: normalizeText(row['Check-out']),
    cargas: normalizeNumber(row['Cargas']),
    tons: normalizeNumber(row['Tons'])
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
  document.getElementById('sumLinhas').textContent = String(linhas);
  document.getElementById('sumValidas').textContent = String(validas);
  document.getElementById('sumStatus').textContent = status;
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

  if (!dataInput.value) dataInput.value = new Date().toISOString().slice(0, 10);

  btnLimpar.addEventListener('click', () => {
    fileInput.value = '';
    origemInput.value = 'upload_manual';
    obsInput.value = '';
    feedback.textContent = 'Selecione um arquivo e clique em "Importar produção".';
    setSummary({});
  });

  btnImportar.addEventListener('click', async () => {
    let importacaoId = null;
    try {
      btnImportar.disabled = true;
    } catch(e){}
    try {
      const file = fileInput.files?.[0];
      const dataReferencia = dataInput.value;
      const origem = origemInput.value || 'upload_manual';
      const observacoes = obsInput.value?.trim() || null;

      if (!file) throw new Error('Selecione o arquivo Excel.');
      if (!dataReferencia) throw new Error('Informe a data de referência.');

      setSummary({ linhas: 0, validas: 0, status: 'Lendo arquivo' });
      feedback.textContent = 'Lendo arquivo Excel...';

      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
      const firstSheet = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheet];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });

      if (!rows.length) throw new Error('A planilha está vazia.');

      setSummary({ linhas: rows.length, validas: 0, status: 'Criando importação' });

      const { data: importacao, error: impError } = await supabase
        .from('producao_importacoes')
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

      const mapped = rows.map((row) => mapRow(row, dataReferencia, importacaoId)).filter((r) => r.funcionario);
      setSummary({ linhas: rows.length, validas: mapped.length, status: 'Importando' });

      await insertBatches('producao_snapshot', mapped, 300, (done, total) => {
        feedback.textContent = `Importando produção...\nID: ${importacaoId}\nProgresso: ${done}/${total}`;
      });

      const { error: updError } = await supabase
        .from('producao_importacoes')
        .update({ status: 'processado', total_linhas: mapped.length })
        .eq('id', importacaoId);

      if (updError) throw updError;

      setSummary({ linhas: rows.length, validas: mapped.length, status: 'Concluído' });
      feedback.textContent = `Importação concluída com sucesso.\n\nID da importação: ${importacaoId}\nArquivo: ${file.name}\nLinhas lidas: ${rows.length}\nLinhas válidas: ${mapped.length}\nData de referência: ${dataReferencia}`;
      fileInput.value = '';
    } catch (err) {
      console.error(err);
      if (importacaoId) {
        await supabase
          .from('producao_importacoes')
          .update({ status: 'erro' })
          .eq('id', importacaoId);
      }
      setSummary({ status: 'Erro' });
      feedback.textContent = `Erro na importação:\n${err.message || err}`;
    } finally {
      btnImportar.disabled = false;
    }
  });
}

run().catch(console.error);
