(function () {
  const MODULE_NAME = 'FROTAS_RASTREADORES';

  const styles = `
    <style>
      .fr-shell{color:#e2e2f0}.fr-head{margin-bottom:18px}.fr-kicker{color:#86efac;text-transform:uppercase;letter-spacing:.14em;font-weight:950;font-size:12px}.fr-title{margin:8px 0 6px;font-size:clamp(24px,2.4vw,34px);letter-spacing:-.04em;color:#f8fafc}.fr-sub{max-width:900px;color:#6b7280;line-height:1.55;margin:0}.fr-card{border:1px solid rgba(148,163,184,.16);border-radius:24px;background:radial-gradient(circle at top left,rgba(34,197,94,.13),transparent 34%),linear-gradient(180deg,rgba(15,23,42,.98),rgba(2,6,23,.98));box-shadow:0 20px 60px rgba(0,0,0,.28);overflow:hidden}.fr-tabs{display:flex;gap:10px;flex-wrap:wrap;padding:14px;border-bottom:1px solid rgba(148,163,184,.12);background:rgba(2,6,23,.36)}.fr-tab{border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.72);color:#cbd5e1;border-radius:999px;padding:10px 16px;font-weight:950;cursor:pointer;font-size:13px;transition:.15s}.fr-tab.active,.fr-tab:hover{border-color:rgba(34,197,94,.55);background:rgba(22,101,52,.35);color:#f8fafc}.fr-body{padding:18px}.fr-toolbar{display:grid;grid-template-columns:minmax(220px,1fr) 180px auto;gap:10px;margin-bottom:14px}.fr-input,.fr-select{width:100%;height:42px;border:1px solid rgba(148,163,184,.18);border-radius:14px;background:#0d0d18;color:#e2e2f0;padding:0 12px;outline:none;color-scheme:dark}.fr-select option{background:#0d0d18;color:#e2e2f0}.fr-btn{border:0;border-radius:14px;min-height:42px;padding:0 16px;font-weight:950;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;font-size:13px}.fr-btn.primary{background:linear-gradient(135deg,#16a34a,#22c55e);color:#052e16}.fr-btn.soft{border:1px solid rgba(34,197,94,.24);background:rgba(34,197,94,.12);color:#86efac}.fr-btn.ghost{border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.72);color:#cbd5e1}.fr-btn.danger{border:1px solid rgba(239,68,68,.35);background:rgba(239,68,68,.12);color:#fca5a5}.fr-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:14px 0}.fr-kpi{border:1px solid rgba(34,197,94,.18);background:rgba(2,6,23,.32);border-radius:18px;padding:14px}.fr-kpi span{display:block;color:#93c5fd;font-size:11px;font-weight:950;letter-spacing:.1em;text-transform:uppercase}.fr-kpi strong{display:block;margin-top:8px;color:#fff;font-size:24px}.fr-table-wrap{overflow:auto;border:1px solid rgba(148,163,184,.14);border-radius:18px}.fr-table{width:100%;border-collapse:collapse;min-width:1400px}.fr-table th{padding:11px 12px;color:#bfdbfe;font-size:11px;letter-spacing:.1em;text-transform:uppercase;text-align:left;border-bottom:1px solid rgba(148,163,184,.16);background:rgba(2,6,23,.38);white-space:nowrap}.fr-table td{padding:11px 12px;border-bottom:1px solid rgba(148,163,184,.10);color:#e2e2f0;font-size:13px;vertical-align:middle}.fr-table tr:hover td{background:rgba(22,101,52,.08)}.fr-badge{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:4px 10px;font-size:10px;font-weight:950;border:1px solid rgba(148,163,184,.18);color:#cbd5e1;background:rgba(15,23,42,.72);white-space:nowrap}.fr-badge.ok{border-color:rgba(34,197,94,.35);background:rgba(22,101,52,.24);color:#bbf7d0}.fr-badge.progress{border-color:rgba(245,158,11,.34);background:rgba(245,158,11,.12);color:#fde68a}.fr-badge.none{border-color:rgba(148,163,184,.22);background:rgba(15,23,42,.6);color:#94a3b8}.fr-badge.err{border-color:rgba(239,68,68,.34);background:rgba(239,68,68,.12);color:#fecaca}.fr-mini{min-height:32px;border-radius:10px;padding:0 10px;font-size:11px}.fr-empty{text-align:center;color:#94a3b8;padding:34px!important}.fr-modal-backdrop{position:fixed;inset:0;z-index:9998;background:rgba(2,6,23,.8);display:flex;align-items:center;justify-content:center;padding:22px}.fr-modal{width:min(860px,96vw);max-height:90vh;overflow:auto;border:1px solid rgba(148,163,184,.20);border-radius:24px;background:linear-gradient(180deg,#0d0d18,#020617);box-shadow:0 24px 80px rgba(0,0,0,.55);color:#e2e2f0}.fr-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:20px;border-bottom:1px solid rgba(148,163,184,.16)}.fr-modal-head h3{margin:0;color:#fff;font-size:20px}.fr-modal-head p{margin:6px 0 0;color:#6b7280;font-size:13px;line-height:1.45}.fr-modal-body{padding:20px}.fr-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.fr-field{display:flex;flex-direction:column;gap:6px}.fr-field.full{grid-column:1/-1}.fr-field.half{grid-column:span 2}.fr-field label{color:#bbf7d0;font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.fr-field input,.fr-field select,.fr-field textarea{border:1px solid rgba(148,163,184,.18);border-radius:12px;background:#0d0d18;color:#e2e2f0;padding:10px 12px;outline:none;font-size:13px;color-scheme:dark}.fr-field textarea{min-height:70px;resize:vertical}.fr-field select option{background:#0d0d18}.fr-field input[type=checkbox]{width:18px;height:18px;cursor:pointer;accent-color:#22c55e}.fr-check-row{display:flex;align-items:center;gap:10px;padding:10px 0}.fr-check-row label{color:#e2e2f0;font-size:13px;font-weight:600;cursor:pointer}.fr-modal-foot{display:flex;gap:10px;justify-content:flex-end;padding:16px 20px;border-top:1px solid rgba(148,163,184,.12)}.fr-toast{position:fixed;right:22px;bottom:22px;z-index:9999;border:1px solid rgba(134,239,172,.32);background:rgba(22,101,52,.96);color:#dcfce7;border-radius:16px;padding:12px 16px;font-weight:950;box-shadow:0 16px 45px rgba(0,0,0,.35);opacity:0;transform:translateY(10px);pointer-events:none;transition:.2s ease}.fr-toast.show{opacity:1;transform:translateY(0)}.fr-divider{margin:16px 0 10px;color:#86efac;font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.12em;border-bottom:1px solid rgba(34,197,94,.18);padding-bottom:6px}@media(max-width:1100px){.fr-toolbar{grid-template-columns:1fr 1fr}.fr-kpis{grid-template-columns:repeat(2,1fr)}.fr-form{grid-template-columns:repeat(2,1fr)}}@media(max-width:680px){.fr-toolbar,.fr-kpis,.fr-form{grid-template-columns:1fr}}
    </style>`;

  let _opts = {};

  const state = {
    veiculos: [],
    rastreadores: [],
    merged: [],
    loading: false,
    filtro: 'todos',
    busca: ''
  };

  function norm(v) { return String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function esc(v) { return String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[c])); }
  function fmtDate(v) { if (!v) return '—'; const d = new Date(v + 'T12:00:00'); return isNaN(d) ? v : d.toLocaleDateString('pt-BR'); }

  function toast(msg, error = false) {
    let el = document.querySelector('.fr-toast');
    if (!el) { el = document.createElement('div'); el.className = 'fr-toast'; document.body.appendChild(el); }
    el.textContent = msg;
    el.style.background = error ? 'rgba(127,29,29,.96)' : 'rgba(22,101,52,.96)';
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3200);
  }

  function statusBadge(status, naoAtendido) {
    if (naoAtendido) return '<span class="fr-badge err">✕ Não atendido</span>';
    if (status === 'concluido') return '<span class="fr-badge ok">✓ Concluído</span>';
    if (status === 'em_andamento') return '<span class="fr-badge progress">⏳ Em andamento</span>';
    return '<span class="fr-badge none">— Sem rastreador</span>';
  }

  function mergeData() {
    const rastrMap = new Map((state.rastreadores || []).map(r => [r.placa, r]));
    state.merged = (state.veiculos || []).map(v => ({
      ...v,
      _rastr: rastrMap.get(v.placa) || null
    }));
  }

  function getFiltered() {
    const busca = norm(state.busca);
    return state.merged.filter(row => {
      const r = row._rastr;
      const status = r?.status || 'sem_rastreador';
      const naoAtendido = r?.nao_atendido || false;

      if (state.filtro === 'sem_rastreador' && status !== 'sem_rastreador') return false;
      if (state.filtro === 'em_andamento' && status !== 'em_andamento') return false;
      if (state.filtro === 'concluido' && status !== 'concluido') return false;

      if (!busca) return true;
      const campos = [
        row.placa, row.nome, row.marca, row.modelo, row.motorista_atual,
        r?.estado, r?.cidade, r?.local_instalacao, r?.imei, r?.cod_rastreio, r?.contato
      ];
      return norm(campos.join(' ')).includes(busca);
    });
  }

  function calcKpis() {
    const total = state.merged.length;
    const sem = state.merged.filter(r => !r._rastr || r._rastr.status === 'sem_rastreador').length;
    const andamento = state.merged.filter(r => r._rastr?.status === 'em_andamento').length;
    const concluido = state.merged.filter(r => r._rastr?.status === 'concluido').length;
    return { total, sem, andamento, concluido };
  }

  function renderKpis(root) {
    const el = root.querySelector('[data-kpis]');
    if (!el) return;
    const k = calcKpis();
    el.innerHTML = `
      <div class="fr-kpi"><span>Total veículos</span><strong>${k.total}</strong></div>
      <div class="fr-kpi"><span>Sem rastreador</span><strong style="color:#94a3b8">${k.sem}</strong></div>
      <div class="fr-kpi"><span>Em andamento</span><strong style="color:#fde68a">${k.andamento}</strong></div>
      <div class="fr-kpi"><span>Concluídos</span><strong style="color:#86efac">${k.concluido}</strong></div>`;
  }

  function renderTable(root) {
    const el = root.querySelector('[data-table]');
    if (!el) return;
    const rows = getFiltered();
    if (state.loading) { el.innerHTML = '<tr><td class="fr-empty" colspan="13">Carregando...</td></tr>'; return; }
    if (!rows.length) { el.innerHTML = '<tr><td class="fr-empty" colspan="13">Nenhum veículo encontrado.</td></tr>'; return; }
    el.innerHTML = rows.map(row => {
      const r = row._rastr;
      const status = r?.status || 'sem_rastreador';
      const naoAtendido = r?.nao_atendido || false;
      return `<tr>
        <td><strong>${esc(row.placa)}</strong></td>
        <td>${esc(r?.estado || '—')}</td>
        <td>${esc(r?.cidade || '—')}</td>
        <td>${esc(r?.local_instalacao || '—')}</td>
        <td style="font-family:monospace;font-size:12px">${esc(r?.imei || '—')}</td>
        <td>${r?.data_envio ? fmtDate(r.data_envio) : '—'}</td>
        <td>${r?.previsao_chegada ? fmtDate(r.previsao_chegada) : '—'}</td>
        <td style="font-family:monospace;font-size:12px">${esc(r?.cod_rastreio || '—')}</td>
        <td>${statusBadge(status, naoAtendido)}</td>
        <td>${r?.data_instalacao ? fmtDate(r.data_instalacao) : '—'}</td>
        <td>${naoAtendido ? '<span class="fr-badge err">Sim</span>' : '<span class="fr-badge none">Não</span>'}</td>
        <td>${esc(r?.contato || row.motorista_atual || '—')}</td>
        <td>
          <button class="fr-btn soft fr-mini" data-edit="${esc(row.placa)}">Editar</button>
        </td>
      </tr>`;
    }).join('');

    el.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => openModal(root, btn.dataset.edit));
    });
  }

  function openModal(root, placa) {
    const row = state.merged.find(v => v.placa === placa);
    if (!row) return;
    const r = row._rastr || {};

    const backdrop = document.createElement('div');
    backdrop.className = 'fr-modal-backdrop';
    backdrop.innerHTML = `
      <div class="fr-modal" role="dialog" aria-modal="true">
        <div class="fr-modal-head">
          <div>
            <h3>Rastreador · ${esc(placa)}</h3>
            <p>${esc(row.nome || row.marca || '')} ${esc(row.modelo || '')} · Motorista: ${esc(row.motorista_atual || '—')}</p>
          </div>
          <button class="fr-btn ghost fr-mini" data-close>✕</button>
        </div>
        <div class="fr-modal-body">
          <div class="fr-divider">Localização</div>
          <div class="fr-form">
            <div class="fr-field">
              <label>Estado</label>
              <input name="estado" value="${esc(r.estado || '')}" placeholder="Ex: SP" />
            </div>
            <div class="fr-field">
              <label>Cidade</label>
              <input name="cidade" value="${esc(r.cidade || '')}" placeholder="Ex: São Paulo" />
            </div>
            <div class="fr-field">
              <label>Local de Instalação</label>
              <input name="local_instalacao" value="${esc(r.local_instalacao || '')}" placeholder="Ex: Garagem central" />
            </div>
          </div>

          <div class="fr-divider">Rastreador</div>
          <div class="fr-form">
            <div class="fr-field">
              <label>IMEI</label>
              <input name="imei" value="${esc(r.imei || '')}" placeholder="Ex: 354321000000000" />
            </div>
            <div class="fr-field">
              <label>Cód. Rastreio</label>
              <input name="cod_rastreio" value="${esc(r.cod_rastreio || '')}" placeholder="Ex: BR123456789" />
            </div>
            <div class="fr-field">
              <label>Status</label>
              <select name="status">
                <option value="sem_rastreador" ${(!r.status || r.status === 'sem_rastreador') ? 'selected' : ''}>Sem rastreador</option>
                <option value="em_andamento" ${r.status === 'em_andamento' ? 'selected' : ''}>Em andamento</option>
                <option value="concluido" ${r.status === 'concluido' ? 'selected' : ''}>Concluído</option>
              </select>
            </div>
          </div>

          <div class="fr-divider">Datas</div>
          <div class="fr-form">
            <div class="fr-field">
              <label>Data de Envio</label>
              <input type="date" name="data_envio" value="${r.data_envio || ''}" />
            </div>
            <div class="fr-field">
              <label>Previsão de Chegada</label>
              <input type="date" name="previsao_chegada" value="${r.previsao_chegada || ''}" />
            </div>
            <div class="fr-field">
              <label>Data da Instalação</label>
              <input type="date" name="data_instalacao" value="${r.data_instalacao || ''}" />
            </div>
          </div>

          <div class="fr-divider">Contato e Observações</div>
          <div class="fr-form">
            <div class="fr-field half">
              <label>Contato (Motorista/Colaborador)</label>
              <input name="contato" value="${esc(r.contato || row.motorista_atual || '')}" placeholder="Nome ou telefone" />
            </div>
            <div class="fr-field" style="justify-content:flex-end">
              <div class="fr-check-row">
                <input type="checkbox" name="nao_atendido" id="chk_nao_atendido" ${r.nao_atendido ? 'checked' : ''} />
                <label for="chk_nao_atendido">Não atendido</label>
              </div>
            </div>
            <div class="fr-field full">
              <label>Observações</label>
              <textarea name="observacoes">${esc(r.observacoes || '')}</textarea>
            </div>
          </div>
        </div>
        <div class="fr-modal-foot">
          <button class="fr-btn ghost" data-close>Cancelar</button>
          <button class="fr-btn primary" data-save>Salvar</button>
        </div>
      </div>`;

    document.body.appendChild(backdrop);

    backdrop.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => backdrop.remove()));
    backdrop.addEventListener('click', e => { if (e.target === backdrop) backdrop.remove(); });

    backdrop.querySelector('[data-save]').addEventListener('click', async () => {
      await saveRastreador(root, placa, row.id, backdrop);
    });
  }

  function readModal(backdrop) {
    const get = (name) => backdrop.querySelector(`[name="${name}"]`)?.value?.trim() || null;
    const chk = (name) => backdrop.querySelector(`[name="${name}"]`)?.checked || false;
    return {
      estado: get('estado'),
      cidade: get('cidade'),
      local_instalacao: get('local_instalacao'),
      imei: get('imei'),
      cod_rastreio: get('cod_rastreio'),
      status: get('status') || 'sem_rastreador',
      data_envio: get('data_envio') || null,
      previsao_chegada: get('previsao_chegada') || null,
      data_instalacao: get('data_instalacao') || null,
      contato: get('contato'),
      nao_atendido: chk('nao_atendido'),
      observacoes: get('observacoes')
    };
  }

  async function saveRastreador(root, placa, veiculo_id, backdrop) {
    const btn = backdrop.querySelector('[data-save]');
    btn.textContent = 'Salvando...';
    btn.disabled = true;

    const payload = {
      placa,
      veiculo_id: veiculo_id || null,
      ...readModal(backdrop)
    };

    const { error } = await _opts.supabase
      .from('frotas_rastreadores')
      .upsert(payload, { onConflict: 'placa' });

    if (error) {
      toast(error.message || 'Erro ao salvar.', true);
      btn.textContent = 'Salvar';
      btn.disabled = false;
      return;
    }

    toast('Rastreador salvo com sucesso.');
    backdrop.remove();
    await loadData(root);
  }

  async function loadData(root) {
    state.loading = true;
    renderTable(root);

    const [resV, resR] = await Promise.all([
      _opts.supabase.from('frotas_veiculos').select('id,placa,nome,marca,modelo,motorista_atual,status').eq('status', 'ATIVO').order('placa'),
      _opts.supabase.from('frotas_rastreadores').select('*').order('placa')
    ]);

    if (resV.error) toast(resV.error.message || 'Erro ao carregar veículos.', true);
    else state.veiculos = Array.isArray(resV.data) ? resV.data : [];

    if (resR.error) toast(resR.error.message || 'Erro ao carregar rastreadores.', true);
    else state.rastreadores = Array.isArray(resR.data) ? resR.data : [];

    mergeData();
    state.loading = false;
    renderKpis(root);
    renderTable(root);
  }

  function openHome(container, opts = {}) {
    _opts = opts;

    container.innerHTML = styles + `
      <div class="fr-shell">
        <div class="fr-head">
          <div class="fr-kicker">Frotas</div>
          <h2 class="fr-title">Rastreadores</h2>
          <p class="fr-sub">Controle de instalação de rastreadores em todos os veículos da frota (DETRAN e BFleet).</p>
        </div>

        <div class="fr-card">
          <div class="fr-tabs">
            <button class="fr-tab active" data-filter="todos">Todos</button>
            <button class="fr-tab" data-filter="sem_rastreador">Sem Rastreador</button>
            <button class="fr-tab" data-filter="em_andamento">Em Andamento</button>
            <button class="fr-tab" data-filter="concluido">Concluído</button>
          </div>

          <div class="fr-body">
            <div class="fr-toolbar">
              <input class="fr-input" type="search" placeholder="Buscar por placa, cidade, IMEI, contato..." data-search />
              <select class="fr-select" data-search-status>
                <option value="">Todos os status</option>
                <option value="sem_rastreador">Sem rastreador</option>
                <option value="em_andamento">Em andamento</option>
                <option value="concluido">Concluído</option>
              </select>
              <button class="fr-btn soft" data-refresh>↺ Atualizar</button>
            </div>

            <div class="fr-kpis" data-kpis></div>

            <div class="fr-table-wrap">
              <table class="fr-table">
                <thead>
                  <tr>
                    <th>Placa</th>
                    <th>Estado</th>
                    <th>Cidade</th>
                    <th>Local Instalação</th>
                    <th>IMEI</th>
                    <th>Data Envio</th>
                    <th>Prev. Chegada</th>
                    <th>Cód. Rastreio</th>
                    <th>Status</th>
                    <th>Data Instalação</th>
                    <th>Não atendido</th>
                    <th>Contato</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody data-table></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>`;

    container.querySelectorAll('[data-filter]').forEach(tab => {
      tab.addEventListener('click', () => {
        state.filtro = tab.dataset.filter;
        container.querySelectorAll('[data-filter]').forEach(t => t.classList.toggle('active', t === tab));
        const sel = container.querySelector('[data-search-status]');
        if (sel) sel.value = state.filtro === 'todos' ? '' : state.filtro;
        renderTable(container);
      });
    });

    container.querySelector('[data-search]').addEventListener('input', e => {
      state.busca = e.target.value;
      renderTable(container);
    });

    container.querySelector('[data-search-status]').addEventListener('change', e => {
      const val = e.target.value;
      state.filtro = val || 'todos';
      container.querySelectorAll('[data-filter]').forEach(t => t.classList.toggle('active', t.dataset.filter === state.filtro));
      renderTable(container);
    });

    container.querySelector('[data-refresh]').addEventListener('click', () => loadData(container));

    loadData(container);
  }

  window[MODULE_NAME] = { openHome };
})();
