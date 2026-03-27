import { requireAuth } from './authGuard.js';
import { supabase } from './supabaseClient.js';

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

async function getLatestDate(table) {
  const { data, error } = await supabase
    .from(table)
    .select('data_referencia')
    .eq('status', 'processado')
    .order('data_referencia', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.data_referencia || null;
}

async function fetchOptionalTable(table, dateField, dataReferencia) {
  try {
    let q = supabase.from(table).select('*');
    if (dateField && dataReferencia) q = q.eq(dateField, dataReferencia);
    const { data, error } = await q;
    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

function setSummary(data, total, status) {
  document.getElementById('sumData').textContent = data || '-';
  document.getElementById('sumTotal').textContent = String(total ?? 0);
  document.getElementById('sumStatus').textContent = status || 'Aguardando';
}

function renderRows(rows) {
  const tbody = document.getElementById('tbodyResultado');
  tbody.innerHTML = '';

  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.textContent = 'Nenhum colaborador localizado com os filtros/regras aplicados.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  rows.forEach((row) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.colaborador || ''}</td>
      <td>${row.coordenacao || ''}</td>
      <td>${row.supervisao || ''}</td>
      <td>${row.cargo || ''}</td>
      <td>${row.tipo || ''}</td>
      <td>${row.motivo || ''}</td>
    `;
    tbody.appendChild(tr);
  });
}

function downloadCanvas(canvas, filename) {
  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = filename;
  link.click();
}

function wrapText(ctx, text, maxWidth) {
  const words = String(text || '').split(' ');
  const lines = [];
  let line = '';

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    const width = ctx.measureText(testLine).width;
    if (width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = testLine;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function generateImage(rows, dataReferencia) {
  const canvas = document.getElementById('canvasImagem');
  const ctx = canvas.getContext('2d');

  const width = 1600;
  const margin = 40;
  const top = 52;
  const rowHeight = 34;
  const headerY = 170;
  const tableY = 220;
  const totalRows = Math.max(rows.length, 1);
  const height = tableY + (totalRows + 1) * rowHeight + 60;

  canvas.width = width;
  canvas.height = height;

  ctx.fillStyle = '#07152f';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#e5e7eb';
  ctx.font = 'bold 42px Arial';
  ctx.fillText('EFETIVOS SEM PRODUÇÃO', margin, top + 10);

  ctx.fillStyle = '#9fb1d1';
  ctx.font = '24px Arial';
  ctx.fillText(`Data: ${dataReferencia || '-'}`, margin, 110);
  ctx.fillText(`Total: ${rows.length}`, width - 220, 110);

  ctx.strokeStyle = '#16325f';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(margin, 130);
  ctx.lineTo(width - margin, 130);
  ctx.stroke();

  const col1 = margin;
  const col2 = 760;
  const col3 = 1130;

  ctx.fillStyle = '#c9d7f2';
  ctx.font = 'bold 22px Arial';
  ctx.fillText('Colaborador', col1, headerY);
  ctx.fillText('Coordenação', col2, headerY);
  ctx.fillText('Supervisão', col3, headerY);

  ctx.strokeStyle = '#16325f';
  ctx.beginPath();
  ctx.moveTo(margin, headerY + 16);
  ctx.lineTo(width - margin, headerY + 16);
  ctx.stroke();

  ctx.font = '20px Arial';
  rows.forEach((row, idx) => {
    const y = tableY + idx * rowHeight;

    if (idx % 2 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(margin - 12, y - 24, width - margin * 2 + 24, rowHeight);
    }

    ctx.fillStyle = '#e5e7eb';
    const nameLines = wrapText(ctx, row.colaborador, 640);
    ctx.fillText(nameLines[0] || '', col1, y);
    ctx.fillText(row.coordenacao || '', col2, y);
    ctx.fillText(row.supervisao || '', col3, y);
  });

  downloadCanvas(canvas, `efetivos-sem-producao-${dataReferencia || 'geral'}.png`);
}

async function maybeSaveResults(rows, dataReferencia) {
  try {
    await supabase.from('efetivos_sem_producao').delete().eq('data_referencia', dataReferencia);
    if (!rows.length) return;
    const payload = rows.map((r) => ({
      data_referencia: dataReferencia,
      colaborador: r.colaborador,
      coordenacao: r.coordenacao,
      supervisao: r.supervisao,
      cargo: r.cargo,
      tipo: r.tipo,
      motivo: r.motivo
    }));
    await supabase.from('efetivos_sem_producao').insert(payload);
  } catch (err) {
    console.warn('Não foi possível salvar em efetivos_sem_producao:', err?.message || err);
  }
}

async function processDay() {
  const dataInput = document.getElementById('fData');
  let dataReferencia = dataInput.value;

  if (!dataReferencia) {
    dataReferencia = await getLatestDate('colaborador_importacoes');
    if (dataReferencia) dataInput.value = dataReferencia;
  }
  if (!dataReferencia) throw new Error('Informe a data de referência.');

  setSummary(dataReferencia, 0, 'Processando');
  document.getElementById('metaResultado').textContent = 'Carregando bases...';

  const { data: colaboradores, error: colErr } = await supabase
    .from('colaborador_snapshot')
    .select('*')
    .eq('data_referencia', dataReferencia);

  if (colErr) throw colErr;

  const { data: producao, error: prodErr } = await supabase
    .from('producao_snapshot')
    .select('*')
    .eq('data_referencia', dataReferencia);

  if (prodErr) throw prodErr;

  const excecoes = await fetchOptionalTable('excecoes', null, null);
  const indisponibilidades = await fetchOptionalTable('indisponibilidade', null, null);

  const excludedCoordenacoes = new Set([
    'GERAL',
    'MATRIZ GERAL',
    'MATRIZ',
    'ADMINISTRATIVO',
    'DIRETORIA'
  ]);

  const producedNames = new Set(
    (producao || [])
      .map((r) => normalizeName(r.funcionario))
      .filter(Boolean)
  );

  const excecoesSet = new Set(
    (excecoes || []).map((r) => normalizeName(r.Nome || r.nome))
  );

  const rows = (colaboradores || [])
    .filter((c) => (String(c.tipo || '').toUpperCase() === 'EFETIVO'))
    .filter((c) => normalizeName(c.cargo).includes('CLASSIFICADOR'))
    .filter((c) => !excludedCoordenacoes.has(normalizeName(c.coordenacao)))
    .filter((c) => c.ativo !== false)
    .filter((c) => !excecoesSet.has(normalizeName(c.nome)))
    .filter((c) => {
      const nome = normalizeName(c.nome);
      const ind = (indisponibilidades || []).find((r) => normalizeName(r.Nome || r.nome) === nome);
      if (!ind) return true;
      return false;
    })
    .filter((c) => !producedNames.has(normalizeName(c.nome)))
    .map((c) => ({
      colaborador: c.nome,
      coordenacao: c.coordenacao,
      supervisao: c.supervisao,
      cargo: c.cargo,
      tipo: c.tipo,
      motivo: 'Sem produção no dia'
    }))
    .sort((a, b) => {
      const ca = (a.coordenacao || '').localeCompare(b.coordenacao || '');
      if (ca !== 0) return ca;
      return (a.colaborador || '').localeCompare(b.colaborador || '');
    });

  await maybeSaveResults(rows, dataReferencia);
  window.__efetivosRows = rows;
  window.__efetivosDate = dataReferencia;
  setSummary(dataReferencia, rows.length, 'Concluído');
  renderRows(rows);
  document.getElementById('metaResultado').textContent = `${rows.length} colaborador(es) sem produção identificados.`;
}

function applyFilters(rows) {
  const fCoordenacao = document.getElementById('fCoordenacao').value.trim().toUpperCase();
  const fSupervisao = document.getElementById('fSupervisao').value.trim().toUpperCase();
  const fNome = document.getElementById('fNome').value.trim().toUpperCase();

  const filtered = (rows || []).filter((r) => {
    if (fCoordenacao && !String(r.coordenacao || '').toUpperCase().includes(fCoordenacao)) return false;
    if (fSupervisao && !String(r.supervisao || '').toUpperCase().includes(fSupervisao)) return false;
    if (fNome && !String(r.colaborador || '').toUpperCase().includes(fNome)) return false;
    return true;
  });

  renderRows(filtered);
  setSummary(window.__efetivosDate, filtered.length, 'Filtrado');
  document.getElementById('metaResultado').textContent = `${filtered.length} colaborador(es) após filtros.`;
  window.__filteredRows = filtered;
}

async function run() {
  await requireAuth();

  const dataInput = document.getElementById('fData');
  if (!dataInput.value) {
    const latest = await getLatestDate('colaborador_importacoes');
    if (latest) dataInput.value = latest;
  }

  document.getElementById('btnProcessar').addEventListener('click', async () => {
    try {
      await processDay();
      window.__filteredRows = window.__efetivosRows || [];
    } catch (err) {
      console.error(err);
      setSummary(document.getElementById('fData').value, 0, 'Erro');
      document.getElementById('metaResultado').textContent = `Erro ao processar: ${err.message || err}`;
    }
  });

  document.getElementById('btnPesquisar').addEventListener('click', () => {
    applyFilters(window.__efetivosRows || []);
  });

  document.getElementById('btnGerarImagem').addEventListener('click', () => {
    const rows = window.__filteredRows || window.__efetivosRows || [];
    if (!rows.length) {
      alert('Não há dados para gerar a imagem.');
      return;
    }
    generateImage(rows, window.__efetivosDate || document.getElementById('fData').value);
  });
}

function renderRows(rows) {
  const tbody = document.getElementById('tbodyResultado');
  tbody.innerHTML = '';

  if (!rows.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="6">Nenhum colaborador localizado.</td>';
    tbody.appendChild(tr);
    return;
  }

  rows.forEach((r) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.colaborador || ''}</td>
      <td>${r.coordenacao || ''}</td>
      <td>${r.supervisao || ''}</td>
      <td>${r.cargo || ''}</td>
      <td>${r.tipo || ''}</td>
      <td>${r.motivo || ''}</td>
    `;
    tbody.appendChild(tr);
  });
}

run().catch((err) => {
  console.error(err);
  document.getElementById('metaResultado').textContent = `Erro ao carregar página: ${err.message || err}`;
});
