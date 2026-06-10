(function () {
  const MODULE_NAME = 'FROTAS_ROTEIRIZACAO';

  const styles = `
    <style>
      .rot-shell{color:#e2e2f0}.rot-head{margin-bottom:16px}.rot-kicker{color:#86efac;text-transform:uppercase;letter-spacing:.14em;font-weight:950;font-size:12px}.rot-title{margin:8px 0 6px;font-size:clamp(24px,2.5vw,34px);letter-spacing:-.04em;color:#f8fafc}.rot-sub{max-width:1050px;color:#94a3b8;line-height:1.55;margin:0}.rot-card{border:1px solid rgba(148,163,184,.16);border-radius:24px;background:radial-gradient(circle at top left,rgba(34,197,94,.12),transparent 34%),linear-gradient(180deg,rgba(15,23,42,.98),rgba(2,6,23,.98));box-shadow:0 20px 60px rgba(0,0,0,.28);overflow:hidden}.rot-toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between;padding:14px;border-bottom:1px solid rgba(148,163,184,.12);background:rgba(2,6,23,.42)}.rot-tools-left,.rot-tools-right{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.rot-btn{border:0;border-radius:14px;min-height:42px;padding:0 16px;font-weight:950;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;font-size:13px;white-space:nowrap}.rot-btn.primary{background:linear-gradient(135deg,#16a34a,#22c55e);color:#052e16}.rot-btn.soft{border:1px solid rgba(34,197,94,.24);background:rgba(34,197,94,.12);color:#86efac}.rot-btn.ghost{border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.72);color:#cbd5e1}.rot-btn:disabled{opacity:.55;cursor:not-allowed}.rot-select{height:42px;border:1px solid rgba(148,163,184,.18);border-radius:14px;background:#0d0d18;color:#e2e2f0;padding:0 12px;outline:none;color-scheme:dark}.rot-grid{display:grid;grid-template-columns:minmax(620px,1.45fr) minmax(360px,.82fr);gap:14px;padding:14px}.rot-map-wrap{display:flex;flex-direction:column;gap:10px}.rot-map{height:calc(100vh - 235px);min-height:560px;border:1px solid rgba(148,163,184,.14);border-radius:22px;background:linear-gradient(135deg,rgba(15,23,42,.78),rgba(2,6,23,.96));position:relative;overflow:hidden}.rot-map::before{content:'';position:absolute;inset:0;background-image:linear-gradient(rgba(148,163,184,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(148,163,184,.08) 1px,transparent 1px);background-size:46px 46px;opacity:.32}.rot-map-inner{position:absolute;inset:0}.rot-point,.rot-vehicle{position:absolute;transform:translate(-50%,-50%);z-index:4}.rot-point{width:10px;height:10px;border-radius:50%;background:#a78bfa;border:2px solid rgba(255,255,255,.76);box-shadow:0 0 0 4px rgba(167,139,250,.10)}.rot-point.urgent{background:#f59e0b;box-shadow:0 0 0 6px rgba(245,158,11,.15)}.rot-point.done{background:#22c55e}.rot-point.selected{width:14px;height:14px;z-index:6;box-shadow:0 0 0 8px rgba(34,197,94,.18)}.rot-vehicle{width:22px;height:22px;border-radius:8px;background:#22c55e;border:2px solid #dcfce7;box-shadow:0 0 0 7px rgba(34,197,94,.14);display:flex;align-items:center;justify-content:center;font-size:10px;color:#052e16;font-weight:1000}.rot-vehicle.off{background:#ef4444;color:#fff;border-color:#fecaca}.rot-vehicle.selected{width:28px;height:28px;z-index:7;box-shadow:0 0 0 10px rgba(34,197,94,.20)}.rot-route-line{position:absolute;height:4px;transform-origin:left center;border-radius:999px;background:linear-gradient(90deg,rgba(34,197,94,.28),rgba(34,197,94,.95));box-shadow:0 0 16px rgba(34,197,94,.22);z-index:2}.rot-map-hint{position:absolute;left:14px;bottom:14px;right:14px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;z-index:8}.rot-chip{display:inline-flex;align-items:center;gap:7px;border:1px solid rgba(148,163,184,.16);background:rgba(2,6,23,.82);border-radius:999px;padding:7px 10px;color:#cbd5e1;font-size:11px;font-weight:850}.rot-dot{width:9px;height:9px;border-radius:50%;display:inline-block}.rot-dot.veic{background:#22c55e}.rot-dot.ponto{background:#a78bfa}.rot-dot.urg{background:#f59e0b}.rot-dot.rota{background:#16a34a}.rot-side{display:flex;flex-direction:column;gap:14px;min-width:0}.rot-kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.rot-kpi{border:1px solid rgba(34,197,94,.18);background:rgba(2,6,23,.32);border-radius:18px;padding:14px;min-height:78px}.rot-kpi span{display:block;color:#93c5fd;font-size:10px;font-weight:950;letter-spacing:.1em;text-transform:uppercase}.rot-kpi strong{display:block;margin-top:8px;color:#fff;font-size:24px}.rot-panel{border:1px solid rgba(148,163,184,.14);border-radius:20px;background:rgba(2,6,23,.36);overflow:hidden}.rot-panel h3{margin:0;padding:14px 16px;color:#fff;font-size:15px;border-bottom:1px solid rgba(148,163,184,.12);display:flex;justify-content:space-between;gap:8px}.rot-list{max-height:300px;overflow:auto}.rot-row{padding:12px 14px;border-bottom:1px solid rgba(148,163,184,.10);display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;cursor:pointer}.rot-row:hover,.rot-row.active{background:rgba(34,197,94,.10)}.rot-row strong{display:block;color:#f8fafc;font-size:13px}.rot-row small{display:block;color:#94a3b8;margin-top:4px;line-height:1.35}.rot-badge{display:inline-flex;align-items:center;border-radius:999px;padding:4px 9px;font-size:10px;font-weight:950;border:1px solid rgba(148,163,184,.18);color:#cbd5e1;background:rgba(15,23,42,.72);white-space:nowrap}.rot-badge.ok{border-color:rgba(34,197,94,.35);background:rgba(22,101,52,.24);color:#bbf7d0}.rot-badge.warn{border-color:rgba(245,158,11,.34);background:rgba(245,158,11,.12);color:#fde68a}.rot-badge.err{border-color:rgba(239,68,68,.34);background:rgba(239,68,68,.12);color:#fecaca}.rot-alert{padding:12px 14px;border-bottom:1px solid rgba(148,163,184,.10);display:grid;grid-template-columns:14px 1fr;gap:10px;align-items:start}.rot-alert-dot{width:9px;height:9px;border-radius:50%;background:#f59e0b;box-shadow:0 0 0 5px rgba(245,158,11,.12);margin-top:5px}.rot-alert strong{display:block;color:#fff;font-size:13px;margin-bottom:3px}.rot-alert small{display:block;color:#cbd5e1;line-height:1.35}.rot-empty{padding:26px;text-align:center;color:#94a3b8}.rot-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.rot-mini{border:1px solid rgba(148,163,184,.12);background:rgba(15,23,42,.42);border-radius:16px;padding:12px}.rot-mini span{display:block;color:#94a3b8;font-size:10px;text-transform:uppercase;font-weight:950;letter-spacing:.08em}.rot-mini strong{display:block;margin-top:6px;color:#fff;font-size:18px}.rot-toast{position:fixed;right:22px;bottom:22px;z-index:9999;border:1px solid rgba(134,239,172,.32);background:rgba(22,101,52,.96);color:#dcfce7;border-radius:16px;padding:12px 16px;font-weight:950;box-shadow:0 16px 45px rgba(0,0,0,.35);opacity:0;transform:translateY(10px);pointer-events:none;transition:.2s ease}.rot-toast.show{opacity:1;transform:translateY(0)}@media(max-width:1180px){.rot-grid{grid-template-columns:1fr}.rot-map{height:auto;min-height:520px}}@media(max-width:680px){.rot-toolbar{align-items:stretch}.rot-tools-left,.rot-tools-right{width:100%;display:grid;grid-template-columns:1fr}.rot-kpis,.rot-summary{grid-template-columns:1fr}.rot-map{min-height:420px}}
    </style>`;

  const state = { veiculos: [], embarques: [], rotas: [], alertas: [], filtro: 'todos', planejado: false, tick: 0, rotaSelecionadaId: null, mostrarTodasRotas: false };
  let _opts = {};
  let _timer = null;

  function esc(v) { return String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[c])); }
  function br(n, d = 0) { return Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: d }); }
  function toast(msg, error = false) { let el = document.querySelector('.rot-toast'); if (!el) { el = document.createElement('div'); el.className = 'rot-toast'; document.body.appendChild(el); } el.textContent = msg; el.style.background = error ? 'rgba(127,29,29,.96)' : 'rgba(22,101,52,.96)'; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 3200); }
  function dist(a, b) { const dx = (a.x || 0) - (b.x || 0); const dy = (a.y || 0) - (b.y || 0); return Math.sqrt(dx * dx + dy * dy); }
  function km(a, b) { return Math.max(1, Math.round(dist(a, b) * 1.15)); }
  function fmtTempo(min) { const h = Math.floor((min || 0) / 60); const m = Math.round((min || 0) % 60); if (!h) return `${m} min`; return `${h}h${String(m).padStart(2, '0')}`; }

  const regioes = ['PR/Oeste', 'PR/Norte', 'MT', 'MS', 'GO', 'SP', 'MG', 'BA', 'TO'];

  function seedData() {
    if (state.veiculos.length && state.embarques.length) return;
    const placas = ['BCF4A12','RHA8D41','AYN3C70','QIJ7B22','MLK9A18','SDF1G44','BEE2H19','AXR6J82','RTA0B15','GRA1O00','MTP3C91','JYK2E77','KLM8F55','PRD2A61','GOI4B28','MSU9C10','BAH5D73','TOC6A90'];
    state.veiculos = Array.from({ length: 42 }, (_, i) => ({
      id: `v${i + 1}`,
      placa: placas[i % placas.length],
      motorista: `Motorista ${i + 1}`,
      regiao: regioes[i % regioes.length],
      x: 8 + ((i * 17) % 84),
      y: 10 + ((i * 23) % 78),
      status: i % 11 === 0 ? 'parado' : i % 9 === 0 ? 'sem_sinal' : 'disponivel',
      kmHoje: 40 + ((i * 19) % 280),
      desvioKm: i % 7 === 0 ? 12 + (i % 18) : 0
    }));
    state.embarques = Array.from({ length: 118 }, (_, i) => ({
      id: `e${i + 1}`,
      cliente: `Cliente ${i + 1}`,
      local: `Ponto de embarque ${i + 1}`,
      regiao: regioes[i % regioes.length],
      x: 6 + ((i * 13) % 88),
      y: 8 + ((i * 29) % 82),
      status: i % 13 === 0 ? 'em_andamento' : i % 17 === 0 ? 'concluido' : 'aguardando',
      prioridade: i % 10 === 0 ? 'urgente' : 'normal',
      janela: `${String(7 + (i % 9)).padStart(2, '0')}:00-${String(10 + (i % 9)).padStart(2, '0')}:00`
    }));
  }

  async function loadFromSupabase() {
    try {
      const sb = _opts.supabase;
      if (!sb) throw new Error('Supabase indisponível');
      const { data: veics } = await sb.from('frotas_veiculos').select('id,placa,motorista,coordenacao,latitude,longitude,status').limit(250);
      if (Array.isArray(veics) && veics.length) {
        state.veiculos = veics.map((v, i) => ({
          id: v.id || `v${i}`,
          placa: v.placa || `VEIC${i}`,
          motorista: v.motorista || '—',
          regiao: v.coordenacao || regioes[i % regioes.length],
          x: 6 + ((i * 17) % 88),
          y: 8 + ((i * 23) % 80),
          status: 'disponivel',
          kmHoje: 0,
          desvioKm: 0
        }));
      }
    } catch (e) {
      console.warn('[roteirizacao] usando dados simulados:', e?.message || e);
    }
    seedData();
  }

  function roteirizar() {
    const disponiveis = state.veiculos.filter(v => v.status !== 'sem_sinal');
    const pendentes = state.embarques.filter(e => e.status !== 'concluido');
    const porRegiao = new Map();
    pendentes.forEach(e => { if (!porRegiao.has(e.regiao)) porRegiao.set(e.regiao, []); porRegiao.get(e.regiao).push(e); });
    const rotas = [];

    for (const [regiao, pontos] of porRegiao.entries()) {
      const candidatosRegiao = disponiveis.filter(v => v.regiao === regiao);
      const candidatos = (candidatosRegiao.length ? candidatosRegiao : disponiveis).slice(0, 12);
      const pontosOrdenados = [...pontos].sort((a, b) => (b.prioridade === 'urgente') - (a.prioridade === 'urgente'));
      const tamanhoRota = 7;
      const qtdRotas = Math.ceil(pontosOrdenados.length / tamanhoRota);

      for (let c = 0; c < qtdRotas; c++) {
        const lote = pontosOrdenados.slice(c * tamanhoRota, c * tamanhoRota + tamanhoRota);
        if (!lote.length) continue;
        const veic = candidatos[(c + rotas.length) % Math.max(1, candidatos.length)] || disponiveis[rotas.length % disponiveis.length];
        if (!veic) continue;

        let atual = veic;
        let totalKm = 0;
        const ordenados = [];
        const restantes = [...lote];
        while (restantes.length) {
          restantes.sort((a, b) => dist(atual, a) - dist(atual, b));
          const next = restantes.shift();
          totalKm += km(atual, next);
          ordenados.push(next);
          atual = next;
        }
        const tempo = Math.round((totalKm / 52) * 60 + ordenados.length * 18);
        rotas.push({ id: `r${rotas.length + 1}`, veiculo: veic, regiao, pontos: ordenados, km: totalKm, tempo, status: 'planejada' });
      }
    }

    state.rotas = rotas;
    state.rotaSelecionadaId = rotas[0]?.id || null;
    state.mostrarTodasRotas = false;
    state.planejado = true;
    buildAlerts();
    render();
    toast(`${rotas.length} rotas sugeridas. Clique em uma rota para ver no mapa.`);
  }

  function buildAlerts() {
    state.alertas = [];
    state.veiculos.filter(v => v.desvioKm > 10).slice(0, 5).forEach(v => state.alertas.push({ tipo: 'Desvio de rota', texto: `${v.placa} está ${v.desvioKm} km acima do previsto`, nivel: 'warn' }));
    state.veiculos.filter(v => v.status === 'sem_sinal').slice(0, 4).forEach(v => state.alertas.push({ tipo: 'Perda de sinal', texto: `${v.placa} sem posição recente do rastreador`, nivel: 'err' }));
    if (state.embarques.some(e => e.prioridade === 'urgente' && e.status === 'aguardando')) state.alertas.unshift({ tipo: 'Embarque urgente', texto: 'Existe ponto urgente aguardando encaixe de rota', nivel: 'warn' });
  }

  function simulateMove() {
    state.tick += 1;
    state.veiculos = state.veiculos.map((v, i) => {
      if (v.status === 'sem_sinal') return v;
      const dx = Math.sin((state.tick + i) / 5) * .16;
      const dy = Math.cos((state.tick + i) / 6) * .13;
      return { ...v, x: Math.max(3, Math.min(97, v.x + dx)), y: Math.max(3, Math.min(97, v.y + dy)), kmHoje: v.kmHoje + .15 };
    });
    renderMapOnly();
  }

  function addNovoEmbarque() {
    const i = state.embarques.length + 1;
    state.embarques.unshift({ id: `e${i}`, cliente: `Cliente novo ${i}`, local: `Novo ponto ${i}`, regiao: regioes[i % regioes.length], x: 8 + Math.random() * 84, y: 8 + Math.random() * 82, status: 'aguardando', prioridade: 'urgente', janela: 'Hoje' });
    state.planejado = false;
    state.rotaSelecionadaId = null;
    buildAlerts();
    render();
    toast('Novo embarque adicionado. Recalcule as rotas.');
  }

  function kpis() {
    const kmTotal = state.rotas.reduce((s, r) => s + r.km, 0);
    const pend = state.embarques.filter(e => e.status !== 'concluido').length;
    const desvios = state.veiculos.filter(v => v.desvioKm > 10).length;
    const tempoTotal = state.rotas.reduce((s, r) => s + r.tempo, 0);
    return { veiculos: state.veiculos.length, embarques: state.embarques.length, pend, rotas: state.rotas.length, kmTotal, desvios, tempoTotal };
  }

  function rotasVisiveis() {
    if (!state.planejado) return [];
    if (state.mostrarTodasRotas) return state.rotas.slice(0, 8);
    const selected = state.rotas.find(r => r.id === state.rotaSelecionadaId);
    return selected ? [selected] : [];
  }

  function routeLinesHtml() {
    const lines = [];
    rotasVisiveis().forEach((r) => {
      let prev = r.veiculo;
      r.pontos.forEach(p => {
        const x1 = prev.x, y1 = prev.y, x2 = p.x, y2 = p.y;
        const len = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
        const ang = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
        lines.push(`<div class="rot-route-line" style="left:${x1}%;top:${y1}%;width:${len}%;transform:rotate(${ang}deg)"></div>`);
        prev = p;
      });
    });
    return lines.join('');
  }

  function selectedPointIds() {
    const set = new Set();
    rotasVisiveis().forEach(r => r.pontos.forEach(p => set.add(p.id)));
    return set;
  }

  function selectedVehicleIds() {
    return new Set(rotasVisiveis().map(r => r.veiculo.id));
  }

  function mapHtml() {
    const showAll = state.filtro === 'todos';
    const pointIds = selectedPointIds();
    const vehicleIds = selectedVehicleIds();
    const pontos = state.embarques
      .filter(e => showAll || e.status === state.filtro)
      .map(e => `<div class="rot-point ${e.prioridade === 'urgente' ? 'urgent' : ''} ${e.status === 'concluido' ? 'done' : ''} ${pointIds.has(e.id) ? 'selected' : ''}" style="left:${e.x}%;top:${e.y}%" title="${esc(e.local)} · ${esc(e.janela)}"></div>`)
      .join('');
    const veics = state.veiculos
      .map(v => `<div class="rot-vehicle ${v.status === 'sem_sinal' ? 'off' : ''} ${vehicleIds.has(v.id) ? 'selected' : ''}" style="left:${v.x}%;top:${v.y}%" title="${esc(v.placa)} · ${esc(v.motorista)}">${v.status === 'sem_sinal' ? '!' : '▶'}</div>`)
      .join('');
    return `<div class="rot-map"><div class="rot-map-inner">${routeLinesHtml()}${pontos}${veics}<div class="rot-map-hint"><span class="rot-chip"><span class="rot-dot veic"></span>Veículo</span><span class="rot-chip"><span class="rot-dot ponto"></span>Embarque</span><span class="rot-chip"><span class="rot-dot urg"></span>Urgente</span><span class="rot-chip"><span class="rot-dot rota"></span>${state.mostrarTodasRotas ? 'Até 8 rotas visíveis' : 'Rota selecionada'}</span></div></div></div>`;
  }

  function renderMapOnly() {
    const map = document.querySelector('.rot-map');
    if (!map) return;
    map.outerHTML = mapHtml();
  }

  function render() {
    const k = kpis();
    const root = _opts.root;
    if (!root) return;
    root.innerHTML = `${styles}<section class="rot-shell"><div class="rot-head"><div class="rot-kicker">Frotas · Controle inteligente</div><h2 class="rot-title">Roteirização dinâmica e monitoramento em tempo real</h2><p class="rot-sub">O mapa começa limpo. Depois da roteirização, clique em uma rota para visualizar somente aquele trajeto. Use “Mostrar várias rotas” apenas para conferência geral.</p></div><div class="rot-card"><div class="rot-toolbar"><div class="rot-tools-left"><button class="rot-btn primary" data-act="roteirizar">Roteirizar agora</button><button class="rot-btn soft" data-act="novo">+ Novo embarque</button><button class="rot-btn ghost" data-act="toggle-rotas" ${state.rotas.length ? '' : 'disabled'}>${state.mostrarTodasRotas ? 'Ver rota selecionada' : 'Mostrar várias rotas'}</button><button class="rot-btn ghost" data-act="publicar">Publicar rotas</button></div><div class="rot-tools-right"><select class="rot-select" data-act="filtro"><option value="todos">Todos os pontos</option><option value="aguardando">Aguardando</option><option value="em_andamento">Em andamento</option><option value="concluido">Concluídos</option></select></div></div><div class="rot-grid"><div class="rot-map-wrap">${mapHtml()}${summaryHtml(k)}</div><aside class="rot-side"><div class="rot-kpis"><div class="rot-kpi"><span>Veículos</span><strong>${br(k.veiculos)}</strong></div><div class="rot-kpi"><span>Embarques</span><strong>${br(k.embarques)}</strong></div><div class="rot-kpi"><span>Pendentes</span><strong>${br(k.pend)}</strong></div><div class="rot-kpi"><span>Rotas</span><strong>${br(k.rotas)}</strong></div><div class="rot-kpi"><span>Km planejado</span><strong>${br(k.kmTotal)}</strong></div><div class="rot-kpi"><span>Desvios</span><strong>${br(k.desvios)}</strong></div></div>${routesPanel()}${alertsPanel()}</aside></div></div></section>`;
    bind();
  }

  function summaryHtml(k) {
    return `<div class="rot-summary"><div class="rot-mini"><span>Tempo total estimado</span><strong>${fmtTempo(k.tempoTotal)}</strong></div><div class="rot-mini"><span>Média por rota</span><strong>${state.rotas.length ? br(k.kmTotal / state.rotas.length, 1) : 0} km</strong></div><div class="rot-mini"><span>Modo do mapa</span><strong>${state.mostrarTodasRotas ? 'Geral' : 'Focado'}</strong></div></div>`;
  }

  function routesPanel() {
    if (!state.rotas.length) return `<div class="rot-panel"><h3>Rotas sugeridas</h3><div class="rot-empty">Clique em “Roteirizar agora” para gerar a sugestão automática.</div></div>`;
    return `<div class="rot-panel"><h3><span>Rotas sugeridas</span><span class="rot-badge">${state.rotas.length}</span></h3><div class="rot-list">${state.rotas.slice(0, 22).map(r => `<div class="rot-row ${r.id === state.rotaSelecionadaId ? 'active' : ''}" data-rota="${esc(r.id)}"><div><strong>${esc(r.veiculo.placa)} · ${esc(r.regiao)}</strong><small>${r.pontos.length} pontos · ${br(r.km)} km · ${fmtTempo(r.tempo)}</small></div><span class="rot-badge ok">Ver</span></div>`).join('')}</div></div>`;
  }

  function alertsPanel() {
    if (!state.alertas.length) return `<div class="rot-panel"><h3>Alertas operacionais</h3><div class="rot-empty">Nenhum alerta crítico neste momento.</div></div>`;
    return `<div class="rot-panel"><h3>Alertas operacionais</h3><div class="rot-list">${state.alertas.slice(0, 10).map(a => `<div class="rot-alert"><span class="rot-alert-dot"></span><div><strong>${esc(a.tipo)}</strong><small>${esc(a.texto)}</small></div></div>`).join('')}</div></div>`;
  }

  function bind() {
    document.querySelector('[data-act="roteirizar"]')?.addEventListener('click', roteirizar);
    document.querySelector('[data-act="novo"]')?.addEventListener('click', addNovoEmbarque);
    document.querySelector('[data-act="toggle-rotas"]')?.addEventListener('click', () => { state.mostrarTodasRotas = !state.mostrarTodasRotas; render(); });
    document.querySelector('[data-act="publicar"]')?.addEventListener('click', () => toast(state.rotas.length ? 'Rotas prontas para envio aos motoristas.' : 'Gere as rotas antes de publicar.', !state.rotas.length));
    document.querySelectorAll('[data-rota]').forEach(el => el.addEventListener('click', () => { state.rotaSelecionadaId = el.dataset.rota; state.mostrarTodasRotas = false; render(); }));
    const filtro = document.querySelector('[data-act="filtro"]');
    if (filtro) { filtro.value = state.filtro; filtro.addEventListener('change', e => { state.filtro = e.target.value; render(); }); }
  }

  async function openHome(root, opts = {}) {
    _opts = { ...opts, root };
    await loadFromSupabase();
    buildAlerts();
    render();
    clearInterval(_timer);
    _timer = setInterval(simulateMove, 2500);
  }

  window[MODULE_NAME] = { openHome, roteirizar };
})();
