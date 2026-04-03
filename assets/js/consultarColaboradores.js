import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { toPanelUrl } from './paths.js';

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

  const fCoordenacao = document.getElementById('fCoordenacao').value.trim();
  const fSupervisao = document.getElementById('fSupervisao').value.trim();
  const fNome = document.getElementById('fNome').value.trim();
  const fSituacao = document.getElementById('fSituacao').value;
  const fEmpresa = document.getElementById('fEmpresa').value.trim();
  const fTipo = document.getElementById('fTipo').value.trim();
  const fCpf = normalizeCpfInput(document.getElementById('fCpf').value);

  tbody.innerHTML = '';
  meta.textContent = 'Consultando base...';

  const latestReferenceDate = await getLatestReferenceDate();

  let query = supabase
    .from('colaborador_snapshot')
    .select(`
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

  if (latestReferenceDate) query = query.eq('data_referencia', latestReferenceDate);
  if (fCoordenacao) query = query.ilike('coordenacao', `%${fCoordenacao}%`);
  if (fSupervisao) query = query.ilike('supervisao', `%${fSupervisao}%`);
  if (fNome) query = query.ilike('nome', `%${fNome}%`);
  if (fSituacao && fSituacao !== 'Todos') query = query.eq('situacao', fSituacao);
  if (fEmpresa) query = query.ilike('empresa', `%${fEmpresa}%`);
  if (fTipo) query = query.ilike('tipo', `%${fTipo}%`);
  if (fCpf) query = query.eq('cpf', fCpf);

  const { data, error } = await query;
  if (error) throw error;

  if (!data.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 11;
    td.textContent = 'Nenhum colaborador encontrado com os filtros informados.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    meta.textContent = '0 registro(s) localizado(s).';
    return;
  }

  data.forEach((row) => {
    const tr = document.createElement('tr');
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

  meta.textContent = latestReferenceDate
    ? `${data.length} registro(s) localizado(s) na base mais recente.`
    : `${data.length} registro(s) localizado(s).`;
}

initProtectedPage('Consultar Base de Colaboradores', (content) => {
  content.innerHTML = `
    <section class="base-page">
      <div class="section-heading">
        <div>
          <h2>Consultar Base de Colaboradores</h2>
          <p class="section-subtitle">Filtre a base funcional por coordenação, supervisão e colaborador.</p>
        </div>
        <div class="inline-nav">
          <a href="${toPanelUrl('importar-colaboradores')}">Importar</a>
          <a class="active" href="${toPanelUrl('consultar-colaboradores')}">Consultar</a>
          <a href="${toPanelUrl('historico-colaboradores')}">Histórico</a>
        </div>
      </div>

      <div class="base-card">
        <div class="base-actions-row filters-5">
          <div>
            <label class="base-label" for="fCoordenacao">Coordenação</label>
            <input class="base-input" type="text" id="fCoordenacao" placeholder="Ex.: Operações" />
          </div>
          <div>
            <label class="base-label" for="fSupervisao">Supervisão</label>
            <input class="base-input" type="text" id="fSupervisao" placeholder="Ex.: Supervisão Sul" />
          </div>
          <div>
            <label class="base-label" for="fNome">Nome</label>
            <input class="base-input" type="text" id="fNome" placeholder="Buscar nome" />
          </div>
          <div>
            <label class="base-label" for="fSituacao">Situação</label>
            <select class="base-select" id="fSituacao">
              <option value="Todos">Todos</option>
              <option value="Ativo" selected>Ativo</option>
              <option value="Não Ativo">Não Ativo</option>
            </select>
          </div>
          <div>
            <label class="base-label" for="fEmpresa">Empresa</label>
            <input class="base-input" type="text" id="fEmpresa" placeholder="Empresa" />
          </div>
        </div>

        <div class="base-actions-row compact" style="margin-top:12px;">
          <div>
            <label class="base-label" for="fTipo">Tipo</label>
            <input class="base-input" type="text" id="fTipo" placeholder="Tipo" />
          </div>
          <div>
            <label class="base-label" for="fCpf">CPF</label>
            <input class="base-input" type="text" id="fCpf" placeholder="CPF" />
          </div>
          <div></div>
          <div style="display:flex; align-items:end;">
            <button class="base-button secondary inline" id="btnPesquisar">Pesquisar</button>
          </div>
        </div>

        <div class="base-table-wrap" style="margin-top:16px;">
          <table class="base-table wide">
            <thead>
              <tr>
                <th>CPF</th>
                <th>Nome</th>
                <th>Situação</th>
                <th>Empresa</th>
                <th>Coordenação</th>
                <th>Supervisão</th>
                <th>Cargo</th>
                <th>Cidade</th>
                <th>Tipo</th>
                <th>E-mail empresa</th>
                <th>Whatsapp</th>
              </tr>
            </thead>
            <tbody id="tbodyColaboradores"></tbody>
          </table>
        </div>

        <div class="base-meta" id="metaConsulta">Aguardando pesquisa.</div>
      </div>
    </section>
  `;

  document.getElementById('btnPesquisar')?.addEventListener('click', loadData);
  loadData().catch((err) => {
    console.error(err);
    const meta = document.getElementById('metaConsulta');
    if (meta) meta.textContent = `Erro ao consultar base: ${err.message || err}`;
  });
});
