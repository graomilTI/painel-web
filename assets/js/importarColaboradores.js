import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { toPanelUrl } from './paths.js';
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs';

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

const COL = {
  cpf: ['CPF', 'Cpf'],
  nome: ['Nome', 'NOME'],
  situacao: ['Situação', 'Situacao', 'STATUS', 'Status'],
  admissao: ['Admissão', 'Admissao', 'Data de Admissão', 'Data de Admissao', 'Admissao Data', 'Dt Admissao'],
  desligamento: ['Desligamento', 'Data de Desligamento', 'Dt Desligamento'],
  salario: ['Salário', 'Salario'],
  contaBancaria: ['C. Banc. Despesas', 'C Banc. Despesas', 'C Banc Despesas', 'Conta Bancária', 'Conta Bancaria'],
  empresa: ['Empresa'],
  coordenacao: ['Coordenação', 'Coordenacao'],
  supervisao: ['Supervisão', 'Supervisao'],
  tipo: ['Tipo'],
  cep: ['CEP', 'Cep'],
  estado: ['Estado'],
  cidade: ['Cidade'],
  bairro: ['Bairro'],
  endereco: ['Endereço', 'Endereco'],
  complemento: ['Complemento'],
  dataNascimento: ['Data de Nascimento', 'Nascimento'],
  cargo: ['Cargo'],
  whatsapp: ['Whatsapp', 'WhatsApp', 'Celular', 'Telefone'],
  emailPessoal: ['E-mail Pessoal', 'Email Pessoal'],
  emailEmpresa: ['E-mail da Empresa', 'Email da Empresa', 'E-mail Empresa']
};

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
  const situacao = normalizeText(getField(row, COL.situacao));
  const desligamento = excelDateToISO(getField(row, COL.desligamento));
  const admissao = excelDateToISO(getField(row, COL.admissao));

  return {
    importacao_id: importacaoId,
    data_referencia: dataReferencia,

    cpf: normalizeCPF(getField(row, COL.cpf)),
    nome: normalizeText(getField(row, COL.nome)),
    situacao,
    admissao,
    desligamento,
    salario: normalizeCurrency(getField(row, COL.salario)),
    conta_bancaria: normalizeText(getField(row, COL.contaBancaria)),

    empresa: normalizeText(getField(row, COL.empresa)),
    coordenacao: normalizeText(getField(row, COL.coordenacao)),
    supervisao: normalizeText(getField(row, COL.supervisao)),
    tipo: normalizeText(getField(row, COL.tipo)),

    cep: normalizeText(getField(row, COL.cep)),
    estado: normalizeText(getField(row, COL.estado)),
    cidade: normalizeText(getField(row, COL.cidade)),
    bairro: normalizeText(getField(row, COL.bairro)),
    endereco: normalizeText(getField(row, COL.endereco)),
    complemento: normalizeText(getField(row, COL.complemento)),

    data_nascimento: excelDateToISO(getField(row, COL.dataNascimento)),
    cargo: normalizeText(getField(row, COL.cargo)),

    whatsapp: normalizePhone(getField(row, COL.whatsapp)),
    email_pessoal: normalizeText(getField(row, COL.emailPessoal)),
    email_empresa: normalizeText(getField(row, COL.emailEmpresa)),

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

initProtectedPage('Importar Colaboradores', (content, ctx) => {
  content.innerHTML = `
    <section class="base-page">
      <div class="section-heading">
        <div>
          <h2>Importar Colaboradores</h2>
          <p class="section-subtitle">
            Envie a planilha diária de colaboradores para registrar o histórico da base no Supabase.
            Essa carga poderá alimentar a programação do gestor e relatórios operacionais.
          </p>
        </div>
        <div class="inline-nav">
          <a href="${toPanelUrl('dashboard')}">Dashboard</a>
          <a href="${toPanelUrl('historico-colaboradores')}">Histórico</a>
          <a href="${toPanelUrl('consultar-colaboradores')}">Consultar base</a>
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
              <option value="base_rh">Base RH</option>
              <option value="ajuste_manual">Ajuste manual</option>
            </select>
          </div>

          <div class="base-field">
            <label class="base-label" for="observacoes">Observações da importação</label>
            <textarea class="base-textarea" id="observacoes" placeholder="Opcional. Ex.: base baixada do RH às 07:10, já conferida."></textarea>
          </div>
        </div>

        <div class="base-actions">
          <button class="base-button primary" id="btnImportar">Importar planilha</button>
          <button class="base-button secondary" id="btnLimpar">Limpar</button>
        </div>

        <div class="base-summary">
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
          <li>CPF é normalizado com 11 dígitos, preservando zeros à esquerda.</li>
          <li>Datas como Admissão, Desligamento e Data de Nascimento são convertidas para formato ISO.</li>
          <li>O campo <strong>ativo</strong> é calculado automaticamente com base em Situação e Desligamento.</li>
          <li>Os registros são gravados em histórico por <strong>data de referência</strong>.</li>
          <li>A importação é salva em lotes para reduzir risco de falha em arquivos maiores.</li>
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
      setFeedback(`Arquivo lido com sucesso.
Aba: ${firstSheet}
Linhas encontradas: ${rows.length}
Criando registro de importação...`);

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

      const comAdmissao = mapped.filter((row) => row.admissao).length;

      setSummary({ linhas: rows.length, validas: mapped.length, status: 'Importando' });
      setFeedback(
        `Importação criada.
ID: ${importacaoId}
Linhas lidas: ${rows.length}
Linhas válidas: ${mapped.length}
Com admissão preenchida: ${comAdmissao}

Enviando registros ao banco...`
      );

      await insertBatches('colaborador_snapshot', mapped, 300, (done, total) => {
        setFeedback(
          `Importação criada.
ID: ${importacaoId}
Linhas lidas: ${rows.length}
Linhas válidas: ${mapped.length}

Enviando registros ao banco...
Progresso: ${done}/${total}`
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
        `Importação concluída com sucesso.

ID da importação: ${importacaoId}
Arquivo: ${file.name}
Linhas lidas: ${rows.length}
Linhas válidas: ${mapped.length}
Com admissão preenchida: ${comAdmissao}
Data de referência: ${dataReferencia}`
      );

      fileInput.value = '';
    } catch (err) {
      console.error(err);

      if (importacaoId) {
        await supabase
          .from('colaborador_importacoes')
          .update({
            status: 'erro',
            observacoes: `${obsInput.value?.trim() || ''}
Erro: ${err.message || err}`.trim()
          })
          .eq('id', importacaoId);
      }

      setSummary({ status: 'Erro' });
      setFeedback(`Erro na importação:
${err.message || err}`);
    } finally {
      btnImportar.disabled = false;
    }
  });
});
