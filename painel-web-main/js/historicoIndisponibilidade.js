import { requireAuth } from './authGuard.js';
import { supabase } from './supabaseClient.js';

function cell(text) {
  const td = document.createElement('td');
  td.textContent = text ?? '';
  return td;
}

function formatDateTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('pt-BR');
}

async function carregarHistorico() {
  const tbody = document.getElementById('tbodyHistorico');
  const meta = document.getElementById('metaHistorico');

  const fNome = document.getElementById('fNome').value.trim();
  const fMotivo = document.getElementById('fMotivo').value;
  const fInicio = document.getElementById('fInicio').value;
  const fFim = document.getElementById('fFim').value;

  tbody.innerHTML = '';
  meta.textContent = 'Carregando histórico...';

  let query = supabase
    .from('indisponibilidades')
    .select(`
      *,
      profiles:created_by (
        full_name,
        email
      )
    `)
    .order('data_inicio', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1000);

  if (fNome) query = query.ilike('colaborador_nome', `%${fNome}%`);
  if (fMotivo) query = query.eq('motivo', fMotivo);
  if (fInicio) query = query.gte('data_inicio', fInicio);
  if (fFim) query = query.lte('data_fim', fFim);

  const { data, error } = await query;
  if (error) {
    meta.textContent = `Erro ao carregar histórico: ${error.message}`;
    return;
  }

  if (!data.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 8;
    td.textContent = 'Nenhum registro encontrado.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    meta.textContent = '0 registro(s) encontrado(s).';
    return;
  }

  data.forEach((row) => {
    const tr = document.createElement('tr');
    tr.appendChild(cell(row.colaborador_nome));
    tr.appendChild(cell(row.colaborador_cpf));
    tr.appendChild(cell(row.data_inicio));
    tr.appendChild(cell(row.data_fim));
    tr.appendChild(cell(row.motivo));
    tr.appendChild(cell(row.observacoes));
    tr.appendChild(cell(formatDateTime(row.created_at)));
    tr.appendChild(cell(row.profiles?.full_name || row.profiles?.email || ''));
    tbody.appendChild(tr);
  });

  meta.textContent = `${data.length} registro(s) encontrado(s).`;
}

async function run() {
  await requireAuth();
  document.getElementById('btnPesquisar').addEventListener('click', carregarHistorico);
  await carregarHistorico();
}

run().catch(console.error);
