import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs';

(function () {
  const state = {
    colaboradores: [],
    patrimoniosAtraso: new Set(),
    loading: false,
    filtros: {
      situacao: 'Ativo',
      nome: '',
      empresa: '',
      coordenacao: '',
      supervisao: '',
      admissaoInicio: '',
      admissaoFim: ''
    }
  };

  const CARTAO_POSTAGEM = '0078433150';
  const CNPJ_PADRAO = '29.666.679/0001-34';

  function esc(v) {
    return String(v ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function onlyDigits(v) {
    return String(v ?? '').replace(/\D+/g, '');
  }

  function normalize(v) {
    return String(v ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  function titleCase(str) {
    return String(str || '')
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ')
      .trim();
  }

  function splitName(nome) {
    const parts = String(nome || '').trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
    if (!parts.length) return { first: '', last: '' };
    return { first: parts[0], last: parts.slice(1).join(' ') };
  }

  function brDate(value) {
    if (!value) return '';
    const raw = String(value).slice(0, 10);
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return String(value || '').trim();
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function normalizeCpf(v) {
    let d = onlyDigits(v);
    if (!d) return '';
    if (d.length < 11) d = d.padStart(11, '0');
    if (d.length > 11) d = d.slice(-11);
    return d;
  }

  function formatCpf(v) {
    const d = normalizeCpf(v);
    if (!d) return '';
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }

  function formatCnpj(v) {
    let d = onlyDigits(v);
    if (!d) return '';
    if (d.length < 14) d = d.padStart(14, '0');
    if (d.length > 14) d = d.slice(-14);
    return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }

  function normalizePhone(raw) {
    let digits = onlyDigits(raw).replace(/^0+/, '');
    if (!digits) return { e164: '', ddd: '', national: '', countryCode: '+55' };
    let nacional = digits;
    if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) nacional = digits.slice(2);
    if (nacional.length === 10 || nacional.length === 11) {
      return { e164: `+55${nacional}`, ddd: nacional.slice(0, 2), national: nacional, countryCode: '+55' };
    }
    return { e164: `+${digits}`, ddd: '', national: nacional, countryCode: '+55' };
  }

  function formatPhoneBr(raw) {
    const tel = normalizePhone(raw);
    const d = tel.national || '';
    if (d.length === 11) return d.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
    if (d.length === 10) return d.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
    return String(raw || '').trim();
  }

  function estadoParaUF(estado) {
    const s = normalize(estado).toUpperCase();
    if (/^[A-Z]{2}$/.test(s)) return s;
    const map = {
      ACRE: 'AC', ALAGOAS: 'AL', AMAPA: 'AP', AMAZONAS: 'AM', BAHIA: 'BA', CEARA: 'CE',
      'DISTRITO FEDERAL': 'DF', ESPIRITO_SANTO: 'ES', GOIAS: 'GO', MARANHAO: 'MA', MATO_GROSSO: 'MT',
      MATO_GROSSO_DO_SUL: 'MS', MINAS_GERAIS: 'MG', PARA: 'PA', PARAIBA: 'PB', PARANA: 'PR',
      PERNAMBUCO: 'PE', PIAUI: 'PI', RIO_DE_JANEIRO: 'RJ', RIO_GRANDE_DO_NORTE: 'RN',
      RIO_GRANDE_DO_SUL: 'RS', RONDONIA: 'RO', RORAIMA: 'RR', SANTA_CATARINA: 'SC',
      SAO_PAULO: 'SP', SERGIPE: 'SE', TOCANTINS: 'TO'
    };
    return map[s.replace(/\s+/g, '_')] || String(estado || '').trim().slice(0, 2).toUpperCase();
  }

  function splitEnderecoNumero(endereco) {
    const e = String(endereco || '').replace(/\s+/g, ' ').trim();
    let m = e.match(/^(.*?),\s*([0-9]{1,6}[A-Za-z]?)\s*$/);
    if (m) return { logradouro: m[1].trim(), numero: m[2].trim() };
    m = e.match(/^(.*?)\s*(?:n[ºo]?|num(?:ero)?)\s*\.?\s*([0-9]{1,6}[A-Za-z]?)\s*$/i);
    if (m) return { logradouro: m[1].trim(), numero: m[2].trim() };
    m = e.match(/^(.*?)(?:\s+)([0-9]{1,6}[A-Za-z]?)\s*$/);
    if (m) return { logradouro: m[1].trim(), numero: m[2].trim() };
    return { logradouro: e, numero: '' };
  }

  function csvEscape(v) {
    const s = String(v ?? '');
    if (/[";\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  function downloadCsv(filename, headers, rows) {
    const csv = '\ufeff' + [headers, ...rows].map((row) => row.map(csvEscape).join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function downloadXlsx(filename, sheetName, headers, rows) {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
    XLSX.writeFile(wb, filename);
  }

  function colaboradorAtivo(c) {
    const situacao = normalize(c.situacao);
    return c.ativo === true || (!situacao.includes('nao ativo') && !situacao.includes('inativo'));
  }

  function applyFilters(rows) {
    const f = state.filtros;
    return (rows || []).filter((c) => {
      if (f.situacao === 'Ativo' && !colaboradorAtivo(c)) return false;
      if (f.situacao === 'Não Ativo' && colaboradorAtivo(c)) return false;
      if (f.nome && !normalize(c.nome).includes(normalize(f.nome))) return false;
      if (f.empresa && !normalize(c.empresa).includes(normalize(f.empresa))) return false;
      if (f.coordenacao && !normalize(c.coordenacao).includes(normalize(f.coordenacao))) return false;
      if (f.supervisao && !normalize(c.supervisao).includes(normalize(f.supervisao))) return false;
      const adm = String(c.admissao || '').slice(0, 10);
      if (f.admissaoInicio && (!adm || adm < f.admissaoInicio)) return false;
      if (f.admissaoFim && (!adm || adm > f.admissaoFim)) return false;
      return true;
    });
  }

  async function loadLatestColabs(supabase) {
    const { data: refs, error: refErr } = await supabase
      .from('colaborador_importacoes')
      .select('data_referencia,status')
      .eq('status', 'processado')
      .order('data_referencia', { ascending: false })
      .limit(1);
    if (refErr) throw refErr;
    const ref = refs?.[0]?.data_referencia;
    if (!ref) return [];

    const { data, error } = await supabase
      .from('colaborador_snapshot')
      .select('cpf,nome,situacao,admissao,desligamento,ativo,empresa,coordenacao,supervisao,tipo,cargo,whatsapp,email_pessoal,email_empresa,cep,estado,cidade,bairro,endereco,complemento,data_nascimento,data_referencia')
      .eq('data_referencia', ref)
      .order('nome', { ascending: true })
      .limit(10000);
    if (error) throw error;
    return data || [];
  }

  async function loadPatrimoniosAtraso(supabase) {
    const set = new Set();
    const { data, error } = await supabase
      .from('patrimonios_snapshot')
      .select('funcionario,coordenacao,dias_sem_leitura')
      .limit(10000);
    if (error) return set;
    (data || []).forEach((p) => {
      const nome = String(p.funcionario || '').trim();
      const dias = Number(p.dias_sem_leitura || 0);
      const limite = normalize(p.coordenacao).toUpperCase() === 'GERAL' ? 30 : 10;
      if (nome && dias > limite) set.add(normalize(nome));
    });
    return set;
  }

  function mapGoogleContacts(rows) {
    const headers = ['Name', 'Phone 1 - Value', 'E-mail 1 - Value', 'Organization 1 - Name', 'Notes'];
    const out = rows.map((c) => [
      `${c.nome || ''}${c.supervisao ? ` (${c.supervisao})` : ''}`.trim(),
      c.whatsapp || '',
      c.email_empresa || c.email_pessoal || '',
      c.empresa || '',
      [c.cargo, c.tipo].filter(Boolean).join(' ')
    ]);
    return { headers, rows: out, filename: `Contatos_GoogleContacts_${todayIso()}.csv` };
  }

  function mapBotConversaUsers(rows) {
    const headers = [
      'Primeiro nome', 'Sobrenome', 'Telefone', 'DDD', 'Email', 'CPF', 'Data',
      'Indicações', 'Etiquetas', 'Sequências', 'Campanhas', 'Campos', 'CNPJ',
      'DiaAgendamento', 'Empresa', 'Nome completo', 'Primeiro nome (extra)',
      'Retornar menu', 'Supervisor', 'Valor', 'email (extra)'
    ];
    const out = rows.map((c) => {
      const tel = normalizePhone(c.whatsapp);
      const name = splitName(c.nome);
      const tags = [c.empresa, c.coordenacao, c.supervisao, c.tipo, c.cargo, 'Colaborador']
        .filter(Boolean)
        .map((v) => String(v).trim());
      if (state.patrimoniosAtraso.has(normalize(c.nome))) tags.push('Leitura em Atraso');
      return [
        titleCase(name.first), titleCase(name.last), tel.e164, tel.ddd,
        c.email_empresa || '', normalizeCpf(c.cpf), '', '', [...new Set(tags)].join(', '), '', '', '', '', '',
        '', c.nome || '', titleCase(name.first), '', '', '', ''
      ];
    });
    return { headers, rows: out, filename: `Contatos_BotConversa_${todayIso()}.xlsx` };
  }

  function mapCorreios(rows) {
    const headers = [
      'Cartao_postagem', 'Malote (S ou N)', 'Codigo', 'Nome', 'Email', 'CPF/CNPJ',
      'Telefone', 'Celular', 'CEP', 'Logradouro', 'Número', 'Complemento', 'Bairro', 'Cidade', 'UF'
    ];
    const out = rows
      .filter((c) => c.nome && c.cep && c.cidade && c.bairro && c.endereco)
      .map((c) => {
        const end = splitEnderecoNumero(c.endereco);
        return [
          CARTAO_POSTAGEM, 'N', '', c.nome || '', c.email_empresa || c.email_pessoal || '', normalizeCpf(c.cpf),
          '', onlyDigits(c.whatsapp), onlyDigits(c.cep), end.logradouro, end.numero, c.complemento || '',
          c.bairro || '', c.cidade || '', estadoParaUF(c.estado)
        ];
      });
    return { headers, rows: out, filename: `Correios_${todayIso()}.xlsx` };
  }

  function mapFlash(rows) {
    const headers = ['Nome completo', 'CPF', 'Celular', 'E-mail', 'CNPJ'];
    const out = rows.map((c) => [
      c.nome || '', formatCpf(c.cpf), formatPhoneBr(c.whatsapp), c.email_empresa || '', formatCnpj(CNPJ_PADRAO)
    ]);
    return { headers, rows: out, filename: `Cadastro_Pessoas_Flash_${todayIso()}.xlsx` };
  }

  function mapIfood(rows) {
    const headers = [
      'CNPJ', 'Nome', 'CPF', 'Data de nascimento', 'Email', 'Celular', 'Centro de custo',
      'Grupo de entrega', 'Filtro para relatorio de recarga (opcional)',
      'Refeição (Aderente ao PAT) (opcional)', 'Alimentação (Aderente ao PAT) (opcional)', 'Livre (opcional)'
    ];
    const out = rows.map((c) => [
      formatCnpj(CNPJ_PADRAO), c.nome || '', formatCpf(c.cpf), brDate(c.data_nascimento),
      c.email_empresa || '', formatPhoneBr(c.whatsapp), '', '', '', '', '', ''
    ]);
    return { headers, rows: out, filename: `Cadastro_Pessoas_Ifood_${todayIso()}.xlsx` };
  }

  function mapUber(rows) {
    const headers = [
      'First Name', 'Last Name', 'Email Address', 'ID (Optional)', 'Group Name (Optional)',
      'Reviewer Email (Optional)', 'Mobile Country Code', 'Mobile Number'
    ];
    const out = rows
      .filter((c) => c.nome && (c.email_empresa || c.email_pessoal) && normalizePhone(c.whatsapp).national)
      .map((c) => {
        const name = splitName(c.nome);
        const tel = normalizePhone(c.whatsapp);
        return [name.first, name.last, c.email_empresa || c.email_pessoal || '', normalizeCpf(c.cpf), c.coordenacao || '', '', '+55', tel.national];
      });
    return { headers, rows: out, filename: `Cadastro_Uber_${todayIso()}.csv` };
  }

  function styles() {
    return `<style>
      .ct-wrap{padding:16px;color:#e5e7eb;font-family:Arial,sans-serif}
      .ct-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap}
      .ct-title h2{font-size:24px;margin:0 0 6px;color:#f8fafc}.ct-title p{margin:0;color:#94a3b8;font-size:13px;line-height:1.45}
      .ct-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 16px}.ct-tab{border:1px solid #1e293b;background:#0f172a;color:#e5e7eb;border-radius:999px;padding:10px 13px;font-weight:700;cursor:pointer}.ct-tab.active{background:#166534;border-color:#22c55e;color:#fff}
      .ct-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}.ct-card{background:#0f172a;border:1px solid #1e293b;border-radius:18px;padding:16px;box-shadow:0 12px 28px rgba(0,0,0,.22)}
      .ct-card h3{margin:0 0 8px;font-size:16px}.ct-card p{margin:0;color:#94a3b8;font-size:12px;line-height:1.45}.ct-card strong{color:#e5e7eb}
      .ct-filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-bottom:12px}.ct-field label{display:block;font-size:12px;color:#94a3b8;margin-bottom:5px}.ct-field input,.ct-field select{width:100%;background:#0f172a;color:#e5e7eb;color-scheme:dark;border:1px solid #334155;border-radius:12px;padding:10px 12px;outline:none}.ct-field option{background:#0f172a;color:#e5e7eb}.ct-field input:focus,.ct-field select:focus{border-color:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.12)}
      .ct-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.ct-btn{background:#166534;color:#fff;border:0;border-radius:12px;padding:10px 13px;font-weight:800;cursor:pointer}.ct-btn.sec{background:#1e293b}.ct-btn.warn{background:#92400e}.ct-btn:disabled{opacity:.6;cursor:not-allowed}
      .ct-alert{border:1px solid #1e293b;border-radius:14px;padding:12px;background:#020617;color:#cbd5e1;font-size:12px;line-height:1.5}.ct-ok{border-color:#166534;background:#052e16}.ct-err{border-color:#7f1d1d;background:#3f0d0d}.ct-preview{overflow:auto;max-height:360px;border:1px solid #1e293b;border-radius:14px;margin-top:12px}.ct-table{width:100%;border-collapse:collapse;font-size:12px}.ct-table th,.ct-table td{border-bottom:1px solid #1e293b;padding:9px;text-align:left;white-space:nowrap}.ct-table th{background:#111827;color:#cbd5e1;position:sticky;top:0}.ct-muted{color:#94a3b8;font-size:12px}.ct-kpi{font-size:24px;font-weight:900;color:#fff;margin-top:8px}
    </style>`;
  }

  function renderPreview(container, spec, limit = 30) {
    const target = container.querySelector('#ct_preview');
    if (!target) return;
    const rows = spec.rows.slice(0, limit);
    target.innerHTML = `
      <div class="ct-preview">
        <table class="ct-table">
          <thead><tr>${spec.headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
          <tbody>${rows.map((row) => `<tr>${row.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>
      <div class="ct-muted" style="margin-top:8px">Prévia com ${rows.length} de ${spec.rows.length} registros.</div>
    `;
  }

  function currentRows() {
    return applyFilters(state.colaboradores);
  }

  function exportByType(type, container) {
    const rows = currentRows();
    let spec;
    if (type === 'google') spec = mapGoogleContacts(rows);
    if (type === 'bot') spec = mapBotConversaUsers(rows);
    if (type === 'correios') spec = mapCorreios(rows);
    if (type === 'flash') spec = mapFlash(rows);
    if (type === 'ifood') spec = mapIfood(rows);
    if (type === 'uber') spec = mapUber(rows);
    if (!spec) return;

    if (type === 'google' || type === 'uber') downloadCsv(spec.filename, spec.headers, spec.rows);
    else downloadXlsx(spec.filename, type === 'bot' ? 'Users' : type.toUpperCase(), spec.headers, spec.rows);
    renderPreview(container, spec);
    setStatus(container, `Arquivo gerado: ${spec.filename} · ${spec.rows.length} registros.`, 'ok');
  }

  function setStatus(container, text, mode = '') {
    const el = container.querySelector('#ct_status');
    if (!el) return;
    el.className = `ct-alert ${mode === 'ok' ? 'ct-ok' : mode === 'err' ? 'ct-err' : ''}`;
    el.textContent = text;
  }

  function readFilters(container) {
    const val = (id) => String(container.querySelector(id)?.value || '').trim();
    state.filtros = {
      situacao: val('#ct_situacao') || 'Ativo',
      nome: val('#ct_nome'),
      empresa: val('#ct_empresa'),
      coordenacao: val('#ct_coordenacao'),
      supervisao: val('#ct_supervisao'),
      admissaoInicio: val('#ct_adm_ini'),
      admissaoFim: val('#ct_adm_fim')
    };
  }

  function renderBase(container) {
    const rows = currentRows();
    container.innerHTML = `
      ${styles()}
      <div class="ct-wrap">
        <div class="ct-head">
          <div class="ct-title">
            <h2>Contatos e Cadastros</h2>
            <p>Migração das rotinas da planilha de contatos para o painel. Use os filtros e gere os arquivos sem abrir o Google Sheets.</p>
          </div>
          <div class="ct-card" style="min-width:220px"><p>Registros carregados</p><div class="ct-kpi">${state.colaboradores.length}</div><p>Filtrados: <strong>${rows.length}</strong></p></div>
        </div>

        <div class="ct-card">
          <h3>Filtros</h3>
          <div class="ct-filters">
            <div class="ct-field"><label>Situação</label><select id="ct_situacao"><option>Ativo</option><option>Não Ativo</option><option>Todos</option></select></div>
            <div class="ct-field"><label>Nome</label><input id="ct_nome" placeholder="Buscar colaborador"></div>
            <div class="ct-field"><label>Empresa</label><input id="ct_empresa" placeholder="Empresa"></div>
            <div class="ct-field"><label>Coordenação</label><input id="ct_coordenacao" placeholder="Coordenação"></div>
            <div class="ct-field"><label>Supervisão</label><input id="ct_supervisao" placeholder="Supervisão"></div>
            <div class="ct-field"><label>Admissão inicial</label><input id="ct_adm_ini" type="date"></div>
            <div class="ct-field"><label>Admissão final</label><input id="ct_adm_fim" type="date"></div>
          </div>
          <div class="ct-actions">
            <button class="ct-btn" id="ct_apply">Aplicar filtros</button>
            <button class="ct-btn sec" id="ct_reload">Recarregar base</button>
          </div>
        </div>

        <div class="ct-tabs">
          <button class="ct-tab active" data-tab="exports">Exportações</button>
          <button class="ct-tab" data-tab="bot">BotConversa</button>
          <button class="ct-tab" data-tab="preview">Prévia</button>
        </div>

        <div id="ct_tab_content"></div>
        <div id="ct_status" class="ct-alert" style="margin-top:14px">Pronto. Selecione uma exportação.</div>
        <div id="ct_preview"></div>
      </div>
    `;

    Object.entries(state.filtros).forEach(([key, value]) => {
      const map = { situacao: '#ct_situacao', nome: '#ct_nome', empresa: '#ct_empresa', coordenacao: '#ct_coordenacao', supervisao: '#ct_supervisao', admissaoInicio: '#ct_adm_ini', admissaoFim: '#ct_adm_fim' };
      const el = container.querySelector(map[key]);
      if (el) el.value = value || (key === 'situacao' ? 'Ativo' : '');
    });

    container.querySelector('#ct_apply').onclick = () => { readFilters(container); renderBase(container); };
    container.querySelector('#ct_reload').onclick = async () => { await loadAndRender(container, window.CONTATOS.__opts); };
    container.querySelectorAll('.ct-tab').forEach((btn) => {
      btn.onclick = () => {
        container.querySelectorAll('.ct-tab').forEach((b) => b.classList.toggle('active', b === btn));
        renderTab(container, btn.dataset.tab);
      };
    });
    renderTab(container, 'exports');
  }

  function renderTab(container, tab) {
    const content = container.querySelector('#ct_tab_content');
    if (!content) return;
    const rows = currentRows();

    if (tab === 'exports') {
      content.innerHTML = `
        <div class="ct-grid">
          <div class="ct-card"><h3>Google Contatos</h3><p>CSV compatível com importação no Google Contacts.</p><div class="ct-actions"><button class="ct-btn" data-export="google">Gerar CSV</button></div></div>
          <div class="ct-card"><h3>Correios</h3><p>XLSX com cartão de postagem, malote N e endereço separado.</p><div class="ct-actions"><button class="ct-btn" data-export="correios">Gerar XLSX</button></div></div>
          <div class="ct-card"><h3>Flash</h3><p>XLSX para cadastro de pessoas Flash.</p><div class="ct-actions"><button class="ct-btn" data-export="flash">Gerar XLSX</button></div></div>
          <div class="ct-card"><h3>iFood</h3><p>XLSX para cadastro de pessoas iFood Benefícios.</p><div class="ct-actions"><button class="ct-btn" data-export="ifood">Gerar XLSX</button></div></div>
          <div class="ct-card"><h3>Uber Empresas</h3><p>CSV com e-mail, telefone, CPF e grupo pela coordenação.</p><div class="ct-actions"><button class="ct-btn" data-export="uber">Gerar CSV</button></div></div>
          <div class="ct-card"><h3>Users BotConversa</h3><p>XLSX no layout da aba Users, com tags por empresa, coordenação, supervisão, tipo e cargo.</p><div class="ct-actions"><button class="ct-btn" data-export="bot">Gerar XLSX</button></div></div>
        </div>
      `;
      content.querySelectorAll('[data-export]').forEach((btn) => {
        btn.onclick = () => exportByType(btn.dataset.export, container);
      });
      setStatus(container, `${rows.length} colaboradores prontos para exportação.`, '');
      return;
    }

    if (tab === 'bot') {
      content.innerHTML = `
        <div class="ct-grid">
          <div class="ct-card">
            <h3>Sincronizar BotConversa</h3>
            <p>Chama a rotina já existente do painel para criar/localizar subscribers e sincronizar tags.</p>
            <div class="ct-actions"><button class="ct-btn" id="ct_sync_bot">Sincronizar contatos e tags</button></div>
          </div>
          <div class="ct-card">
            <h3>Leitura em atraso</h3>
            <p>Quando existir base de patrimônios no Supabase, contatos com leitura atrasada recebem a tag <strong>Leitura em Atraso</strong> na exportação Users.</p>
            <div class="ct-kpi">${state.patrimoniosAtraso.size}</div>
          </div>
        </div>
      `;
      content.querySelector('#ct_sync_bot').onclick = async () => {
        const btn = content.querySelector('#ct_sync_bot');
        btn.disabled = true;
        btn.textContent = 'Sincronizando...';
        try {
          const resp = await fetch('/api/botconversa/sync-subscribers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) });
          const data = await resp.json().catch(() => ({}));
          if (!resp.ok || data?.ok === false) throw new Error(data?.error || 'Falha ao sincronizar BotConversa.');
          setStatus(container, 'Sincronização enviada com sucesso.', 'ok');
        } catch (err) {
          setStatus(container, err?.message || 'Erro ao sincronizar BotConversa.', 'err');
        } finally {
          btn.disabled = false;
          btn.textContent = 'Sincronizar contatos e tags';
        }
      };
      return;
    }

    if (tab === 'preview') {
      const spec = mapGoogleContacts(rows);
      content.innerHTML = '<div class="ct-card"><h3>Prévia da base filtrada</h3><p>Modelo Google Contacts usado apenas para conferência visual.</p></div>';
      renderPreview(container, spec, 80);
    }
  }

  async function loadAndRender(container, opts) {
    try {
      state.loading = true;
      container.innerHTML = `${styles()}<div class="ct-wrap"><div class="ct-alert">Carregando colaboradores e patrimônios...</div></div>`;
      state.colaboradores = await loadLatestColabs(opts.supabase);
      state.patrimoniosAtraso = await loadPatrimoniosAtraso(opts.supabase);
      renderBase(container);
    } catch (err) {
      container.innerHTML = `${styles()}<div class="ct-wrap"><div class="ct-alert ct-err">${esc(err?.message || err || 'Erro ao carregar contatos.')}</div></div>`;
    } finally {
      state.loading = false;
    }
  }

  window.CONTATOS = {
    __opts: null,
    openHome(container, opts = {}) {
      this.__opts = opts;
      loadAndRender(container, opts);
    }
  };
})();
