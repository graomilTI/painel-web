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

function hasAnyHeader(row, aliases = []) {
  if (!row || typeof row !== 'object') return false;
  const keys = Object.keys(row);
  const normalized = new Set(keys.map(normalizeKey));
  return aliases.some((alias) => keys.includes(alias) || normalized.has(normalizeKey(alias)));
}

function getField(row, aliases = []) {
  if (!row || typeof row !== 'object') return null;

  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(row, alias)) return row[alias];
  }

  const normalizedMap = new Map();
  for (const key of Object.keys(row)) normalizedMap.set(normalizeKey(key), row[key]);

  for (const alias of aliases) {
    const hit = normalizedMap.get(normalizeKey(alias));
    if (hit !== undefined) return hit;
  }

  return null;
}

function excelDateTimeToISO(value) {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    const m = String(parsed.m).padStart(2, '0');
    const d = String(parsed.d).padStart(2, '0');
    const H = String(parsed.H ?? 0).padStart(2, '0');
    const M = String(parsed.M ?? 0).padStart(2, '0');
    const S = String(Math.floor(parsed.S ?? 0)).padStart(2, '0');
    return `${parsed.y}-${m}-${d}T${H}:${M}:${S}`;
  }

  const s = String(value).trim();
  if (!s) return null;

  const brDateTime = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (brDateTime) {
    const [, dd, mm, yyyy, hh = '00', mi = '00', ss = '00'] = brDateTime;
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
  }

  const isoDateTime = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (isoDateTime) {
    const [, yyyy, mm, dd, hh = '00', mi = '00', ss = '00'] = isoDateTime;
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
  }

  return null;
}

function normalizeInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  const s = String(value).replace(/[^\d-]/g, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

function wait(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const COL = {
  patrimonioCodigo: ['Patrimônio', 'Patrimonio'],
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

function validateRows(rows) {
  const firstRow = rows?.[0] || {};
  const missingHeaders = [];

  if (!hasAnyHeader(firstRow, COL.patrimonioCodigo)) missingHeaders.push('Patrimônio');
  if (!hasAnyHeader(firstRow, COL.funcionario)) missingHeaders.push('Funcionário');
  if (!hasAnyHeader(firstRow, COL.situacao)) missingHeaders.push('Situação');

  if (missingHeaders.length) throw new Error(`Cabeçalho(s) obrigatório(s) ausente(s): ${missingHeaders.join(', ')}`);
}

function normalizePatrimonioCodigo(value) {
  return normalizeText(value)?.trim().toUpperCase() || null;
}

function mapRow(row, importacaoId, dataUpload) {
  const patrimonioCodigo = normalizePatrimonioCodigo(getField(row, COL.patrimonioCodigo));
  return {
    importacao_id: importacaoId,
    data_upload: dataUpload,
    patrimonio_codigo: patrimonioCodigo,
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
    dias_sem_leitura: normalizeInteger(getField(row, COL.diasSemLeitura)),
    hash_linha: patrimonioCodigo
  };
}

const _L2D = { A:'0', B:'1', C:'2', D:'3', E:'4', F:'5', G:'6', H:'7', I:'8', J:'9' };
const _D2L = { '0':'A', '1':'B', '2':'C', '3':'D', '4':'E', '5':'F', '6':'G', '7':'H', '8':'I', '9':'J' };

function rawPlaca(value) {
  return String(value || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, '').slice(0, 7);
}

function placaKey(value) {
  const p = rawPlaca(value);
  if (p.length !== 7) return p;
  const c4 = p[4];
  return _L2D[c4] !== undefined ? p.slice(0, 4) + _L2D[c4] + p.slice(5) : p;
}

function placaCandidates(value) {
  const p = rawPlaca(value);
  if (p.length !== 7) return [];
  const c4 = p[4];
  const alt = _L2D[c4] !== undefined
    ? p.slice(0, 4) + _L2D[c4] + p.slice(5)
    : _D2L[c4] !== undefined
      ? p.slice(0, 4) + _D2L[c4] + p.slice(5)
      : null;
  return alt ? [p, alt] : [p];
}

function extrairPlacas(texto) {
  const s = String(texto || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const matches = s.match(/[A-Z]{3}[-\s]?[0-9][A-Z0-9][0-9]{2}/g) || [];
  return [...new Set(matches.flatMap(placaCandidates))];
}

function dataMs(value) {
  const t = value ? Date.parse(value) : 0;
  return Number.isFinite(t) ? t : 0;
}

async function sincronizarRegionaisVeiculosPorLeitura(rows = []) {
  const leiturasComPlaca = rows
    .filter((row) => row.coordenacao && row.identificacao)
    .flatMap((row) => extrairPlacas(row.identificacao).map((placa) => ({
      placa,
      key: placaKey(placa),
      coordenacao: row.coordenacao,
      supervisao: row.supervisao,
      funcionario: row.funcionario,
      ultima_leitura: row.ultima_leitura,
      data_upload: row.data_upload
    })))
    .filter((row) => row.key && row.key.length === 7);

  if (!leiturasComPlaca.length) return { veiculos_regionais_atualizados: 0, leituras_com_placa: 0 };

  const { data: veiculos, error } = await supabase
    .from('frotas_veiculos')
    .select('id,placa,coordenacao,status')
    .eq('status', 'ATIVO')
    .limit(10000);

  if (error) throw error;

  const veiculosPorPlaca = new Map((veiculos || []).map((v) => [placaKey(v.placa), v]));
  const melhorLeituraPorVeiculo = new Map();

  leiturasComPlaca.forEach((leitura) => {
    const veiculo = veiculosPorPlaca.get(leitura.key);
    if (!veiculo) return;
    const atual = melhorLeituraPorVeiculo.get(veiculo.id);
    const novaData = Math.max(dataMs(leitura.ultima_leitura), dataMs(leitura.data_upload));
    const atualData = atual ? Math.max(dataMs(atual.ultima_leitura), dataMs(atual.data_upload)) : -1;
    if (!atual || novaData >= atualData) melhorLeituraPorVeiculo.set(veiculo.id, { ...leitura, veiculo });
  });

  let atualizados = 0;
  for (const item of melhorLeituraPorVeiculo.values()) {
    const regionalAtual = normalizeKey(item.veiculo.coordenacao);
    const regionalLeitura = normalizeKey(item.coordenacao);
    if (!regionalLeitura || regionalAtual === regionalLeitura) continue;

    const { error: updError } = await supabase
      .from('frotas_veiculos')
      .update({ coordenacao: item.coordenacao })
      .eq('id', item.veiculo.id);

    if (updError) throw updError;
    atualizados += 1;
    await wait(8);
  }

  return {
    veiculos_regionais_atualizados: atualizados,
    leituras_com_placa: leiturasComPlaca.length
  };
}

async function upsertBatches(table, rows, batchSize = 500, onProgress) {
  const chunks = chunkArray(rows, batchSize);

  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    const query = table === 'patrimonios_historico_leituras'
      ? supabase.from(table).insert(chunk)
      : supabase.from(table).upsert(chunk, { onConflict: 'patrimonio_codigo' });
    const { error } = await query;
    if (error) throw error;

    const done = Math.min((i + 1) * batchSize, rows.length);
    if (onProgress) onProgress(done, rows.length, i + 1, chunks.length);
    await wait(15);
  }
}

function setSummary({ linhas = 0, validas = 0, status = 'Aguardando' }) {
  document.getElementById('sumLinhas').textContent = String(linhas);
  document.getElementById('sumValidas').textContent = String(validas);
  document.getElementById('sumStatus').textContent = status;
}

function safeErrorMessage(err) {
  return err?.message || err?.error_description || err?.details || String(err);
}

initProtectedPage('Importar Patrimônios', (content, ctx) => {
  const relatoriosUrl = toPanelUrl('adm-patrimonio');
  const statusUrl = toPanelUrl('patrimonio-status');

  content.innerHTML = `
    <section class="base-page">
      <div class="section-heading">
        <div>
          <h2>Importar Patrimônios</h2>
          <p class="section-subtitle">
            Use esta tela para subir a planilha diária de patrimônios em <strong>RELATÓRIOS</strong>,
            mantendo o menu principal de <strong>PATRIMÔNIOS</strong> para acompanhamento, relatórios e status.
          </p>
        </div>
        <div class="inline-nav">
          <a href="${relatoriosUrl}">Relatórios</a>
          <a href="${toPanelUrl('importar-patrimonios')}" class="active">Importar arquivo</a>
          <a href="${statusUrl}">Status</a>
        </div>
      </div>

      <div class="base-card">
        <div class="base-grid">
          <div class="base-field third">
            <label class="base-label" for="arquivoExcel">Arquivo Excel</label>
            <input class="base-input" type="file" id="arquivoExcel" accept=".xlsx,.xls" />
          </div>
          <div class="base-field third">
            <label class="base-label" for="origemCarga">Origem da carga</label>
            <select class="base-select" id="origemCarga">
              <option value="upload_manual">Upload manual</option>
              <option value="base_diaria">Base diária</option>
              <option value="ajuste_manual">Ajuste manual</option>
            </select>
          </div>
          <div class="base-field third">
            <label class="base-label" for="nomeAba">Aba esperada</label>
            <input class="base-input" type="text" id="nomeAba" value="Patrimônios" />
          </div>
          <div class="base-field">
            <label class="base-label" for="observacoes">Observações</label>
            <textarea class="base-textarea" id="observacoes" placeholder="Opcional. Ex.: arquivo recebido do banco de dados diário."></textarea>
          </div>
        </div>

        <div class="base-actions">
          <button class="base-button primary" id="btnImportar">Importar patrimônios</button>
          <button class="base-button secondary" id="btnLimpar">Limpar</button>
        </div>

        <div class="base-summary">
          <div class="base-mini"><div class="base-mini-label">Linhas lidas</div><div class="base-mini-value" id="sumLinhas">0</div></div>
          <div class="base-mini"><div class="base-mini-label">Linhas válidas</div><div class="base-mini-value" id="sumValidas">0</div></div>
          <div class="base-mini"><div class="base-mini-label">Status</div><div class="base-mini-value" id="sumStatus">Aguardando</div></div>
        </div>
      </div>

      <div class="base-card">
        <h3 style="margin-top:0">Retorno da importação</h3>
        <div id="feedback" class="base-status">Selecione um arquivo e clique em "Importar patrimônios".</div>
        <p style="margin:12px 0 0;opacity:.75;font-size:.95rem">A importação limpa o snapshot atual, grava histórico pela data real do upload e ajusta a regional dos veículos pela regional do leitor.</p>
      </div>
    </section>
  `;

  const fileInput = document.getElementById('arquivoExcel');
  const origemInput = document.getElementById('origemCarga');
  const nomeAbaInput = document.getElementById('nomeAba');
  const obsInput = document.getElementById('observacoes');
  const feedback = document.getElementById('feedback');
  const btnImportar = document.getElementById('btnImportar');
  const btnLimpar = document.getElementById('btnLimpar');

  btnLimpar.addEventListener('click', () => {
    fileInput.value = '';
    origemInput.value = 'upload_manual';
    nomeAbaInput.value = 'Patrimônios';
    obsInput.value = '';
    feedback.textContent = 'Selecione um arquivo e clique em "Importar patrimônios".';
    setSummary({});
  });

  btnImportar.addEventListener('click', async () => {
    let importacaoId = null;
    try {
      btnImportar.disabled = true;
      btnLimpar.disabled = true;

      const file = fileInput.files?.[0];
      const origem = origemInput.value || 'upload_manual';
      const observacoes = obsInput.value?.trim() || null;
      const nomeAbaEsperada = normalizeText(nomeAbaInput.value) || 'Patrimônios';
      const dataUpload = new Date().toISOString();

      if (!file) throw new Error('Selecione o arquivo Excel.');

      setSummary({ linhas: 0, validas: 0, status: 'Lendo arquivo' });
      feedback.textContent = 'Lendo arquivo Excel...';

      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
      const selectedSheetName = workbook.SheetNames.find((name) => normalizeKey(name) === normalizeKey(nomeAbaEsperada)) || workbook.SheetNames[0];
      const sheet = workbook.Sheets[selectedSheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });

      if (!rows.length) throw new Error('A planilha está vazia.');

      validateRows(rows);
      setSummary({ linhas: rows.length, validas: 0, status: 'Preparando' });

      const { data: importacao, error: impError } = await supabase
        .from('patrimonios_importacoes')
        .insert({
          nome_arquivo: file.name,
          data_upload: dataUpload,
          origem,
          status: 'processando',
          total_linhas: rows.length,
          total_importadas: 0,
          total_erros: 0,
          observacoes,
          criado_por: ctx?.user?.id || null,
          criado_por_nome: ctx?.user?.name || ctx?.user?.email || null
        })
        .select('id')
        .single();

      if (impError) throw impError;
      importacaoId = importacao.id;

      const mappedRaw = rows
        .map((row) => mapRow(row, importacaoId, dataUpload))
        .filter((row) => row.patrimonio_codigo);

      const uniqueMap = new Map();
      let duplicadosIgnorados = 0;
      for (const item of mappedRaw) {
        const key = item.patrimonio_codigo;
        if (!key) continue;
        if (uniqueMap.has(key)) duplicadosIgnorados += 1;
        uniqueMap.set(key, item);
      }
      const mapped = Array.from(uniqueMap.values());

      setSummary({ linhas: rows.length, validas: mapped.length, status: 'Limpando snapshot' });
      feedback.textContent = [
        'Importação criada.',
        `Aba usada: ${selectedSheetName}`,
        `Duplicados ignorados no arquivo: ${duplicadosIgnorados}`,
        'Limpando snapshot atual...'
      ].join('\n');

      const { error: deleteError } = await supabase.rpc('limpar_patrimonios_snapshot');
      if (deleteError) throw deleteError;

      setSummary({ linhas: rows.length, validas: mapped.length, status: 'Importando snapshot' });
      await upsertBatches('patrimonios_snapshot', mapped, 500, (done, total, loteAtual, totalLotes) => {
        feedback.textContent = [
          'Importando snapshot de patrimônios...',
          `ID: ${importacaoId}`,
          `Aba usada: ${selectedSheetName}`,
          `Data do upload: ${dataUpload}`,
          `Lote: ${loteAtual}/${totalLotes}`,
          `Progresso: ${done}/${total}`
        ].join('\n');
      });

      await upsertBatches('patrimonios_historico_leituras', mapped, 500, (done, total, loteAtual, totalLotes) => {
        feedback.textContent = [
          'Gravando histórico diário de patrimônios...',
          `ID: ${importacaoId}`,
          `Data do upload: ${dataUpload}`,
          `Lote: ${loteAtual}/${totalLotes}`,
          `Progresso: ${done}/${total}`
        ].join('\n');
      });

      feedback.textContent = [
        'Associando veículos da frota pela placa na Identificação...',
        `ID: ${importacaoId}`,
        `Aba usada: ${selectedSheetName}`
      ].join('\n');

      let frotaPatrimonioSync = null;
      try {
        const { data: syncData, error: syncError } = await supabase.rpc('sincronizar_frotas_veiculos_patrimonios');
        if (syncError) console.warn('[PATRIMONIOS] Falha ao associar patrimônios aos veículos:', syncError);
        else frotaPatrimonioSync = syncData || null;
      } catch (syncErr) {
        console.warn('[PATRIMONIOS] Falha ao associar patrimônios aos veículos:', syncErr);
      }

      feedback.textContent = [
        'Ajustando regional dos veículos pela regional do leitor...',
        `ID: ${importacaoId}`,
        `Aba usada: ${selectedSheetName}`
      ].join('\n');

      let regionalSync = { veiculos_regionais_atualizados: 0, leituras_com_placa: 0 };
      try {
        regionalSync = await sincronizarRegionaisVeiculosPorLeitura(mapped);
      } catch (regionalErr) {
        console.warn('[PATRIMONIOS] Falha ao ajustar regional dos veículos:', regionalErr);
      }

      const { error: updError } = await supabase
        .from('patrimonios_importacoes')
        .update({
          status: 'concluido',
          total_importadas: mapped.length,
          total_erros: Math.max(rows.length - mapped.length, 0),
          observacoes: [
            observacoes,
            duplicadosIgnorados > 0 ? `Duplicados ignorados no arquivo: ${duplicadosIgnorados}` : null,
            `Regionais de veículos ajustadas: ${Number(regionalSync.veiculos_regionais_atualizados || 0)}`
          ].filter(Boolean).join(' | ') || null
        })
        .eq('id', importacaoId);

      if (updError) throw updError;

      setSummary({ linhas: rows.length, validas: mapped.length, status: 'Concluído' });
      feedback.textContent = [
        'Importação concluída com sucesso.',
        '',
        `ID da importação: ${importacaoId}`,
        `Arquivo: ${file.name}`,
        `Aba usada: ${selectedSheetName}`,
        `Data do upload: ${dataUpload}`,
        `Linhas lidas: ${rows.length}`,
        `Linhas válidas: ${mapped.length}`,
        `Duplicados ignorados: ${duplicadosIgnorados}`,
        `Motoristas associados em Frotas: ${Number(frotaPatrimonioSync?.veiculos_atualizados || 0)}`,
        `Leituras com placa detectada: ${Number(regionalSync.leituras_com_placa || 0)}`,
        `Regionais de veículos ajustadas: ${Number(regionalSync.veiculos_regionais_atualizados || 0)}`
      ].join('\n');
      fileInput.value = '';
    } catch (err) {
      console.error(err);
      if (importacaoId) {
        await supabase
          .from('patrimonios_importacoes')
          .update({ status: 'erro', observacoes: safeErrorMessage(err) })
          .eq('id', importacaoId);
      }
      setSummary({ status: 'Erro' });
      feedback.textContent = `Erro na importação:\n${safeErrorMessage(err)}`;
    } finally {
      btnImportar.disabled = false;
      btnLimpar.disabled = false;
    }
  });
});
