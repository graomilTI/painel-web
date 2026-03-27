import { requireAuth } from './authGuard.js';
import { supabase } from './supabaseClient.js';

function formatDateTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('pt-BR');
}

function makeCell(text) {
  const td = document.createElement('td');
  td.textContent = text ?? '';
  return td;
}

function makeStatusPill(status) {
  const td = document.createElement('td');
  const span = document.createElement('span');
  span.className = 'pill';
  span.textContent = status || '';
  td.appendChild(span);
  return td;
}

async function loadData() {
  const tbody = document.getElementById('tbodyImportacoes');
  const meta = document.getElementById('metaInfo');
  const filtroData = document.getElementById('filtroData').value;
  const filtroStatus = document.getElementById('filtroStatus').value;
  const filtroOrigem = document.getElementById('filtroOrigem').value;

  meta.textContent = 'Carregando histórico...';
  tbody.innerHTML = '';

  let query = supabase
    .from('producao_importacoes')
    .select(`
      *,
      profiles:importado_por (
        full_name,
        email
      )
    `)
    .order('data_referencia', { ascending: false })
    .order('created_at', { ascending: false });

  if (filtroData) query = query.eq('data_referencia', filtroData);
  if (filtroStatus) query = query.eq('status', filtroStatus);
  if (filtroOrigem) query = query.eq('origem', filtroOrigem);

  const { data, error } = await query;
  if (error) throw error;

  if (!data.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 8;
    td.textContent = 'Nenhuma importação encontrada.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    meta.textContent = '0 importações localizadas.';
    return;
  }

  data.forEach((row) => {
    const tr = document.createElement('tr');
    tr.appendChild(makeCell(row.data_referencia));
    tr.appendChild(makeCell(row.arquivo_nome));
    tr.appendChild(makeCell(row.origem));
    tr.appendChild(makeStatusPill(row.status));
    tr.appendChild(makeCell(row.total_linhas));
    tr.appendChild(makeCell(formatDateTime(row.created_at)));
    tr.appendChild(makeCell(row.profiles?.full_name || row.profiles?.email || ''));
    tr.appendChild(makeCell(row.observacoes || ''));
    tbody.appendChild(tr);
  });

  meta.textContent = `${data.length} importação(ões) encontrada(s).`;
}

async function run() {
  await requireAuth();
  document.getElementById('btnBuscar')?.addEventListener('click', loadData);
  await loadData();
}

run().catch((err) => {
  console.error(err);
  document.getElementById('metaInfo').textContent = `Erro ao carregar histórico: ${err.message || err}`;
});
