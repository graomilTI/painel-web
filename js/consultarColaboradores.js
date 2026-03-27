import { requireAuth } from './authGuard.js';
import { supabase } from './supabaseClient.js';

function makeCell(text) {
  const td = document.createElement('td');
  td.textContent = text ?? '';
  return td;
}

function normalizeCpfInput(value) {
  return String(value || '').replace(/\D/g, '');
}

async function getLatestReferenceDate() {
  const { data, error } = await supabase
    .from('colaborador_importacoes')
    .select('data_referencia')
    .eq('status', 'processado')
    .order('data_referencia', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.data_referencia || null;
}

async function loadData() {
  const tbody = document.getElementById('tbodyColaboradores');
  const meta = document.getElementById('metaConsulta');

  let fData = document.getElementById('fData').value;
  const fCoordenacao = document.getElementById('fCoordenacao').value.trim();
  const fSupervisao = document.getElementById('fSupervisao').value.trim();
  const fNome = document.getElementById('fNome').value.trim();
  const fSituacao = document.getElementById('fSituacao').value.trim();
  const fEmpresa = document.getElementById('fEmpresa').value.trim();
  const fTipo = document.getElementById('fTipo').value.trim();
  const fCpf = normalizeCpfInput(document.getElementById('fCpf').value);

  if (!fData) {
    fData = await getLatestReferenceDate();
    if (fData) document.getElementById('fData').value = fData;
  }

  tbody.innerHTML = '';
  meta.textContent = 'Consultando base...';

  let query = supabase
    .from('colaborador_snapshot')
    .select(`
      data_referencia,
      cpf,
      nome,
      situacao,
      empresa,
      coordenacao,
      supervisao,
      cargo,
      cidade,
      tipo,
      email_empresa,
      whatsapp
    `)
    .order('nome', { ascending: true })
    .limit(1000);

  if (fData) query = query.eq('data_referencia', fData);
  if (fCoordenacao) query = query.ilike('coordenacao', `%${fCoordenacao}%`);
  if (fSupervisao) query = query.ilike('supervisao', `%${fSupervisao}%`);
  if (fNome) query = query.ilike('nome', `%${fNome}%`);
  if (fSituacao) query = query.ilike('situacao', `%${fSituacao}%`);
  if (fEmpresa) query = query.ilike('empresa', `%${fEmpresa}%`);
  if (fTipo) query = query.ilike('tipo', `%${fTipo}%`);
  if (fCpf) query = query.eq('cpf', fCpf);

  const { data, error } = await query;

  if (error) throw error;

  if (!data.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 12;
    td.textContent = 'Nenhum colaborador encontrado com os filtros informados.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    meta.textContent = '0 registro(s) localizado(s).';
    return;
  }

  data.forEach((row) => {
    const tr = document.createElement('tr');
    tr.appendChild(makeCell(row.data_referencia));
    tr.appendChild(makeCell(row.cpf));
    tr.appendChild(makeCell(row.nome));
    tr.appendChild(makeCell(row.situacao));
    tr.appendChild(makeCell(row.empresa));
    tr.appendChild(makeCell(row.coordenacao));
    tr.appendChild(makeCell(row.supervisao));
    tr.appendChild(makeCell(row.cargo));
    tr.appendChild(makeCell(row.cidade));
    tr.appendChild(makeCell(row.tipo));
    tr.appendChild(makeCell(row.email_empresa));
    tr.appendChild(makeCell(row.whatsapp));
    tbody.appendChild(tr);
  });

  meta.textContent = `${data.length} registro(s) localizado(s).`;
}

async function run() {
  await requireAuth();
  document.getElementById('btnPesquisar')?.addEventListener('click', loadData);
  await loadData();
}

run().catch((err) => {
  console.error(err);
  const meta = document.getElementById('metaConsulta');
  if (meta) meta.textContent = `Erro ao consultar base: ${err.message || err}`;
});
