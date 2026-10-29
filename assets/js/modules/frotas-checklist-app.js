import { ESTILOS_LISTA, cardFiltro, ligarCards, sincronizarCards, iconBtn } from './frotas-ui-lista.js?v=20261029-frotas-inst89';
import { agruparPorPlaca, assinaturasDoRegistro, condicaoGeral, fotosDoRegistro, mensagemNotificacao, normalizarFone, presetManutencao, soDigitos, textosDe } from './frotas-checklist-app-regras.js?v=20261029-frotas-inst89';

// Frotas > Cadastros > Checklist: checklists preenchidos no app da BFleet (inspeção pré-operacional com fotos), agrupados por placa.
// Dados de frotas_checklist_respostas (sync-bfleet-checklists, a cada 30 min).
// Ações da linha: Abrir (todos os checklists da placa, cada um com "ver" e as fotos em grade de 3 colunas),
// Notificar (WhatsApp ao condutor pedindo a atualização) e Manutenção (solicitação na Corretiva; a equipe decide se e quando fazer).
(function () {
  const MODULE_NAME = 'FROTAS_CHECKLIST_APP';
  const LIMITE = 5000;

  const styles = `
    <style>
      .fm-shell{color:#e2e2f0}.fm-head{margin-bottom:18px}.fm-kicker{color:#86efac;text-transform:uppercase;letter-spacing:.14em;font-weight:950;font-size:12px}.fm-title{margin:8px 0 6px;font-size:clamp(24px,2.4vw,34px);letter-spacing:-.04em;color:#f8fafc}.fm-sub{max-width:900px;color:#6b7280;line-height:1.55;margin:0}.fm-card{border:1px solid rgba(148,163,184,.16);border-radius:24px;background:radial-gradient(circle at top left,rgba(34,197,94,.13),transparent 34%),linear-gradient(180deg,rgba(15,23,42,.98),rgba(2,6,23,.98));box-shadow:0 20px 60px rgba(0,0,0,.28);overflow:hidden}.fm-body{padding:18px}.fm-toolbar{display:grid;grid-template-columns:minmax(220px,1fr) auto auto;gap:10px;margin-bottom:14px}.fm-input,.fm-select{width:100%;height:42px;border:1px solid rgba(148,163,184,.18);border-radius:14px;background:#0d0d18;color:#e2e2f0;padding:0 12px;outline:none;color-scheme:dark}.fm-select option{background:#0d0d18;color:#e2e2f0}.fm-btn{border:0;border-radius:14px;min-height:42px;padding:0 14px;font-weight:950;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px}.fm-btn.primary{background:linear-gradient(135deg,#16a34a,#22c55e);color:#052e16}.fm-btn.soft{border:1px solid rgba(34,197,94,.24);background:rgba(34,197,94,.12);color:#86efac}.fm-btn.ghost{border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.72);color:#cbd5e1}.fm-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:14px 0}.fm-kpi{border:1px solid rgba(34,197,94,.18);background:rgba(2,6,23,.32);border-radius:14px;padding:12px 14px;min-width:0}.fm-kpi span{display:block;color:#93c5fd;font-size:10px;font-weight:950;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fm-kpi strong{display:block;margin-top:7px;color:#fff;font-size:22px;line-height:1}.fm-table-wrap{overflow:auto;border:1px solid rgba(148,163,184,.14);border-radius:18px}.fm-table{width:100%;border-collapse:collapse;min-width:1000px}.fm-table th{padding:12px 11px;color:#bfdbfe;font-size:11px;letter-spacing:.1em;text-transform:uppercase;text-align:left;border-bottom:1px solid rgba(148,163,184,.16);background:rgba(2,6,23,.38)}.fm-table td{padding:12px 11px;border-bottom:1px solid rgba(148,163,184,.10);color:#e2e2f0;font-size:13px;vertical-align:top}.fm-table tr:hover td{background:rgba(22,101,52,.08)}.fm-badge{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:950;border:1px solid rgba(148,163,184,.18);color:#cbd5e1;background:rgba(15,23,42,.72);white-space:nowrap}.fm-badge.ok{border-color:rgba(34,197,94,.35);background:rgba(22,101,52,.24);color:#bbf7d0}.fm-badge.warn{border-color:rgba(245,158,11,.34);background:rgba(245,158,11,.12);color:#fde68a}.fm-badge.err{border-color:rgba(239,68,68,.34);background:rgba(239,68,68,.12);color:#fecaca}.fm-mini{min-height:32px;border-radius:10px;padding:0 10px;font-size:11px}.fm-form{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:0 0 16px;padding:14px;border:1px solid rgba(34,197,94,.18);background:rgba(2,6,23,.32);border-radius:18px}.fm-field label{display:block;margin:0 0 6px;color:#bbf7d0;font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}.fm-field.full{grid-column:1/-1}.fm-field textarea{width:100%;min-height:68px;resize:vertical;border:1px solid rgba(148,163,184,.18);border-radius:14px;background:#0d0d18;color:#e2e2f0;padding:12px;outline:none}.fm-note{margin-top:12px;padding:12px 14px;border:1px dashed rgba(34,197,94,.28);border-radius:16px;background:rgba(2,6,23,.26);color:#bfdbfe;font-size:12px;line-height:1.5}.fm-empty{text-align:center;color:#f8fafc;padding:26px!important;font-weight:850}.fm-toast{position:fixed;right:22px;bottom:22px;z-index:9999;border:1px solid rgba(134,239,172,.32);background:rgba(22,101,52,.96);color:#dcfce7;border-radius:16px;padding:12px 14px;font-weight:950;box-shadow:0 16px 45px rgba(0,0,0,.35);opacity:0;transform:translateY(10px);pointer-events:none;transition:.2s ease}.fm-toast.show{opacity:1;transform:translateY(0)}.fm-itens{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.fm-item-row{display:flex;align-items:center;gap:8px;border:1px solid rgba(148,163,184,.14);border-radius:12px;padding:8px 10px;background:rgba(2,6,23,.28)}.fm-item-row span{flex:1;font-size:12px;color:#e2e2f0}.fm-item-row select{width:120px;height:34px;border-radius:10px;border:1px solid rgba(148,163,184,.18);background:#0d0d18;color:#e2e2f0;font-size:11px}@media(max-width:1200px){.fm-toolbar{grid-template-columns:1fr 1fr}.fm-grid{grid-template-columns:repeat(2,1fr)}.fm-form{grid-template-columns:repeat(2,1fr)}.fm-itens{grid-template-columns:1fr}}@media(max-width:680px){.fm-toolbar,.fm-grid,.fm-form{grid-template-columns:1fr}}
      ${ESTILOS_LISTA}
      .fm-sort{appearance:none;border:0;background:transparent;color:inherit;font:inherit;font-weight:950;text-transform:uppercase;letter-spacing:.1em;cursor:pointer;padding:0;display:inline-flex;align-items:center;gap:6px}.fm-sort:hover{color:#fff}.fm-sort-mark{font-size:10px;color:#86efac}
      .fm-actions{display:flex;gap:6px}
      .ck-janela-topo a{color:#86efac}
      .ck-ativo{border-color:#22c55e!important;color:#86efac!important;background:rgba(34,197,94,.16)!important}
      .fm-table tbody tr.ck-aberto td{padding:0;background:rgba(2,6,23,.55)!important;border-bottom:1px solid rgba(34,197,94,.28)}
      .ck-lista{margin:0;padding:12px 16px 16px;border-left:3px solid #22c55e}
      .ck-lista-topo{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 10px;color:#94a3b8;font-size:12px;font-weight:800}
      .ck-mini{min-width:0!important;width:100%}.ck-mini th{position:static!important}
      .ck-grade{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
      .ck-foto{margin:0;border:1px solid rgba(148,163,184,.2);border-radius:14px;overflow:hidden;background:#0d0d18}
      .ck-foto a{display:block}.ck-foto img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;background:#0b1224}
      .ck-foto figcaption{padding:8px 10px;font-size:12px;font-weight:800;color:#cbd5e1;line-height:1.3}
      .ck-secao{margin:0 0 20px}.ck-secao h4{margin:0 0 10px;color:#bbf7d0;font-size:12px;letter-spacing:.1em;text-transform:uppercase}
      .ck-texto{border:1px solid rgba(148,163,184,.18);border-radius:12px;padding:10px 12px;background:rgba(2,6,23,.4);white-space:pre-wrap;line-height:1.45;margin:0 0 8px}
      .ck-texto b{display:block;color:#94a3b8;font-size:11px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:3px}
      .ck-assinatura img{max-width:280px;background:#fff;border-radius:10px;padding:6px}
      .ck-overlay{position:fixed;inset:0;z-index:9000;background:rgba(2,6,23,.78);display:flex;align-items:flex-start;justify-content:center;padding:24px 14px;overflow:auto}
      .ck-janela{width:min(1040px,100%);border:1px solid rgba(148,163,184,.2);border-radius:20px;background:linear-gradient(180deg,#0f172a,#020617);box-shadow:0 24px 70px rgba(0,0,0,.5);color:#e2e2f0}
      .ck-janela.estreita{width:min(640px,100%)}
      .ck-janela-topo{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:18px 20px;border-bottom:1px solid rgba(148,163,184,.14)}
      .ck-janela-topo h3{margin:0 0 4px;font-size:20px;color:#f8fafc}.ck-janela-topo small{color:#94a3b8}
      .ck-janela-corpo{padding:18px 20px 22px}
      .ck-janela-corpo label{display:block;margin:12px 0 6px;color:#bbf7d0;font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em}
      .ck-janela-corpo textarea{width:100%;min-height:210px;resize:vertical}
      .ck-rodape{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:16px}
      .ck-sub{color:#94a3b8;font-size:12px}
      @media(max-width:720px){.ck-grade{grid-template-columns:repeat(2,minmax(0,1fr))}}
    </style>`;

  const state = { registros: [], veiculos: new Map(), notificacoes: new Map(), grupos: [], abertas: new Set(), filtro: 'todos', busca: '', loading: false, sortKey: 'data', sortDir: 'asc', opts: null };

  function esc(v){ return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c])); }
  function norm(v){ return String(v||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase(); }
  function toast(msg, error=false){ let el=document.querySelector('.fm-toast'); if(!el){el=document.createElement('div');el.className='fm-toast';document.body.appendChild(el);} el.textContent=msg; el.style.background=error?'rgba(127,29,29,.96)':'rgba(22,101,52,.96)'; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),3800); }
  function fmtDateBr(iso){ const m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'; }
  function fmtHora(h){ const m=String(h||'').match(/^(\d{2}):(\d{2})/); return m ? `${m[1]}:${m[2]}` : ''; }
  function fmtDataHoraBr(iso){ const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }); }
  function formatarPlaca(p){ const s=String(p||''); return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(s) ? `${s.slice(0,3)}-${s.slice(3)}` : (s || '—'); }
  function hojeIso(){ const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10); }
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

  const ICONES = {
    abrir: '<svg viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></svg>',
    notificar: '<svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
    manutencao: '<svg viewBox="0 0 24 24"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4Z"/></svg>',
    ver: '<svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
  };

  // ---------- lista agrupada por placa ----------
  const FILTROS = {
    todos: () => true,
    em_dia: (g) => !g.vencido,
    vencidos: (g) => g.vencido,
  };

  const ORDEM = {
    placa: (g) => g.placa,
    motorista: (g) => String(g.ultimo.motorista || ''),
    data: (g) => `${g.ultimo.data_execucao || ''} ${g.ultimo.hora_execucao || ''}`,
    fotos: (g) => Number(g.ultimo.total_fotos) || 0,
  };

  function compareGrupos(a, b){
    const f = ORDEM[state.sortKey] || ORDEM.data;
    const av = f(a), bv = f(b);
    const r = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv), 'pt-BR', { numeric: true, sensitivity: 'base' });
    if(r === 0) return a.placa.localeCompare(b.placa, 'pt-BR');
    return state.sortDir === 'asc' ? r : -r;
  }

  function markFor(key){ return state.sortKey === key ? `<span class="fm-sort-mark">${state.sortDir === 'asc' ? '▲' : '▼'}</span>` : ''; }
  function refreshSortHeaders(root){ root.querySelectorAll('[data-sort]').forEach(btn => { btn.innerHTML = `${btn.dataset.label} ${markFor(btn.dataset.sort)}`; }); }
  function bindSort(root){
    root.querySelectorAll('[data-sort]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.sort;
        if(state.sortKey === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        else { state.sortKey = key; state.sortDir = key === 'fotos' ? 'desc' : 'asc'; }
        renderTable(root);
      });
    });
  }

  function getFiltered(){
    const busca = norm(state.busca);
    let rows = state.grupos.filter(FILTROS[state.filtro] || FILTROS.todos);
    if(busca) rows = rows.filter(g => norm([g.placa, g.ultimo.motorista, state.veiculos.get(g.veiculo_id)?.marca_modelo, state.veiculos.get(g.veiculo_id)?.motorista_atual].join(' ')).includes(busca));
    return [...rows].sort(compareGrupos);
  }

  function reagrupar(){ state.grupos = agruparPorPlaca(state.registros, hojeIso()); }

  async function carregar(root){
    const { supabase } = state.opts;
    state.loading = true; renderTable(root);
    const [veic, resp, notif] = await Promise.all([
      supabase.from('frotas_veiculos').select('id,placa,marca_modelo,motorista_atual'),
      supabase.from('frotas_checklist_respostas').select('*').order('data_execucao', { ascending: false }).order('hora_execucao', { ascending: false }).limit(LIMITE),
      supabase.from('frotas_checklist_notificacoes').select('placa,acao,usuario_nome,criado_em').order('criado_em', { ascending: false }).limit(2000),
    ]);
    state.veiculos = new Map((veic.data || []).map(v => [v.id, v]));
    // Sem a tabela de notificações (ou sem permissão) a lista segue sem o aviso "Notificado em".
    state.notificacoes = new Map();
    for(const n of (notif.data || [])) if(!state.notificacoes.has(n.placa)) state.notificacoes.set(n.placa, n);
    if(resp.error){ toast(resp.error.message || 'Erro ao carregar os checklists.', true); state.registros = []; }
    else state.registros = resp.data || [];
    reagrupar();
    state.loading = false; renderStats(root); renderTable(root);
  }

  async function buscarNaBfleet(root, btn){
    btn.disabled = true; const antes = btn.textContent; btn.textContent = 'Buscando…';
    try {
      const d = new Date(); d.setUTCDate(d.getUTCDate() - 14);
      const f = new Date(); f.setUTCDate(f.getUTCDate() + 1);
      const { data, error } = await state.opts.supabase.functions.invoke('sync-bfleet-checklists', { body: { inicio: d.toISOString().slice(0,10), fim: f.toISOString().slice(0,10) } });
      if(error) throw new Error((await error.context?.text?.().catch(() => ''))?.slice(0, 200) || error.message);
      if(data?.ok === false) throw new Error(data.error || 'A BFleet não respondeu.');
      toast(`${data.recebidas} resposta(s) na BFleet, ${data.novas} nova(s).`);
      await carregar(root);
    } catch(err){
      toast(err.message || 'Não foi possível buscar na BFleet.', true);
    } finally { btn.disabled = false; btn.textContent = antes; }
  }

  function renderStats(root){
    const set = (k, v) => { const el = root.querySelector(`[data-kpi-${k}]`); if(el) el.textContent = v; };
    set('total', state.grupos.length);
    set('em-dia', state.grupos.filter(FILTROS.em_dia).length);
    set('vencidos', state.grupos.filter(FILTROS.vencidos).length);
  }

  function dataCelula(g){
    const aviso = g.dias == null ? '' : (g.vencido
      ? `<br><span class="fm-badge err" title="O último checklist foi há mais de 30 dias.">Vencido · há ${plural(g.dias, 'dia', 'dias')}</span>`
      : `<br><small>${g.dias === 0 ? 'hoje' : `há ${plural(g.dias, 'dia', 'dias')}`}</small>`);
    const n = state.notificacoes.get(g.placa);
    const notificado = n ? `<br><small title="${esc(n.usuario_nome ? `Por ${n.usuario_nome}` : '')}">🔔 Notificado em ${esc(fmtDataHoraBr(n.criado_em))}</small>` : '';
    return `${fmtDateBr(g.ultimo.data_execucao)}${fmtHora(g.ultimo.hora_execucao) ? ` <small>${esc(fmtHora(g.ultimo.hora_execucao))}</small>` : ''}${aviso}${notificado}`;
  }

  function renderTable(root){
    const tbody = root.querySelector('[data-registros-table]'); if(!tbody) return;
    refreshSortHeaders(root);
    if(state.loading){ tbody.innerHTML = '<tr><td colspan="5" class="fm-empty">Carregando checklists...</td></tr>'; return; }
    const rows = getFiltered();
    root.querySelector('[data-count]').textContent = `${rows.length} de ${state.grupos.length} veículo(s)`;
    if(!rows.length){ tbody.innerHTML = '<tr><td colspan="5" class="fm-empty">Nenhum veículo encontrado com esse filtro.</td></tr>'; return; }
    tbody.innerHTML = rows.map(g => {
      const v = state.veiculos.get(g.veiculo_id);
      const qtd = g.registros.length;
      const aberta = state.abertas.has(g.placa);
      return `
      <tr>
        <td><strong>${esc(formatarPlaca(g.placa))}</strong>${v?.marca_modelo ? `<br><small>${esc(v.marca_modelo)}</small>` : (g.veiculo_id ? '' : '<br><span class="fm-badge warn" title="A placa não está em Frotas > Veículos.">Fora do cadastro</span>')}<br><small>${plural(qtd, 'checklist', 'checklists')}</small></td>
        <td>${esc(g.ultimo.motorista || '—')}</td>
        <td class="fm-cell">${dataCelula(g)}</td>
        <td><span class="fm-badge ${g.ultimo.total_fotos ? 'ok' : 'warn'}">${g.ultimo.total_fotos || 0} foto(s)</span></td>
        <td><div class="fm-actions">${iconBtn('data-abrir', g.placa, aberta ? 'ck-ativo' : '', aberta ? 'Fechar a lista de checklists desta placa' : 'Abrir: todos os checklists desta placa', ICONES.abrir)}${iconBtn('data-notificar', g.placa, '', 'Notificar o condutor para atualizar o checklist', ICONES.notificar)}${iconBtn('data-manutencao', g.placa, 'termo', 'Pedir manutenção pela condição descrita no checklist mais recente', ICONES.manutencao)}</div></td>
      </tr>${aberta ? `<tr class="ck-aberto"><td colspan="5">${listaHtml(g)}</td></tr>` : ''}`;
    }).join('');
    const grupoDe = (placa) => state.grupos.find(g => g.placa === placa);
    tbody.querySelectorAll('[data-abrir]').forEach(b => b.addEventListener('click', () => alternarLista(root, b.dataset.abrir)));
    tbody.querySelectorAll('[data-ver]').forEach(b => b.addEventListener('click', () => abrirDetalhe(state.registros.find(r => r.id === b.dataset.ver))));
    tbody.querySelectorAll('[data-notificar]').forEach(b => b.addEventListener('click', () => abrirNotificar(root, grupoDe(b.dataset.notificar))));
    tbody.querySelectorAll('[data-manutencao]').forEach(b => b.addEventListener('click', () => abrirManutencao(grupoDe(b.dataset.manutencao))));
  }

  // ---------- janelas ----------
  // Cada janela é uma camada; ESC e clique fora fecham só a de cima.
  function abrirJanela(html, { estreita = false } = {}){
    const el = document.createElement('div');
    el.className = 'ck-overlay';
    el.innerHTML = `<div class="ck-janela${estreita ? ' estreita' : ''}" role="dialog" aria-modal="true">${html}</div>`;
    const fechar = () => { document.removeEventListener('keydown', aoTecla); el.remove(); };
    const aoTecla = (e) => {
      if(e.key !== 'Escape') return;
      const camadas = document.querySelectorAll('.ck-overlay');
      if(camadas[camadas.length - 1] === el) fechar();
    };
    el.addEventListener('click', (e) => { if(e.target === el || e.target.closest('[data-fechar]')) fechar(); });
    document.addEventListener('keydown', aoTecla);
    document.body.appendChild(el);
    el.__fechar = fechar;
    return el;
  }

  function topoJanela(titulo, sub){
    return `<div class="ck-janela-topo"><div><h3>${titulo}</h3><small>${sub}</small></div><button type="button" class="fm-btn ghost" data-fechar>✕ Fechar</button></div>`;
  }

  // "Abrir": a lista de todos os checklists da placa aparece no próprio card, logo abaixo da linha do veículo
  // (clicar de novo, ou em "Fechar lista", recolhe). Cada linha tem "ver", que abre o checklist com as fotos.
  function alternarLista(root, placa){
    if(state.abertas.has(placa)) state.abertas.delete(placa); else state.abertas.add(placa);
    renderTable(root);
  }

  function listaHtml(g){
    const linhas = g.registros.map(r => {
      const condicao = condicaoGeral(r);
      return `<tr>
        <td>${fmtDateBr(r.data_execucao)} <small>${esc(fmtHora(r.hora_execucao))}</small>${r.folio ? `<br><small>nº ${esc(r.folio)}</small>` : ''}</td>
        <td>${esc(r.motorista || '—')}</td>
        <td><span class="fm-badge ${r.total_fotos ? 'ok' : 'warn'}">${r.total_fotos || 0} foto(s)</span></td>
        <td class="fm-cell">${condicao ? esc(condicao.length > 110 ? `${condicao.slice(0, 110)}…` : condicao) : '—'}</td>
        <td><div class="fm-actions">${iconBtn('data-ver', r.id, '', 'Ver o checklist com as fotos', ICONES.ver)}</div></td>
      </tr>`;
    }).join('');
    return `<div class="ck-lista"><div class="ck-lista-topo"><span>${plural(g.registros.length, 'checklist', 'checklists')} · do mais recente para o mais antigo</span><button type="button" class="fm-btn ghost" data-abrir="${esc(g.placa)}">Fechar lista</button></div><table class="fm-table ck-mini"><thead><tr><th>Data</th><th>Motorista</th><th>Fotos</th><th>Condição geral</th><th style="width:1%">Ver</th></tr></thead><tbody>${linhas}</tbody></table></div>`;
  }

  // Um checklist: textos, fotos em grade de 3 colunas (com o nome do item embaixo) e assinatura.
  function abrirDetalhe(r){
    if(!r) return;
    const v = state.veiculos.get(r.veiculo_id);
    const mapa = r.latitude != null && r.longitude != null ? ` · <a href="https://www.google.com/maps?q=${esc(r.latitude)},${esc(r.longitude)}" target="_blank" rel="noopener noreferrer">ver local</a>` : '';
    const corrigida = r.placa_aproximada ? `<br><small>Placa digitada: ${esc(r.placa_original || '')} (corrigida pela mais parecida do cadastro)</small>` : '';
    const textos = textosDe(r).map(t => `<div class="ck-texto"><b>${esc(t.rotulo)}</b>${esc(t.valor)}</div>`).join('');
    const fotos = fotosDoRegistro(r).map(f => `<figure class="ck-foto"><a href="${esc(f.url)}" target="_blank" rel="noopener noreferrer" title="Abrir em tamanho real"><img src="${esc(f.url)}" alt="${esc(f.rotulo)}" loading="lazy"></a><figcaption>${esc(f.rotulo)}</figcaption></figure>`).join('');
    const assinaturas = assinaturasDoRegistro(r).map(u => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer"><img src="${esc(u)}" alt="Assinatura" loading="lazy"></a>`).join('');
    abrirJanela(`${topoJanela(`${esc(formatarPlaca(r.placa))}${v?.marca_modelo ? ` · ${esc(v.marca_modelo)}` : ''}`, `${fmtDateBr(r.data_execucao)} ${esc(fmtHora(r.hora_execucao))} · ${esc(r.motorista || 'Motorista não informado')}${r.folio ? ` · nº ${esc(r.folio)}` : ''}${mapa}${corrigida}`)}<div class="ck-janela-corpo">${textos ? `<div class="ck-secao"><h4>Respostas</h4>${textos}</div>` : ''}${fotos ? `<div class="ck-secao"><h4>Fotos (${fotosDoRegistro(r).length})</h4><div class="ck-grade">${fotos}</div></div>` : ''}${assinaturas ? `<div class="ck-secao ck-assinatura"><h4>Assinatura</h4>${assinaturas}</div>` : ''}${!textos && !fotos && !assinaturas ? '<p>Esta resposta não trouxe itens.</p>' : ''}</div>`);
  }

  // ---------- notificar o condutor ----------
  async function buscarContato(supabase, nome){
    const termo = String(nome || '').trim().replace(/[%_]/g, ' ');
    let whatsapp = '';
    if(!termo) return whatsapp;
    try {
      const { data } = await supabase.from('colaboradores_atuais').select('nome,whatsapp,ativo').ilike('nome', termo).limit(5);
      const c = (data || []).find(x => x.ativo) || (data || [])[0];
      if(c) whatsapp = soDigitos(c.whatsapp);
    } catch(err){ console.warn('[checklist] contato (colaboradores_atuais):', err); }
    if(!whatsapp){
      try {
        const { data } = await supabase.from('frotas_motoristas').select('nome,telefone').ilike('nome', termo).limit(1);
        whatsapp = soDigitos(data?.[0]?.telefone);
      } catch(err){ console.warn('[checklist] contato (frotas_motoristas):', err); }
    }
    return whatsapp;
  }

  function nomeDoUsuario(){
    const u = state.opts?.user || state.opts?.auth?.user || window.AUTH?.user || null;
    return u?.nome || u?.name || u?.email || '';
  }

  async function registrarNotificacao(root, g, motorista, telefone, mensagem, acao){
    try {
      const linha = { placa: g.placa, veiculo_id: g.veiculo_id, motorista: motorista || null, telefone: telefone || null, mensagem, acao, data_ultimo_checklist: g.ultimo.data_execucao || null, usuario_nome: nomeDoUsuario() || null };
      const { error } = await state.opts.supabase.from('frotas_checklist_notificacoes').insert(linha);
      if(error) throw error;
      state.notificacoes.set(g.placa, { placa: g.placa, acao, usuario_nome: linha.usuario_nome, criado_em: new Date().toISOString() });
      renderTable(root);
    } catch(err){
      toast(`Mensagem pronta, mas não foi possível registrar a notificação: ${err?.message || err}`, true);
    }
  }

  async function abrirNotificar(root, g){
    if(!g) return;
    const v = state.veiculos.get(g.veiculo_id);
    // O condutor atual do veículo; sem ele, quem fez o checklist mais recente.
    const motorista = String(v?.motorista_atual || '').trim() || String(g.ultimo.motorista || '').trim();
    if(!motorista) return toast('Não há condutor para notificar: o veículo e o checklist estão sem motorista.', true);
    const dataBr = fmtDateBr(g.ultimo.data_execucao);
    const anterior = state.notificacoes.get(g.placa);
    const el = abrirJanela(`${topoJanela('Notificar condutor', `<strong>${esc(formatarPlaca(g.placa))}</strong> · ${esc(motorista)}`)}<div class="ck-janela-corpo">${anterior ? `<div class="fm-note" style="margin:0 0 10px">Já notificado em ${esc(fmtDataHoraBr(anterior.criado_em))}${anterior.usuario_nome ? ` por ${esc(anterior.usuario_nome)}` : ''}. Você pode avisar de novo, se precisar.</div>` : ''}<label for="ck-fone">WhatsApp do condutor</label><input id="ck-fone" class="fm-input" data-fone inputmode="tel" placeholder="(45) 99999-9999" autocomplete="off"><div class="ck-sub" data-fone-info>Buscando o telefone no cadastro…</div><label for="ck-msg">Mensagem</label><textarea id="ck-msg" class="fm-input" data-msg spellcheck="false"></textarea><div class="ck-rodape"><button type="button" class="fm-btn soft" data-fechar>Fechar</button><button type="button" class="fm-btn info" data-copiar>Copiar mensagem</button><button type="button" class="fm-btn primary" data-whats>Abrir no WhatsApp</button></div></div>`, { estreita: true });
    const ta = el.querySelector('[data-msg]');
    const fone = el.querySelector('[data-fone]');
    const info = el.querySelector('[data-fone-info]');
    ta.value = mensagemNotificacao({ motorista, placa: formatarPlaca(g.placa), dias: g.dias, dataBr: g.ultimo.data_execucao ? dataBr : '', vencido: g.vencido });

    buscarContato(state.opts.supabase, motorista).then((tel) => {
      if(!el.isConnected) return;
      if(tel && !fone.value) fone.value = tel;
      info.textContent = tel ? 'Telefone preenchido pelo cadastro. Confira antes de enviar.' : 'Telefone não encontrado no cadastro. Digite o número ou escolha o contato direto no WhatsApp.';
    });

    el.querySelector('[data-copiar]').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(ta.value); } catch { ta.select(); document.execCommand('copy'); }
      toast('Mensagem copiada.');
      await registrarNotificacao(root, g, motorista, normalizarFone(fone.value), ta.value, 'copiada');
    });

    el.querySelector('[data-whats]').addEventListener('click', async () => {
      const numero = normalizarFone(fone.value);
      if(fone.value.trim() && !numero) return toast('Telefone inválido. Use DDD + número (ex.: 45 99999-9999).', true);
      // window.open precisa rodar direto no clique, antes de qualquer await, ou o navegador bloqueia o pop-up.
      window.open(`https://wa.me/${numero}?text=${encodeURIComponent(ta.value)}`, '_blank', 'noopener');
      el.__fechar();
      await registrarNotificacao(root, g, motorista, numero, ta.value, 'whatsapp');
      toast('Notificação registrada.');
    });
  }

  // ---------- manutenção ----------
  // Abre a nova solicitação na Corretiva com a condição descrita no checklist mais recente. A equipe de Manutenção decide
  // se e quando a manutenção será feita.
  async function abrirManutencao(g){
    if(!g) return;
    if(!g.veiculo_id) return toast('Esta placa não está em Frotas > Veículos. Cadastre o veículo para pedir a manutenção.', true);
    const preset = presetManutencao(g, { dataBr: fmtDateBr(g.ultimo.data_execucao) });
    if(!preset) return toast('O checklist mais recente não tem texto na condição geral do veículo. Abra a manutenção pela aba Corretiva.', true);
    try {
      await import('./frotas-manutencao.js?v=20261029-frotas-inst89');
      await window.FROTAS_MANUTENCAO.abrirNova(state.opts, preset);
    } catch(err){
      toast(err.message || 'Não foi possível abrir a manutenção.', true);
    }
  }

  function openHome(container, opts = {}){
    state.opts = opts;
    container.innerHTML = `${styles}<section class="fm-shell"><div class="fm-topo"><div class="fm-head-actions"><button class="fm-btn soft" type="button" data-refresh>↻ Atualizar</button><button class="fm-btn ghost" type="button" data-buscar title="Busca na BFleet as respostas dos últimos 14 dias (o painel já faz isso sozinho a cada 30 minutos)">Buscar na BFleet</button></div></div><div class="fm-kpis">${cardFiltro({ filtro: 'todos', tone: 'blue', icone: 'carro', label: 'Veículos', kpi: 'data-kpi-total', valor: '0', dica: 'Veículos com checklist feito no app' })}${cardFiltro({ filtro: 'em_dia', tone: 'green', icone: 'ok', label: 'Em dia', kpi: 'data-kpi-em-dia', valor: '0', dica: 'Checklist mais recente com até 30 dias' })}${cardFiltro({ filtro: 'vencidos', tone: 'red', icone: 'relogio', label: 'Vencidos', kpi: 'data-kpi-vencidos', valor: '0', dica: 'Checklist mais recente há mais de 30 dias' })}</div><div class="fm-card"><div class="fm-body"><div class="fm-bar"><div class="fm-search"><input class="fm-input" placeholder="Buscar por placa, modelo ou motorista..." data-search></div><span data-chip></span><span class="fm-count" data-count>0 veículo(s)</span></div><div class="fm-table-wrap"><table class="fm-table"><thead><tr>${[['placa','Placa'],['motorista','Motorista'],['data','Data'],['fotos','Fotos']].map(([k, l]) => `<th><button class="fm-sort" type="button" data-sort="${k}" data-label="${l}">${l}</button></th>`).join('')}<th style="width:1%">Ações</th></tr></thead><tbody data-registros-table></tbody></table></div><div class="fm-note">Checklists preenchidos pelos motoristas no app da BFleet. A lista mostra o mais recente de cada placa; use "Abrir" para ver todos, com as fotos. As fotos ficam no servidor da BFleet; o painel guarda os links.</div></div></div></section>`;

    ligarCards(container, { obter: () => state.filtro, definir: (f) => { state.filtro = f; }, aoMudar: () => renderTable(container) });
    sincronizarCards(container, state.filtro);
    bindSort(container);
    container.querySelector('[data-refresh]')?.addEventListener('click', () => carregar(container));
    container.querySelector('[data-buscar]')?.addEventListener('click', (e) => buscarNaBfleet(container, e.currentTarget));
    container.querySelector('[data-search]')?.addEventListener('input', (e) => { state.busca = e.target.value; renderTable(container); });
    carregar(container);
  }

  window[MODULE_NAME] = window[MODULE_NAME] || {};
  window[MODULE_NAME].openHome = openHome;
})();
