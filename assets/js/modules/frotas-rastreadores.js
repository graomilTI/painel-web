(function () {
  const MODULE_NAME = 'FROTAS_RASTREADORES';

  const styles = `
    <style>
      .fr-shell{color:#e2e2f0}.fr-head{margin-bottom:18px}.fr-kicker{color:#86efac;text-transform:uppercase;letter-spacing:.14em;font-weight:950;font-size:12px}.fr-title{margin:8px 0 6px;font-size:clamp(24px,2.4vw,34px);letter-spacing:-.04em;color:#f8fafc}.fr-sub{max-width:900px;color:#6b7280;line-height:1.55;margin:0}.fr-card{border:1px solid rgba(148,163,184,.16);border-radius:24px;background:radial-gradient(circle at top left,rgba(34,197,94,.13),transparent 34%),linear-gradient(180deg,rgba(15,23,42,.98),rgba(2,6,23,.98));box-shadow:0 20px 60px rgba(0,0,0,.28);overflow:hidden}.fr-tabs{display:flex;gap:10px;flex-wrap:wrap;padding:14px;border-bottom:1px solid rgba(148,163,184,.12);background:rgba(2,6,23,.36)}.fr-tab{border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.72);color:#cbd5e1;border-radius:999px;padding:10px 16px;font-weight:950;cursor:pointer;font-size:13px;transition:.15s}.fr-tab.active,.fr-tab:hover{border-color:rgba(34,197,94,.55);background:rgba(22,101,52,.35);color:#f8fafc}.fr-body{padding:18px}.fr-toolbar{display:grid;grid-template-columns:minmax(220px,1fr) 180px auto auto;gap:10px;margin-bottom:14px;align-items:center}.fr-input,.fr-select{width:100%;height:42px;border:1px solid rgba(148,163,184,.18);border-radius:14px;background:#0d0d18;color:#e2e2f0;padding:0 12px;outline:none;color-scheme:dark}.fr-select option{background:#0d0d18;color:#e2e2f0}.fr-btn{border:0;border-radius:14px;min-height:42px;padding:0 16px;font-weight:950;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;font-size:13px;white-space:nowrap}.fr-btn.primary{background:linear-gradient(135deg,#16a34a,#22c55e);color:#052e16}.fr-btn.soft{border:1px solid rgba(34,197,94,.24);background:rgba(34,197,94,.12);color:#86efac}.fr-btn.ghost{border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.72);color:#cbd5e1}.fr-btn.danger{border:1px solid rgba(239,68,68,.35);background:rgba(239,68,68,.12);color:#fca5a5}.fr-btn:disabled{opacity:.5;cursor:not-allowed}.fr-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin:14px 0}.fr-kpi{border:1px solid rgba(34,197,94,.18);background:rgba(2,6,23,.32);border-radius:18px;padding:14px}.fr-kpi span{display:block;color:#93c5fd;font-size:11px;font-weight:950;letter-spacing:.1em;text-transform:uppercase}.fr-kpi strong{display:block;margin-top:8px;color:#fff;font-size:24px}.fr-table-wrap{overflow:auto;border:1px solid rgba(148,163,184,.14);border-radius:18px}.fr-table{width:100%;border-collapse:collapse;min-width:1440px}.fr-table th{padding:11px 12px;color:#bfdbfe;font-size:11px;letter-spacing:.1em;text-transform:uppercase;text-align:left;border-bottom:1px solid rgba(148,163,184,.16);background:rgba(2,6,23,.38);white-space:nowrap}.fr-table td{padding:11px 12px;border-bottom:1px solid rgba(148,163,184,.10);color:#e2e2f0;font-size:13px;vertical-align:middle}.fr-table tr:hover td{background:rgba(22,101,52,.08)}.fr-badge{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:4px 10px;font-size:10px;font-weight:950;border:1px solid rgba(148,163,184,.18);color:#cbd5e1;background:rgba(15,23,42,.72);white-space:nowrap}.fr-badge.ok{border-color:rgba(34,197,94,.35);background:rgba(22,101,52,.24);color:#bbf7d0}.fr-badge.progress{border-color:rgba(245,158,11,.34);background:rgba(245,158,11,.12);color:#fde68a}.fr-badge.none{border-color:rgba(148,163,184,.22);background:rgba(15,23,42,.6);color:#94a3b8}.fr-badge.err{border-color:rgba(239,68,68,.34);background:rgba(239,68,68,.12);color:#fecaca}.fr-badge.bfleet{border-color:rgba(99,102,241,.35);background:rgba(99,102,241,.12);color:#a5b4fc}.fr-imei-bfleet{font-family:monospace;font-size:12px;color:#a5b4fc;opacity:.8}.fr-mini{min-height:32px;border-radius:10px;padding:0 10px;font-size:11px}.fr-empty{text-align:center;color:#94a3b8;padding:34px!important}.fr-modal-backdrop{position:fixed;inset:0;z-index:9998;background:rgba(2,6,23,.8);display:flex;align-items:center;justify-content:center;padding:22px}.fr-modal{width:min(860px,96vw);max-height:90vh;overflow:auto;border:1px solid rgba(148,163,184,.20);border-radius:24px;background:linear-gradient(180deg,#0d0d18,#020617);box-shadow:0 24px 80px rgba(0,0,0,.55);color:#e2e2f0}.fr-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:20px;border-bottom:1px solid rgba(148,163,184,.16)}.fr-modal-head h3{margin:0;color:#fff;font-size:20px}.fr-modal-head p{margin:6px 0 0;color:#6b7280;font-size:13px;line-height:1.45}.fr-modal-body{padding:20px}.fr-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.fr-field{display:flex;flex-direction:column;gap:6px}.fr-field.full{grid-column:1/-1}.fr-field.half{grid-column:span 2}.fr-field label{color:#bbf7d0;font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.fr-field input,.fr-field select,.fr-field textarea{border:1px solid rgba(148,163,184,.18);border-radius:12px;background:#0d0d18;color:#e2e2f0;padding:10px 12px;outline:none;font-size:13px;color-scheme:dark}.fr-field textarea{min-height:70px;resize:vertical}.fr-field select option{background:#0d0d18}.fr-field input[type=checkbox]{width:18px;height:18px;cursor:pointer;accent-color:#22c55e}.fr-check-row{display:flex;align-items:center;gap:10px;padding:10px 0}.fr-check-row label{color:#e2e2f0;font-size:13px;font-weight:600;cursor:pointer}.fr-modal-foot{display:flex;gap:10px;justify-content:flex-end;padding:16px 20px;border-top:1px solid rgba(148,163,184,.12)}.fr-hint{font-size:11px;color:#6366f1;margin-top:3px}.fr-toast{position:fixed;right:22px;bottom:22px;z-index:9999;border:1px solid rgba(134,239,172,.32);background:rgba(22,101,52,.96);color:#dcfce7;border-radius:16px;padding:12px 16px;font-weight:950;box-shadow:0 16px 45px rgba(0,0,0,.35);opacity:0;transform:translateY(10px);pointer-events:none;transition:.2s ease}.fr-toast.show{opacity:1;transform:translateY(0)}.fr-divider{margin:16px 0 10px;color:#86efac;font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.12em;border-bottom:1px solid rgba(34,197,94,.18);padding-bottom:6px}@media(max-width:1100px){.fr-toolbar{grid-template-columns:1fr 1fr}.fr-kpis{grid-template-columns:repeat(3,1fr)}.fr-form{grid-template-columns:repeat(2,1fr)}}@media(max-width:680px){.fr-toolbar,.fr-kpis,.fr-form{grid-template-columns:1fr}}
    </style>`;

  let _opts = {};

  const state = {
    veiculos: [],
    rastreadores: [],
    merged: [],
    loading: false,
    syncing: false,
    filtro: 'todos',
    busca: ''
  };

  function norm(v) { return String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function esc(v) { return String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[c])); }
  function fmtDate(v) { if (!v) return '—'; const d = new Date(v + 'T12:00:00'); return isNaN(d) ? v : d.toLocaleDateString('pt-BR'); }

  // Normalização de placas: padrão antigo AAA0000 e Mercosul AAA0A00 são o mesmo veículo.
  // Posição 4 (índice 4): A=0, B=1, C=2, D=3, E=4, F=5, G=6, H=7, I=8, J=9
  const _L2D = { A:'0',B:'1',C:'2',D:'3',E:'4',F:'5',G:'6',H:'7',I:'8',J:'9' };
  const _D2L = { '0':'A','1':'B','2':'C','3':'D','4':'E','5':'F','6':'G','7':'H','8':'I','9':'J' };

  function rawPlaca(v) {
    return String(v || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Z0-9]/g,'').slice(0,7);
  }

  // Chave canônica para comparação: converte posição 4 Mercosul → dígito (formato antigo)
  function placaKey(v) {
    const p = rawPlaca(v);
    if (p.length !== 7) return p;
    const c4 = p[4];
    return _L2D[c4] !== undefined ? p.slice(0,4) + _L2D[c4] + p.slice(5) : p;
  }

  // Gera ambos os formatos de uma placa para busca textual
  function placaCandidates(v) {
    const p = rawPlaca(v);
    if (p.length !== 7) return [p];
    const c4 = p[4];
    const alt = _L2D[c4] !== undefined
      ? p.slice(0,4) + _L2D[c4] + p.slice(5)           // Mercosul → antigo
      : _D2L[c4] !== undefined
        ? p.slice(0,4) + _D2L[c4] + p.slice(5)           // antigo → Mercosul
        : null;
    return alt ? [p, alt] : [p];
  }

  // Mapeamento coordenação → estado (frotas_veiculos.coordenacao)
  const COORD_ESTADO = {
    'GOIAS':'Goiás','MARINGA E TERMINAIS':'Paraná','PONTA GROSSA':'Paraná',
    'CASCAVEL':'Paraná','MATO GROSSO MT1':'Mato Grosso','RIO GRANDE DO SUL':'Rio Grande do Sul',
    'SAO PAULO':'São Paulo','SÃO PAULO':'São Paulo','LONDRINA':'Paraná',
    'MATO GROSSO DO SUL':'Mato Grosso do Sul','MATO GROSSO MT2':'Mato Grosso',
    'MINAS GERAIS':'Minas Gerais','MARANHAO':'Maranhão','MARANHÃO':'Maranhão',
    'MATO GROSSO MT3 - QUERENCIA':'Mato Grosso','GERAL':'Paraná','BAHIA':'Bahia',
    'MATO GROSSO MT4':'Mato Grosso','MATO GROSSO MT3 - CONFRESA':'Mato Grosso',
    'PARA':'Pará','PARÁ':'Pará','TOCANTINS':'Tocantins',
  };
  function coordToEstado(coord) {
    if (!coord) return '';
    return COORD_ESTADO[String(coord).trim().toUpperCase()] || '';
  }

  function hasBfleet(v) {
    const st = String(v?.bfleet_status || '').toUpperCase();
    return Boolean(v?.bfleet_confirmado || v?.rastreador_bfleet || v?.bfleet_rastreador || st === 'COM_RASTREADOR' || st === 'ATIVO' || st === 'OK');
  }

  function toast(msg, error = false) {
    let el = document.querySelector('.fr-toast');
    if (!el) { el = document.createElement('div'); el.className = 'fr-toast'; document.body.appendChild(el); }
    el.textContent = msg;
    el.style.background = error ? 'rgba(127,29,29,.96)' : 'rgba(22,101,52,.96)';
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3600);
  }

  const STATUS_LABEL = {
    concluido:            ['ok',       '✓ Instalado'],
    em_andamento:         ['progress', '⏳ Em andamento'],
    agendado:             ['progress', '📅 Agendado'],
    aguardando_motorista: ['progress', '⏳ Aguard. motorista'],
    sem_rastreador:       ['none',     '— Sem rastreador'],
  };

  function statusBadge(status, agendFrus) {
    const [cls, label] = STATUS_LABEL[status] || STATUS_LABEL.sem_rastreador;
    const frus = agendFrus > 0 ? ` <span class="fr-badge err" style="font-size:9px">✕ ${agendFrus}x frustrado</span>` : '';
    return `<span class="fr-badge ${cls}">${label}</span>${frus}`;
  }

  function mergeData() {
    const rastrMap = new Map((state.rastreadores || []).map(r => [placaKey(r.placa), r]));
    state.merged = (state.veiculos || []).map(v => ({
      ...v,
      _rastr: rastrMap.get(placaKey(v.placa)) || null,
      _hasBfleet: hasBfleet(v)
    }));
  }

  function getFiltered() {
    const busca = norm(state.busca);
    return state.merged.filter(row => {
      const r = row._rastr;
      const status = r?.status || 'sem_rastreador';

      const EM_ANDAMENTO = ['em_andamento','aguardando_motorista','agendado'];
      if (state.filtro === 'sem_rastreador' && status !== 'sem_rastreador') return false;
      if (state.filtro === 'em_andamento' && !EM_ANDAMENTO.includes(status)) return false;
      if (state.filtro === 'concluido' && status !== 'concluido') return false;

      if (!busca) return true;
      const efImei = r?.imei || row.bfleet_idgps || '';
      const placas = placaCandidates(row.placa).concat(r?.placa ? placaCandidates(r.placa) : []);
      return norm([...placas, row.nome, row.marca, row.modelo, row.motorista_atual,
        r?.estado, r?.cidade, r?.local_instalacao, efImei, r?.cod_rastreio, r?.contato].join(' ')).includes(busca);
    });
  }

  function calcKpis() {
    const EM_ANDAMENTO = ['em_andamento','aguardando_motorista','agendado'];
    const total = state.merged.length;
    const bfleetTotal = state.merged.filter(r => r._hasBfleet).length;
    const sem = state.merged.filter(r => !r._rastr || r._rastr.status === 'sem_rastreador').length;
    const andamento = state.merged.filter(r => EM_ANDAMENTO.includes(r._rastr?.status)).length;
    const concluido = state.merged.filter(r => r._rastr?.status === 'concluido').length;
    return { total, bfleetTotal, sem, andamento, concluido };
  }

  function renderKpis(root) {
    const el = root.querySelector('[data-kpis]');
    if (!el) return;
    const k = calcKpis();
    el.innerHTML = `
      <div class="fr-kpi"><span>Total veículos</span><strong>${k.total}</strong></div>
      <div class="fr-kpi"><span>Com BFleet</span><strong style="color:#a5b4fc">${k.bfleetTotal}</strong></div>
      <div class="fr-kpi"><span>Sem rastreador</span><strong style="color:#94a3b8">${k.sem}</strong></div>
      <div class="fr-kpi"><span>Em andamento</span><strong style="color:#fde68a">${k.andamento}</strong></div>
      <div class="fr-kpi"><span>Instalados</span><strong style="color:#86efac">${k.concluido}</strong></div>`;
  }

  function renderTable(root) {
    const el = root.querySelector('[data-table]');
    if (!el) return;
    const rows = getFiltered();
    if (state.loading) { el.innerHTML = '<tr><td class="fr-empty" colspan="14">Carregando...</td></tr>'; return; }
    if (!rows.length) { el.innerHTML = '<tr><td class="fr-empty" colspan="14">Nenhum veículo encontrado.</td></tr>'; return; }

    el.innerHTML = rows.map(row => {
      const r = row._rastr;
      const status = r?.status || 'sem_rastreador';
      const agendFrus = r?.agendamentos_frustrados || 0;

      // IMEI: manual tem prioridade; fallback é idgps da BFleet (estilo diferente)
      const imeiManual = r?.imei;
      const imeiBfleet = row.bfleet_idgps;
      const imeiCell = imeiManual
        ? `<span style="font-family:monospace;font-size:12px">${esc(imeiManual)}</span>`
        : imeiBfleet
          ? `<span class="fr-imei-bfleet">${esc(imeiBfleet)}</span> <span class="fr-badge bfleet" style="font-size:9px">BFleet</span>`
          : '—';

      const bfleetTag = row._hasBfleet && !r
        ? ' <span class="fr-badge bfleet" style="font-size:9px">BFleet</span>'
        : '';
      const estadoEfetivo = r?.estado || coordToEstado(row.coordenacao);

      return `<tr>
        <td><strong>${esc(row.placa)}</strong>${bfleetTag}</td>
        <td>${esc(estadoEfetivo || '—')}</td>
        <td>${esc(r?.cidade || '—')}</td>
        <td>${esc(r?.local_instalacao || '—')}</td>
        <td>${imeiCell}</td>
        <td>${r?.data_envio ? fmtDate(r.data_envio) : '—'}</td>
        <td>${r?.previsao_chegada ? fmtDate(r.previsao_chegada) : '—'}</td>
        <td style="font-family:monospace;font-size:12px">${esc(r?.cod_rastreio || '—')}</td>
        <td>${statusBadge(status, agendFrus)}</td>
        <td>${r?.data_instalacao ? fmtDate(r.data_instalacao) : '—'}</td>
        <td>${agendFrus > 0 ? `<span class="fr-badge err">${agendFrus}</span>` : '<span class="fr-badge none">0</span>'}</td>
        <td>${esc(r?.contato || row.motorista_atual || '—')}</td>
        <td><button class="fr-btn soft fr-mini" data-edit="${esc(row.placa)}">Editar</button></td>
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
    const bfleetImei = row.bfleet_idgps || '';
    const isBfleet = row._hasBfleet;
    const estadoSugerido = r.estado || coordToEstado(row.coordenacao);

    const backdrop = document.createElement('div');
    backdrop.className = 'fr-modal-backdrop';
    backdrop.innerHTML = `
      <div class="fr-modal" role="dialog" aria-modal="true">
        <div class="fr-modal-head">
          <div>
            <h3>Rastreador · ${esc(placa)} ${isBfleet ? '<span class="fr-badge bfleet" style="font-size:11px">BFleet</span>' : ''}</h3>
            <p>${esc(row.nome || row.marca || '')} ${esc(row.modelo || '')} · Motorista: ${esc(row.motorista_atual || '—')}</p>
          </div>
          <button class="fr-btn ghost fr-mini" data-close>✕</button>
        </div>
        <div class="fr-modal-body">
          <div class="fr-divider">Localização</div>
          <div class="fr-form">
            <div class="fr-field">
              <label>Estado</label>
              <input name="estado" value="${esc(estadoSugerido)}" placeholder="Ex: SP" />
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

          <div class="fr-divider">Contrato</div>
          <div class="fr-form">
            <div class="fr-field">
              <label>Nº Contrato</label>
              <input type="number" name="contrato" value="${r.contrato || ''}" placeholder="Ex: 110" />
            </div>
            <div class="fr-field" style="justify-content:flex-end">
              <div class="fr-check-row">
                <input type="checkbox" name="contrato_assinado" id="chk_contrato_${esc(placa)}" ${r.contrato_assinado ? 'checked' : ''} />
                <label for="chk_contrato_${esc(placa)}">Contrato assinado</label>
              </div>
            </div>
            <div class="fr-field">
              <label>Termo assinado</label>
              <input name="termo_assinado" value="${esc(r.termo_assinado || '')}" placeholder="Ex: Aguardando instalação" />
            </div>
          </div>

          <div class="fr-divider">Rastreador</div>
          <div class="fr-form">
            <div class="fr-field">
              <label>IMEI</label>
              <input name="imei" value="${esc(r.imei || bfleetImei)}" placeholder="Ex: 354321000000000" />
              ${bfleetImei ? `<span class="fr-hint">BFleet idgps: ${esc(bfleetImei)}</span>` : ''}
            </div>
            <div class="fr-field">
              <label>Cód. Rastreio</label>
              <input name="cod_rastreio" value="${esc(r.cod_rastreio || '')}" placeholder="Ex: BR123456789" />
            </div>
            <div class="fr-field">
              <label>Status</label>
              <select name="status">
                <option value="sem_rastreador" ${(!r.status || r.status === 'sem_rastreador') ? 'selected' : ''}>Sem rastreador</option>
                <option value="aguardando_motorista" ${r.status === 'aguardando_motorista' ? 'selected' : ''}>Aguardando resposta motorista</option>
                <option value="agendado" ${r.status === 'agendado' ? 'selected' : ''}>Agendado instalação</option>
                <option value="concluido" ${(r.status === 'concluido' || (isBfleet && !r.status)) ? 'selected' : ''}>Instalado</option>
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
            <div class="fr-field">
              <label>Agendamentos frustrados</label>
              <input type="number" name="agendamentos_frustrados" value="${r.agendamentos_frustrados || 0}" min="0" />
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
    const num = (name) => { const v = parseInt(backdrop.querySelector(`[name="${name}"]`)?.value || '0', 10); return isNaN(v) ? 0 : v; };
    return {
      contrato: parseInt(get('contrato') || '0', 10) || null,
      contrato_assinado: chk('contrato_assinado'),
      termo_assinado: get('termo_assinado'),
      estado: get('estado'),
      cidade: get('cidade'),
      local_instalacao: get('local_instalacao'),
      imei: get('imei'),
      cod_rastreio: get('cod_rastreio'),
      status: get('status') || 'sem_rastreador',
      data_envio: get('data_envio') || null,
      previsao_chegada: get('previsao_chegada') || null,
      data_instalacao: get('data_instalacao') || null,
      agendamentos_frustrados: num('agendamentos_frustrados'),
      contato: get('contato'),
      observacoes: get('observacoes')
    };
  }

  async function saveRastreador(root, placa, veiculo_id, backdrop) {
    const btn = backdrop.querySelector('[data-save]');
    btn.textContent = 'Salvando...';
    btn.disabled = true;

    // Usa a placa exatamente como está em frotas_veiculos (fonte canônica)
    const { error } = await _opts.supabase
      .from('frotas_rastreadores')
      .upsert({ placa: rawPlaca(placa), veiculo_id: veiculo_id || null, ...readModal(backdrop) }, { onConflict: 'placa' });

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

  // Sincroniza registros de frotas_rastreadores a partir dos dados BFleet em frotas_veiculos.
  // Cria registros novos (status=concluido, imei=bfleet_idgps) para quem ainda não tem entrada.
  // Preenche imei em registros existentes que estejam sem imei manual.
  // Nunca sobrescreve status ou campos preenchidos manualmente.
  async function syncFromBfleet(root) {
    if (state.syncing) return;
    state.syncing = true;

    const btn = root.querySelector('[data-sync-bfleet]');
    if (btn) { btn.disabled = true; btn.textContent = 'Sincronizando...'; }

    const comBfleet = state.merged.filter(v => v._hasBfleet && v.bfleet_idgps);
    if (!comBfleet.length) {
      toast('Nenhum veículo com idgps BFleet encontrado. Sincronize primeiro em Veículos > Sincronizar BFleet.', true);
      state.syncing = false;
      if (btn) { btn.disabled = false; btn.textContent = '⟳ Sync BFleet'; }
      return;
    }

    let criados = 0, atualizados = 0;

    for (const v of comBfleet) {
      const existente = v._rastr;

      if (!existente) {
        // Cria novo registro como concluido com imei do BFleet
        const { error } = await _opts.supabase.from('frotas_rastreadores').upsert({
          placa: v.placa,
          veiculo_id: v.id || null,
          imei: v.bfleet_idgps,
          status: 'concluido',
          contato: v.motorista_atual || null
        }, { onConflict: 'placa' });
        if (!error) criados++;
      } else if (!existente.imei && v.bfleet_idgps) {
        // Preenche só o IMEI que estava vazio
        const { error } = await _opts.supabase.from('frotas_rastreadores')
          .update({ imei: v.bfleet_idgps })
          .eq('placa', v.placa);
        if (!error) atualizados++;
      }
    }

    toast(`BFleet sincronizado: ${criados} novo(s) registro(s) criado(s), ${atualizados} IMEI(s) preenchido(s).`);
    state.syncing = false;
    if (btn) { btn.disabled = false; btn.textContent = '⟳ Sync BFleet'; }
    await loadData(root);
  }

  async function loadData(root) {
    state.loading = true;
    renderTable(root);

    const [resV, resR] = await Promise.all([
      _opts.supabase
        .from('frotas_veiculos')
        .select('id,placa,nome,marca,modelo,motorista_atual,coordenacao,status,bfleet_idgps,bfleet_confirmado,rastreador_bfleet,bfleet_rastreador,bfleet_status')
        .eq('status', 'ATIVO')
        .order('placa'),
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
          <p class="fr-sub">Controle de instalação de rastreadores. Veículos com BFleet ativo são sincronizados automaticamente — IMEI em <span style="color:#a5b4fc">roxo</span> indica origem BFleet.</p>
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
              <button class="fr-btn ghost" data-sync-bfleet>⟳ Sync BFleet</button>
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
    container.querySelector('[data-sync-bfleet]').addEventListener('click', () => syncFromBfleet(container));

    loadData(container);
  }

  window[MODULE_NAME] = { openHome };
})();
