import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { toPanelUrl } from './paths.js';
import JSZip from 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';

const state = {
  patrimonios: [],
  colaboradores: [],
  collaboratorMap: new Map(),
  coordenacoes: [],
  currentReport: null
};

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isAdministrative(cargo) {
  const c = normalizeKey(cargo);
  return c === 'administrativo' || c.includes('administrativo');
}

function getLimitDays(cargo) {
  return isAdministrative(cargo) ? 30 : 10;
}

function deriveAtivo(info) {
  if (!info) return null;
  if (typeof info.ativo === 'boolean') return info.ativo;

  const situacao = normalizeKey(info.situacao);
  if (!situacao) return null;
  if (situacao === 'ativo') return true;
  if (situacao === 'inativo') return false;
  if (situacao.includes('nao ativo') || situacao.includes('não ativo')) return false;
  if (situacao.includes('deslig')) return false;
  return null;
}

function isMaterialIgnored(row) {
  const s = normalizeKey(row?.situacao);
  return s === 'baixado' || s === 'manutencao' || s === 'manutenção';
}

function materialDias(row) {
  const value = Number(row?.dias_sem_leitura);
  return Number.isFinite(value) ? value : 0;
}

function collaboratorInfoByName(nome) {
  return state.collaboratorMap.get(normalizeKey(nome)) || null;
}

function matchesStatusFilter(info, filter) {
  if (filter === 'todos') return true;
  const ativo = deriveAtivo(info);
  if (ativo === null) return false;
  return filter === 'ativos' ? ativo === true : ativo === false;
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('pt-BR');
}

function formatPercent(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${Math.round(n * 100)}%` : '0%';
}

function formatCoord(coord) {
  return normalizeText(coord) || 'Sem coordenação';
}

function formatSupervisao(sup) {
  return normalizeText(sup) || 'Sem supervisão';
}

function slugify(value) {
  return normalizeKey(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'relatorio';
}

function compareText(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'pt-BR', { sensitivity: 'base' });
}

async function loadSnapshots() {
  const [{ data: patrimonios, error: patError }, { data: colaboradores, error: colError }] = await Promise.all([
    supabase
      .from('patrimonios_snapshot')
      .select('*')
      .order('coordenacao', { ascending: true })
      .order('supervisao', { ascending: true })
      .order('funcionario', { ascending: true }),
    supabase
      .from('colaborador_snapshot')
      .select('nome, situacao, cargo, coordenacao, supervisao, ativo')
      .order('nome', { ascending: true })
  ]);

  if (patError) throw patError;
  if (colError) throw colError;

  state.patrimonios = patrimonios || [];
  state.colaboradores = colaboradores || [];
  state.collaboratorMap = new Map((colaboradores || []).map((item) => [normalizeKey(item.nome), item]));

  const coords = new Set(['TODAS']);
  state.patrimonios.forEach((row) => coords.add(formatCoord(row.coordenacao)));
  state.colaboradores.forEach((row) => coords.add(formatCoord(row.coordenacao)));
  state.coordenacoes = Array.from(coords).sort((a, b) => (a === 'TODAS' ? -1 : b === 'TODAS' ? 1 : compareText(a, b)));
}

function filteredPatrimoniosRows(coord, filtroLeitura, statusFiltro) {
  return state.patrimonios
    .filter((row) => !isMaterialIgnored(row))
    .filter((row) => coord === 'TODAS' || formatCoord(row.coordenacao) === coord)
    .filter((row) => {
      const info = collaboratorInfoByName(row.funcionario);
      return matchesStatusFilter(info, statusFiltro);
    })
    .filter((row) => {
      if (filtroLeitura !== 'atrasado') return true;
      const info = collaboratorInfoByName(row.funcionario);
      return materialDias(row) > getLimitDays(info?.cargo);
    });
}

function buildPatrimoniosReport(coord, filtroLeitura, statusFiltro) {
  const baseRows = filteredPatrimoniosRows(coord, 'todos', statusFiltro);
  const rows = filteredPatrimoniosRows(coord, filtroLeitura, statusFiltro)
    .map((row) => {
      const info = collaboratorInfoByName(row.funcionario);
      const limite = getLimitDays(info?.cargo);
      return {
        patrimonio_codigo: row.patrimonio_codigo || '-',
        coordenacao: formatCoord(row.coordenacao || info?.coordenacao),
        supervisao: formatSupervisao(row.supervisao || info?.supervisao),
        funcionario: row.funcionario || '-',
        identificacao: row.identificacao || '-',
        categoria: row.categoria || '-',
        marca: row.marca || '-',
        modelo: row.modelo || '-',
        situacao_material: row.situacao || '-',
        ultima_leitura: formatDateTime(row.ultima_leitura),
        dias_sem_leitura: materialDias(row),
        limite_dias: limite,
        situacao_colaborador: info?.situacao || 'Não localizado na base'
      };
    })
    .sort((a, b) => compareText(a.coordenacao, b.coordenacao) || compareText(a.supervisao, b.supervisao) || compareText(a.funcionario, b.funcionario) || compareText(a.patrimonio_codigo, b.patrimonio_codigo));

  const totalCoord = baseRows.length;
  const emDia = baseRows.filter((row) => {
    const info = collaboratorInfoByName(row.funcionario);
    return materialDias(row) <= getLimitDays(info?.cargo);
  }).length;

  return {
    type: 'patrimonios',
    title: `Patrimônios${coord !== 'TODAS' ? ` · ${coord}` : ' · Todas as coordenações'}`,
    subtitle: `Filtro: ${filtroLeitura === 'atrasado' ? 'Somente leitura em atraso' : 'Todos os equipamentos'} · Situação: ${statusFiltro}`,
    stats: {
      total: rows.length,
      referencia: totalCoord,
      percentualEmDia: totalCoord ? emDia / totalCoord : 0,
      resumo: `${rows.length} registro(s) exibidos`
    },
    columns: [
      ['patrimonio_codigo', 'Patrimônio'],
      ['coordenacao', 'Coordenação'],
      ['supervisao', 'Supervisão'],
      ['funcionario', 'Funcionário'],
      ['identificacao', 'Identificação'],
      ['categoria', 'Categoria'],
      ['marca', 'Marca'],
      ['modelo', 'Modelo'],
      ['situacao_material', 'Situação material'],
      ['ultima_leitura', 'Última leitura'],
      ['dias_sem_leitura', 'Dias sem leitura'],
      ['limite_dias', 'Limite'],
      ['situacao_colaborador', 'Situação colaborador']
    ],
    rows,
    fileBase: `patrimonios-${coord}-${filtroLeitura}-${statusFiltro}`
  };
}

function buildEquipamentosReport(coord, filtroLeitura, statusFiltro) {
  const patrByName = new Map();

  state.patrimonios
    .filter((row) => !isMaterialIgnored(row))
    .forEach((row) => {
      const key = normalizeKey(row.funcionario);
      if (!key) return;
      const current = patrByName.get(key) || [];
      current.push(row);
      patrByName.set(key, current);
    });

  const rows = [];

  state.colaboradores.forEach((colab) => {
    const key = normalizeKey(colab.nome);
    const relacionados = (patrByName.get(key) || []).filter((row) => coord === 'TODAS' || formatCoord(row.coordenacao || colab.coordenacao) === coord);
    const ativo = matchesStatusFilter(colab, statusFiltro);
    if (!ativo) return;

    if (deriveAtivo(colab) === false && !relacionados.length) return;

    const limite = getLimitDays(colab.cargo);
    const diasMax = relacionados.reduce((max, row) => Math.max(max, materialDias(row)), 0);
    const emAtraso = relacionados.filter((row) => materialDias(row) > limite).length;

    if (filtroLeitura === 'atrasado' && !(diasMax > limite || emAtraso > 0)) return;

    rows.push({
      coordenacao: formatCoord(colab.coordenacao || relacionados[0]?.coordenacao),
      supervisao: formatSupervisao(colab.supervisao || relacionados[0]?.supervisao),
      nome: colab.nome || '-',
      qtd_patrimonios: relacionados.length,
      em_atraso: emAtraso,
      status: colab.situacao || 'Sem status',
      dias_atraso: diasMax,
      limite_dias: limite
    });
  });

  // fallback para colaboradores que constam no snapshot patrimonial e não estão na base de colaboradores
  patrByName.forEach((relacionados, key) => {
    if (state.collaboratorMap.has(key)) return;
    const validos = relacionados.filter((row) => coord === 'TODAS' || formatCoord(row.coordenacao) === coord);
    if (!validos.length) return;

    const diasMax = validos.reduce((max, row) => Math.max(max, materialDias(row)), 0);
    if (filtroLeitura === 'atrasado' && diasMax <= 10) return;

    rows.push({
      coordenacao: formatCoord(validos[0]?.coordenacao),
      supervisao: formatSupervisao(validos[0]?.supervisao),
      nome: validos[0]?.funcionario || '-',
      qtd_patrimonios: validos.length,
      em_atraso: validos.filter((row) => materialDias(row) > 10).length,
      status: 'Não localizado na base',
      dias_atraso: diasMax,
      limite_dias: 10
    });
  });

  rows.sort((a, b) => compareText(a.coordenacao, b.coordenacao) || compareText(a.supervisao, b.supervisao) || compareText(a.nome, b.nome));

  const total = rows.length;
  const emDia = rows.filter((row) => row.dias_atraso <= row.limite_dias).length;

  return {
    type: 'equipamentos',
    title: `Equipamentos${coord !== 'TODAS' ? ` · ${coord}` : ' · Todas as coordenações'}`,
    subtitle: `Filtro: ${filtroLeitura === 'atrasado' ? 'Somente leitura em atraso' : 'Todos os colaboradores'} · Situação: ${statusFiltro}`,
    stats: {
      total,
      referencia: total,
      percentualEmDia: total ? emDia / total : 0,
      resumo: `${total} colaborador(es) na visão de equipamentos`
    },
    columns: [
      ['coordenacao', 'Coordenação'],
      ['supervisao', 'Supervisão'],
      ['nome', 'Nome'],
      ['qtd_patrimonios', 'Qtd. patrimônios'],
      ['em_atraso', 'Em atraso'],
      ['status', 'Status'],
      ['dias_atraso', 'Dias de atraso'],
      ['limite_dias', 'Limite']
    ],
    rows,
    fileBase: `equipamentos-${coord}-${filtroLeitura}-${statusFiltro}`
  };
}

function buildStatusReport(coord, _filtroLeitura, statusFiltro) {
  const grouped = new Map();

  state.patrimonios
    .filter((row) => !isMaterialIgnored(row))
    .filter((row) => coord === 'TODAS' || formatCoord(row.coordenacao) === coord)
    .forEach((row) => {
      const info = collaboratorInfoByName(row.funcionario);
      if (!matchesStatusFilter(info, statusFiltro)) return;

      const supervisao = formatSupervisao(row.supervisao || info?.supervisao);
      const coordenacao = formatCoord(row.coordenacao || info?.coordenacao);
      const key = `${coordenacao}__${supervisao}`;
      const current = grouped.get(key) || { coordenacao, supervisao, cadastros: 0, leitura: 0 };

      current.cadastros += 1;
      if (materialDias(row) <= getLimitDays(info?.cargo)) current.leitura += 1;
      grouped.set(key, current);
    });

  const rows = Array.from(grouped.values())
    .map((item) => ({
      coordenacao: item.coordenacao,
      supervisao: item.supervisao,
      cadastros: item.cadastros,
      leitura: item.leitura,
      percentual: item.cadastros ? item.leitura / item.cadastros : 0
    }))
    .sort((a, b) => compareText(a.coordenacao, b.coordenacao) || compareText(a.supervisao, b.supervisao));

  return {
    type: 'status',
    title: `Status Grãomil${coord !== 'TODAS' ? ` · ${coord}` : ''}`,
    subtitle: `Indicador consolidado por supervisão · Situação: ${statusFiltro}`,
    stats: {
      total: rows.length,
      referencia: rows.reduce((sum, row) => sum + row.cadastros, 0),
      percentualEmDia: rows.length ? rows.reduce((sum, row) => sum + row.percentual, 0) / rows.length : 0,
      resumo: `${rows.length} supervisão(ões) consolidadas`
    },
    columns: [
      ['coordenacao', 'Coordenação'],
      ['supervisao', 'Supervisão'],
      ['cadastros', 'Cadastros'],
      ['leitura', 'Leitura'],
      ['percentual_formatado', '%']
    ],
    rows: rows.map((row) => ({ ...row, percentual_formatado: formatPercent(row.percentual) })),
    fileBase: `status-${coord}-${statusFiltro}`
  };
}

function buildReport(type, coord, filtroLeitura, statusFiltro) {
  if (type === 'equipamentos') return buildEquipamentosReport(coord, filtroLeitura, statusFiltro);
  if (type === 'status') return buildStatusReport(coord, filtroLeitura, statusFiltro);
  return buildPatrimoniosReport(coord, filtroLeitura, statusFiltro);
}

function reportToCsv(report) {
  const header = report.columns.map(([, label]) => label).join(';');
  const lines = report.rows.map((row) => report.columns.map(([field]) => {
    const value = row[field] ?? '';
    const safe = String(value).replace(/"/g, '""');
    return /[;"\n]/.test(safe) ? `"${safe}"` : safe;
  }).join(';'));

  return [header, ...lines].join('\n');
}

function reportToHtml(report) {
  const rowsHtml = report.rows.length
    ? report.rows.map((row) => `
        <tr>${report.columns.map(([field]) => `<td>${row[field] ?? ''}</td>`).join('')}</tr>
      `).join('')
    : `<tr><td colspan="${report.columns.length}" style="text-align:center;padding:24px;color:#64748b">Nenhum registro encontrado para os filtros escolhidos.</td></tr>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>${report.title}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; margin: 24px; color: #0f172a; }
  h1 { margin: 0 0 8px; font-size: 28px; }
  p { margin: 0 0 8px; color: #475569; }
  .meta { display: flex; gap: 18px; flex-wrap: wrap; margin: 18px 0 22px; }
  .meta div { padding: 12px 14px; border: 1px solid #cbd5e1; border-radius: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; vertical-align: top; }
  th { background: #e2e8f0; text-transform: uppercase; letter-spacing: .04em; font-size: 11px; }
  @media print { body { margin: 10mm; } }
</style>
</head>
<body>
  <h1>${report.title}</h1>
  <p>${report.subtitle}</p>
  <div class="meta">
    <div><strong>Registros:</strong> ${report.stats.total}</div>
    <div><strong>Base:</strong> ${report.stats.referencia}</div>
    <div><strong>% em dia:</strong> ${formatPercent(report.stats.percentualEmDia)}</div>
  </div>
  <table>
    <thead><tr>${report.columns.map(([, label]) => `<th>${label}</th>`).join('')}</tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</body>
</html>`;
}

function renderPreview(report) {
  state.currentReport = report;

  document.getElementById('kpiTotal').textContent = String(report.stats.total);
  document.getElementById('kpiBase').textContent = String(report.stats.referencia);
  document.getElementById('kpiPercentual').textContent = formatPercent(report.stats.percentualEmDia);
  document.getElementById('reportFeedback').textContent = report.rows.length
    ? `${report.rows.length} registro(s) carregados para ${report.title}.`
    : 'Nenhum dado encontrado com os filtros atuais.';

  const header = report.columns.map(([, label]) => `<th>${label}</th>`).join('');
  const body = report.rows.length
    ? report.rows.map((row) => `<tr>${report.columns.map(([field]) => `<td>${row[field] ?? '-'}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${report.columns.length}" style="text-align:center;padding:28px;">Nenhum registro encontrado.</td></tr>`;

  document.getElementById('previewHeader').innerHTML = header;
  document.getElementById('previewBody').innerHTML = body;
  document.getElementById('previewTitle').textContent = report.title;
  document.getElementById('previewSubtitle').textContent = report.subtitle;
}

function fillCoordOptions() {
  const select = document.getElementById('coordSelect');
  select.innerHTML = state.coordenacoes.map((coord) => `<option value="${coord}">${coord}</option>`).join('');
}

function updateFilterVisibility() {
  const type = document.getElementById('tipoRelatorio').value;
  const filtroField = document.getElementById('filtroLeituraWrap');
  filtroField.style.display = type === 'status' ? 'none' : '';
}

function getCurrentFilters() {
  return {
    type: document.getElementById('tipoRelatorio').value,
    coord: document.getElementById('coordSelect').value || 'TODAS',
    filtroLeitura: document.getElementById('filtroLeitura').value,
    statusFiltro: document.getElementById('statusFiltro').value
  };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 800);
}

async function refreshPreview() {
  const filters = getCurrentFilters();
  const report = buildReport(filters.type, filters.coord, filters.filtroLeitura, filters.statusFiltro);
  renderPreview(report);
}

function printCurrentReport() {
  if (!state.currentReport) return;
  const win = window.open('', '_blank', 'width=1200,height=860');
  if (!win) {
    alert('Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-up.');
    return;
  }
  win.document.open();
  win.document.write(reportToHtml(state.currentReport));
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

function exportCurrentCsv() {
  if (!state.currentReport) return;
  const blob = new Blob([reportToCsv(state.currentReport)], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, `${state.currentReport.fileBase}.csv`);
}

async function exportZipByCoord() {
  const filters = getCurrentFilters();
  const coords = state.coordenacoes.filter((coord) => coord !== 'TODAS');
  if (!coords.length) {
    alert('Nenhuma coordenação encontrada para gerar lote.');
    return;
  }

  const zip = new JSZip();
  coords.forEach((coord) => {
    const report = buildReport(filters.type, coord, filters.filtroLeitura, filters.statusFiltro);
    zip.file(`${slugify(report.fileBase)}.html`, reportToHtml(report));
  });

  const overview = buildReport(filters.type, 'TODAS', filters.filtroLeitura, filters.statusFiltro);
  zip.file(`${slugify(overview.fileBase)}.html`, reportToHtml(overview));

  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, `${slugify(filters.type)}-relatorios.zip`);
}

function setBusy(value) {
  ['btnAtualizarPreview', 'btnImprimir', 'btnCsv', 'btnZip', 'tipoRelatorio', 'coordSelect', 'filtroLeitura', 'statusFiltro'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = value;
  });
}

initProtectedPage('Relatórios de Patrimônios', async (content) => {
  content.innerHTML = `
    <section class="base-page">
      <div class="section-heading">
        <div>
          <h2>Relatórios de Patrimônios</h2>
          <p class="section-subtitle">
            Geração operacional baseada nos scripts enviados: visão de Patrimônios, Equipamentos e Status Grãomil, com filtros por coordenação, atraso e situação.
          </p>
        </div>
        <div class="inline-nav">
          <a href="${toPanelUrl('adm-patrimonio')}">Painel de Patrimônios</a>
          <a href="${toPanelUrl('patrimonio-relatorios')}" class="active">Relatórios</a>
          <a href="${toPanelUrl('importar-patrimonios')}">Importar arquivo</a>
        </div>
      </div>

      <div class="base-card">
        <div class="base-grid">
          <div class="base-field third">
            <label class="base-label" for="tipoRelatorio">Tipo de relatório</label>
            <select class="base-select" id="tipoRelatorio">
              <option value="patrimonios">PDF Patrimônios</option>
              <option value="equipamentos">PDF Equipamentos</option>
              <option value="status">PDF Grãomil (STATUS)</option>
            </select>
          </div>
          <div class="base-field third">
            <label class="base-label" for="coordSelect">Coordenação</label>
            <select class="base-select" id="coordSelect"></select>
          </div>
          <div class="base-field third" id="filtroLeituraWrap">
            <label class="base-label" for="filtroLeitura">Filtro de leitura</label>
            <select class="base-select" id="filtroLeitura">
              <option value="todos">Todos os registros</option>
              <option value="atrasado">Somente leitura em atraso</option>
            </select>
          </div>
          <div class="base-field third">
            <label class="base-label" for="statusFiltro">Situação do colaborador</label>
            <select class="base-select" id="statusFiltro">
              <option value="todos">Todos</option>
              <option value="ativos">Ativos</option>
              <option value="inativos">Inativos</option>
            </select>
          </div>
        </div>

        <div class="base-actions">
          <button class="base-button primary" id="btnAtualizarPreview">Atualizar prévia</button>
          <button class="base-button secondary" id="btnImprimir">Abrir versão para impressão</button>
          <button class="base-button secondary" id="btnCsv">Baixar CSV</button>
          <button class="base-button secondary" id="btnZip">Baixar ZIP por coordenação</button>
        </div>
      </div>

      <div class="base-summary">
        <div class="base-mini">
          <div class="base-mini-label">Registros exibidos</div>
          <div class="base-mini-value" id="kpiTotal">0</div>
        </div>
        <div class="base-mini">
          <div class="base-mini-label">Base usada</div>
          <div class="base-mini-value" id="kpiBase">0</div>
        </div>
        <div class="base-mini">
          <div class="base-mini-label">Percentual em dia</div>
          <div class="base-mini-value" id="kpiPercentual">0%</div>
        </div>
      </div>

      <div class="base-card">
        <h3 id="previewTitle" style="margin-top:0">Prévia do relatório</h3>
        <p class="section-subtitle" id="previewSubtitle">Carregando dados do snapshot...</p>
        <div id="reportFeedback" class="base-status" style="white-space:pre-line;margin:16px 0 0;">Preparando visão...</div>
        <div class="base-table-wrap" style="margin-top:18px;">
          <table class="base-table wide">
            <thead><tr id="previewHeader"></tr></thead>
            <tbody id="previewBody"></tbody>
          </table>
        </div>
      </div>
    </section>
  `;

  const typeSelect = document.getElementById('tipoRelatorio');
  const coordSelect = document.getElementById('coordSelect');
  const filtroLeitura = document.getElementById('filtroLeitura');
  const statusFiltro = document.getElementById('statusFiltro');
  const feedback = document.getElementById('reportFeedback');

  typeSelect.addEventListener('change', () => {
    updateFilterVisibility();
    refreshPreview();
  });
  coordSelect.addEventListener('change', refreshPreview);
  filtroLeitura.addEventListener('change', refreshPreview);
  statusFiltro.addEventListener('change', refreshPreview);

  document.getElementById('btnAtualizarPreview').addEventListener('click', refreshPreview);
  document.getElementById('btnImprimir').addEventListener('click', printCurrentReport);
  document.getElementById('btnCsv').addEventListener('click', exportCurrentCsv);
  document.getElementById('btnZip').addEventListener('click', async () => {
    try {
      setBusy(true);
      feedback.textContent = 'Gerando arquivos por coordenação...';
      await exportZipByCoord();
      feedback.textContent = 'ZIP gerado com sucesso. O arquivo contém versões HTML prontas para impressão por coordenação.';
    } catch (error) {
      console.error(error);
      feedback.textContent = `Erro ao gerar ZIP: ${error.message || error}`;
    } finally {
      setBusy(false);
    }
  });

  try {
    setBusy(true);
    feedback.textContent = 'Carregando snapshots de patrimônios e colaboradores...';
    await loadSnapshots();
    fillCoordOptions();
    updateFilterVisibility();
    await refreshPreview();
    feedback.textContent = 'Prévia pronta. Você pode imprimir, exportar CSV ou baixar lote por coordenação.';
  } catch (error) {
    console.error(error);
    feedback.textContent = `Erro ao carregar dados: ${error.message || error}`;
  } finally {
    setBusy(false);
  }
});
