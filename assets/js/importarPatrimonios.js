import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { toPanelUrl } from './paths.js';
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs';

const EXPECTED_SHEET_NAME = 'Patrimônios';

const COL = {
  patrimonio: ['Patrimônio', 'Patrimonio'],
  coordenacao: ['Coordenação', 'Coordenacao'],
  supervisao: ['Supervisão', 'Supervisao'],
  funcionario: ['Funcionário', 'Funcionario'],
  identificacao: ['Identificação', 'Identificacao'],
  categoria: ['Categoria'],
  marca: ['Marca'],
  modelo: ['Modelo'],
  dataAquisicao: ['Data de Aquisição', 'Data de Aquisicao'],
  dataRegistro: ['Data de Registro'],
  situacao: ['Situação', 'Situacao'],
  ultimaLeitura: ['Ultima Leitura', 'Última Leitura'],
  diasSemLeitura: ['Dias sem Leitura']
};

function normalizeText(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s || null;
}

function normalizeKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function getField(row, aliases = []) {
  if (!row || typeof row !== 'object') return null;

  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(row, alias)) return row[alias];
  }

  const normalizedMap = new Map();
  for (const key of Object.keys(row)) {
    normalizedMap.set(normalizeKey(key), row[key]);
  }

  for (const alias of aliases) {
    const hit = normalizedMap.get(normalizeKey(alias));
    if (hit !== undefined) return hit;
  }

  return null;
}

function hasAnyHeader(row, aliases = []) {
  if (!row || typeof row !== 'object') return false;
  const keys = Object.keys(row);
  const normalized = new Set(keys.map(normalizeKey));
  return aliases.some((alias) => keys.includes(alias) || normalized.has(normalizeKey(alias)));
}

function excelDateTimeToISO(value) {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    const m = String(parsed.m).padStart(2, '0');
    const d = String(parsed.d).padStart(2, '0');
    const H = String(parsed.H || 0).padStart(2, '0');
    const M = String(parsed.M || 0).padStart(2, '0');
    const S = String(Math.floor(parsed.S || 0)).padStart(2, '0');
    return `${parsed.y}-${m}-${d}T${H}:${M}:${S}`;
  }

  const s = String(value).trim();
  if (!s) return null;

  const brDateTime = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (brDateTime) {
    const [, d, m, y, hh = '00', mm = '00', ss = '00'] = brDateTime;
    return `${y}-${m}-${d}T${hh}:${mm}:${ss}`;
  }

  const isoLike = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (isoLike) {
    const [, y, m, d, hh = '00', mm = '00', ss = '00'] = isoLike;
    return `${y}-${m}-${d}T${hh}:${mm}:${ss}`;
  }

  return null;
}

function normalizeInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  const digits = String(value).replace(/[^\d-]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function validateRows(rows) {
  const firstRow = rows?.[0] || {};
  const missingHeaders = [];

  if (!hasAnyHeader(firstRow, COL.patrimonio)) missingHeaders.push('Patrimônio');
  if (!hasAnyHeader(firstRow, COL.funcionario)) missingHeaders.push('Funcionário');
  if (!hasAnyHeader(firstRow, COL.situacao)) missingHeaders.push('Situação');

  if (missingHeaders.length) {
    throw new Error(`Cabeçalho(s) obrigatório(s) ausente(s): ${missingHeaders.join(', ')}`);
  }

  const invalidRows = [];
  rows.forEach((row, index) => {
    const patrimonio = normalizeText(getField(row, COL.patrimonio));
    const funcionario = normalizeText(getField(row, COL.funcionario));
    const situacao = normalizeText(getField(row, COL.situacao));
    if (!patrimonio && !funcionario && !situacao) return;
    if (!patrimonio) {
      invalidRows.push({
        linha: index + 2,
        funcionario: funcionario || '(sem funcionário)',
        situacao: situacao || '(sem situação)'
      });
    }
  });

  if (invalidRows.length) {
    const preview = invalidRows
      .slice(0, 15)
      .map((item) => `Linha ${item.linha}: ${item.funcionario} | Situação: ${item.situacao}`)
      .join('\n');

    throw new Error(
      `Importação bloqueada: ${invalidRows.length} linha(s) estão sem o código do patrimônio.\n\n` +
      `Primeiros casos encontrados:\n${preview}`
    );
  }
}

function mapRow(row, dataReferencia, importacaoId) {
  return {
    importacao_id: importacaoId,
    data_referencia: dataReferencia,
    patrimonio_codigo: normalizeText(getField(row, COL.patrimonio)),
    coordenacao: normalizeText(getField(row, COL.coordenacao)),
    supervisao: normalizeText(getField(row, COL.supervisao)),
    funcionario: normalizeText(getField(row, COL.funcionario)),
    identificacao: normalizeText(getField(row, COL.identificacao)),
    categoria: normalizeText(getField(row, COL.categoria)),
    marca: normalizeText(getField(row, COL.marca)),
    modelo: normalizeText(getField(row, COL.modelo)),
    data_aquisicao: excelDateTimeToISO(getField(row, COL.dataAquisicao)),
    data_registro: excelDateTimeToISO(getField(row, COL.dataRegistro)),
    situacao: normalizeText(getField(row, COL.situacao)),
    ultima_leitura: excelDateTimeToISO(getField(row, COL.ultimaLeitura)),
    dias_sem_leitura: normalizeInteger(getField(row, COL.diasSemLeitura))
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

function setSummary({ linhas = 0, validas = 0, status = 'Aguardando', aba = '-' }) {
  const elLinhas = document.getElementById('sumLinhas');
  const elValidas = document.getElementById('sumValidas');
  const elStatus = document.getElementById('sumStatus');
  const elAba = document.getElementById('sumAba');

  if (elLinhas) elLinhas.textContent = String(linhas);
  if (elValidas) elValidas.textContent = String(validas);
  if (elStatus) elStatus.textContent = status;
  if (elAba) elAba.textContent = String(aba || '-');
}

initProtectedPage('Importar Patrimônios', (content, ctx) => {
  content.innerHTML = `
    <section class="base-page">
      <div class="section-heading">
        <div>
          <h2>Importar Patrimônios</h2>
          <p class="section-subtitle">
            Envie a planilha diária da base de patrimônios para registrar o snapshot no Supabase.
            Esta etapa fica centralizada em <strong>Relatórios</strong>, conforme o padrão do painel.
          </p>
        </div>
        <div class="inline-nav">
          <a href="${toPanelUrl('dashboard')}">Dashboard</a>
          <a href="${toPanelUrl('importar-colaboradores')}">Importar colaboradores</a>
          <a href="${toPanelUrl('importar-producao')}">Importar produção</a>
        </div>
      </div>

      <div class="base-card">
        <div class="base-grid">
          <div class="base-field third">
            <label class="base-label" for="dataReferencia">Data de referência</label>
            <input class="base-input" type="date" id="dataReferencia" />
          </div>

          <div class="base-field third">
            <label class="base-label" for="arquivoExcel">Arquivo Excel</label>
            <input class="base-input" type="file" id="arquivoExcel" accept=".xlsx,.xls" />
          </div>

          <div class="base-field third">
            <label class="base-label" for="origemCarga">Origem da carga</label>
            <select class="base-select" id="origemCarga">
              <option value="upload_manual">Upload manual</option>
              <option value="base_externa">Base externa</option>
              <option value="reprocessamento">Reprocessamento</option>
            </select>
          </div>

          <div class="base-field">
            <label class="base-label" for="observacoes">Observações da importação</label>
            <textarea class="base-textarea" id="observacoes" placeholder="Opcional. Ex.: planilha diária baixada às 07:00 e conferida antes do envio."></textarea>
          </div>
        </div>

        <div class="base-actions">
          <button class="base-button primary" id="btnImportar">Importar planilha</button>
          <button class="base-button secondary" id="btnLimpar">Limpar</button>
        </div>

        <div class="base-summary">
          <div class="base-mini">
            <div class="base-mini-label">Aba lida</div>
            <div class="base-mini-value" id="sumAba">-</div>
          </div>
          <div class="base-mini">
            <div class="base-mini-label">Linhas lidas</div>
            <div class="base-mini-value" id="sumLinhas">0</div>
          </div>
          <div class="base-mini">
            <div class="base-mini-label">Linhas válidas</div>
            <div class="base-mini-value" id="sumValidas">0</div>
          </div>
          <div class="base-mini">
            <div class="base-mini-label">Status</div>
            <div class="base-mini-value" id="sumStatus">Aguardando</div>
          </div>
        </div>
      </div>

      <div class="base-card">
        <h3 style="margin-top:0">Retorno da importação</h3>
        <div id="feedback" class="base-status">Selecione um arquivo e clique em "Importar planilha".</div>
      </div>

      <div class="base-card">
        <h3 style="margin-top:0">Regras aplicadas na importação</h3>
        <ul class="base-hint-list">
          <li>A aba preferencial é <strong>${EXPECTED_SHEET_NAME}</strong>; caso não exista, a primeira aba do arquivo é usada.</li>
          <li>O código do <strong>Patrimônio</strong> é tratado como identificador obrigatório da linha.</li>
          <li>Datas como <strong>Data de Aquisição</strong>, <strong>Data de Registro</strong> e <strong>Ultima Leitura</strong> são convertidas para formato ISO.</li>
          <li>O campo <strong>Dias sem Leitura</strong> é normalizado como número inteiro.</li>
          <li>Os registros são gravados em lotes para reduzir risco de falha em arquivos grandes.</li>
          <li>Esta tela já está pronta para trabalhar com as tabelas <strong>patrimonios_importacoes</strong> e <strong>patrimonios_snapshot</strong>.</li>
        </ul>
      </div>
    </section>
  `;

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
      setSummary({ linhas: 0, validas: 0, status: 'Lendo arquivo', aba: '-' });

      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
      const selectedSheetName = workbook.SheetNames.includes(EXPECTED_SHEET_NAME)
        ? EXPECTED_SHEET_NAME
        : workbook.SheetNames[0];
      const sheet = workbook.Sheets[selectedSheetName];

      const rows = XLSX.utils.sheet_to_json(sheet, {
        defval: null,
        raw: true
      });

      if (!rows.length) throw new Error('A planilha está vazia.');

      validateRows(rows);
      setSummary({ linhas: rows.length, validas: 0, status: 'Criando importação', aba: selectedSheetName });
      setFeedback(`Arquivo lido com sucesso.\nAba: ${selectedSheetName}\nLinhas encontradas: ${rows.length}\nCriando registro de importação...`);

      const { data: importacao, error: impError } = await supabase
        .from('patrimonios_importacoes')
        .insert({
          data_referencia: dataReferencia,
          arquivo_nome: file.name,
          origem,
          importado_por: ctx.user.id,
          status: 'processando',
          total_linhas: rows.length,
          observacoes,
          aba_origem: selectedSheetName
        })
        .select()
        .single();

      if (impError) throw impError;
      importacaoId = importacao.id;

      const mapped = rows
        .map((row) => mapRow(row, dataReferencia, importacaoId))
        .filter((row) => row.patrimonio_codigo);

      setSummary({ linhas: rows.length, validas: mapped.length, status: 'Importando', aba: selectedSheetName });
      setFeedback(
        `Importação criada.\nID: ${importacaoId}\nAba: ${selectedSheetName}\nLinhas lidas: ${rows.length}\nLinhas válidas: ${mapped.length}\n\nEnviando registros ao banco...`
      );

      await insertBatches('patrimonios_snapshot', mapped, 300, (done, total) => {
        setFeedback(
          `Importação criada.\nID: ${importacaoId}\nAba: ${selectedSheetName}\nLinhas lidas: ${rows.length}\nLinhas válidas: ${mapped.length}\n\nEnviando registros ao banco...\nProgresso: ${done}/${total}`
        );
      });

      const { error: updError } = await supabase
        .from('patrimonios_importacoes')
        .update({
          status: 'processado',
          total_linhas: mapped.length
        })
        .eq('id', importacaoId);

      if (updError) throw updError;

      setSummary({ linhas: rows.length, validas: mapped.length, status: 'Concluído', aba: selectedSheetName });
      setFeedback(
        `Importação concluída com sucesso.\n\nID da importação: ${importacaoId}\nArquivo: ${file.name}\nAba: ${selectedSheetName}\nLinhas lidas: ${rows.length}\nLinhas válidas: ${mapped.length}\nData de referência: ${dataReferencia}`
      );

      fileInput.value = '';
    } catch (err) {
      console.error(err);

      if (importacaoId) {
        await supabase
          .from('patrimonios_importacoes')
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
});
