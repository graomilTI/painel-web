(function () {
  const MODULE_NAME = 'FROTAS_ROTEIRIZACAO';

  const styles = `
    <style>
      .rot-shell{color:#e2e2f0}.rot-head{margin-bottom:18px}.rot-kicker{color:#86efac;text-transform:uppercase;letter-spacing:.14em;font-weight:950;font-size:12px}.rot-title{margin:8px 0 6px;font-size:clamp(24px,2.5vw,36px);letter-spacing:-.04em;color:#f8fafc}.rot-sub{max-width:980px;color:#94a3b8;line-height:1.55;margin:0}.rot-card{border:1px solid rgba(148,163,184,.16);border-radius:24px;background:radial-gradient(circle at top left,rgba(34,197,94,.13),transparent 35%),linear-gradient(180deg,rgba(15,23,42,.98),rgba(2,6,23,.98));box-shadow:0 20px 60px rgba(0,0,0,.28);overflow:hidden}.rot-toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between;padding:14px;border-bottom:1px solid rgba(148,163,184,.12);background:rgba(2,6,23,.38)}.rot-tools-left,.rot-tools-right{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.rot-btn{border:0;border-radius:14px;min-height:42px;padding:0 16px;font-weight:950;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;font-size:13px;white-space:nowrap}.rot-btn.primary{background:linear-gradient(135deg,#16a34a,#22c55e);color:#052e16}.rot-btn.soft{border:1px solid rgba(34,197,94,.24);background:rgba(34,197,94,.12);color:#86efac}.rot-btn.ghost{border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.72);color:#cbd5e1}.rot-input,.rot-select{height:42px;border:1px solid rgba(148,163,184,.18);border-radius:14px;background:#0d0d18;color:#e2e2f0;padding:0 12px;outline:none;color-scheme:dark}.rot-grid{display:grid;grid-template-columns:1.45fr .9fr;gap:14px;padding:14px}.rot-map{min-height:620px;border:1px solid rgba(148,163,184,.14);border-radius:22px;background:linear-gradient(135deg,rgba(15,23,42,.8),rgba(2,6,23,.95));position:relative;overflow:hidden}.rot-map::before{content:'';position:absolute;inset:0;background-image:linear-gradient(rgba(148,163,184,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(148,163,184,.08) 1px,transparent 1px);background-size:46px 46px;opacity:.35}.rot-map-inner{position:absolute;inset:0}.rot-point,.rot-vehicle{position:absolute;transform:translate(-50%,-50%);z-index:3}.rot-point{width:10px;height:10px;border-radius:50%;background:#a78bfa;border:2px solid rgba(255,255,255,.75);box-shadow:0 0 0 5px rgba(167,139,250,.12)}.rot-point.urgent{background:#f59e0b;box-shadow:0 0 0 6px rgba(245,158,11,.15)}.rot-point.done{background:#22c55e}.rot-vehicle{width:19px;height:19px;border-radius:7px;background:#22c55e;border:2px solid #dcfce7;box-shadow:0 0 0 7px rgba(34,197,94,.14);display:flex;align-items:center;justify-content:center;font-size:10px;color:#052e16;font-weight:1000}.rot-route-line{position:absolute;height:3px;transform-origin:left center;border-radius:999px;background:rgba(34,197,94,.62);box-shadow:0 0 14px rgba(34,197,94,.18);z-index:2}.rot-side{display:flex;flex-direction:column;gap:14px}.rot-kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.rot-kpi{border:1px solid rgba(34,197,94,.18);background:rgba(2,6,23,.32);border-radius:18px;padding:14px}.rot-kpi span{display:block;color:#93c5fd;font-size:10px;font-weight:950;letter-spacing:.1em;text-transform:uppercase}.rot-kpi strong{display:block;margin-top:8px;color:#fff;font-size:24px}.rot-panel{border:1px solid rgba(148,163,184,.14);border-radius:20px;background:rgba(2,6,23,.36);overflow:hidden}.rot-panel h3{margin:0;padding:14px 16px;color:#fff;font-size:15px;border-bottom:1px solid rgba(148,163,184,.12)}.rot-list{max-height:280px;overflow:auto}.rot-row{padding:12px 14px;border-bottom:1px solid rgba(148,163,184,.10);display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center}.rot-row:hover{background:rgba(34,197,94,.08)}.rot-row strong{display:block;color:#f8fafc;font-size:13px}.rot-row small{display:block;color:#94a3b8;margin-top:3px}.rot-badge{display:inline-flex;align-items:center;border-radius:999px;padding:4px 9px;font-size:10px;font-weight:950;border:1px solid rgba(148,163,184,.18);color:#cbd5e1;background:rgba(15,23,42,.72);white-space:nowrap}.rot-badge.ok{border-color:rgba(34,197,94,.35);background:rgba(22,101,52,.24);color:#bbf7d0}.rot-badge.warn{border-color:rgba(245,158,11,.34);background:rgba(245,158,11,.12);color:#fde68a}.rot-badge.err{border-color:rgba(239,68,68,.34);background:rgba(239,68,68,.12);color:#fecaca}.rot-alert{padding:12px 14px;border-bottom:1px solid rgba(148,163,184,.10);display:flex;gap:10px;align-items:flex-start}.rot-alert-dot{width:9px;height:9px;border-radius:50%;background:#f59e0b;box-shadow:0 0 0 5px rgba(245,158,11,.12);margin-top:5px}.rot-empty{padding:26px;text-align:center;color:#94a3b8}.rot-toast{position:fixed;right:22px;bottom:22px;z-index:9999;border:1px solid rgba(134,239,172,.32);background:rgba(22,101,52,.96);color:#dcfce7;border-radius:16px;padding:12px 16px;font-weight:950;box-shadow:0 16px 45px rgba(0,0,0,.35);opacity:0;transform:translateY(10px);pointer-events:none;transition:.2s ease}.rot-toast.show{opacity:1;transform:translateY(0)}@media(max-width:1100px){.rot-grid{grid-template-columns:1fr}.rot-map{min-height:520px}}@media(max-width:680px){.rot-toolbar{align-items:stretch}.rot-tools-left,.rot-tools-right{width:100%;display:grid;grid-template-columns:1fr}.rot-kpis{grid-template-columns:1fr}.rot-map{min-height:420px}}
    </style>`;

  const state = { veiculos: [], embarques: [], rotas: [], alertas: [], filtro: 'todos', busca: '', planejado: false, tick: 0 };
  let _opts = {};
  let _timer = null;

  function esc(v) { return String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[c])); }
  function br(n, d = 0) { return Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: d }); }
  function toast(msg, error = false) { let el = document.querySelector('.rot-toast'); if (!el) { el = document.createElement('div'); el.className = 'rot-toast'; document.body.appendChild(el); } el.textContent = msg; el.style.background = error ? 'rgba(127,29,29,.96)' : 'rgba(22,101,52,.96)'; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 3600); }
  function dist(a, b) { const dx = (a.x || 0) - (b.x || 0); const dy = (a.y || 0) - (b.y || 0); return Math.sqrt(dx * dx + dy * dy); }
  function km(a, b) { return Math.round(dist(a, b) * 21); }

  const regioes = ['PR/Oeste', 'PR/Norte', 'MT', 'MS', 'GO', 'SP', 'MG', 'BA', 'TO'];
  function seedData() {
    if (state.veiculos.length && state.embarques.length) return;
    const placas = ['BCF4A12','RHA8D41','AYN3C70','QIJ7B22','MLK9A18','SDF1G44','BEE2H19','AXR6J82','RTA0B15','GRA1O00','MTP3C91','JYK2E77','KLM8F55','PRD2A61','GOI4B28','MSU9C10','BAH5D73','TOC6A90'];
    state.veiculos = Array.from({ length: 42 }, (_, i) => ({
      id: `v${i + 1}`, placa: placas[i % placas.length], motorista: `Motorista ${i + 1}`, regiao: regioes[i % regioes.length],
      x: 8 + ((i * 17) % 84), y: 10 + ((i * 23) % 78), status: i % 11 === 0 ? 'parado' : i % 9 === 0 ? 'sem_sinal' : 'disponivel',
      kmHoje: 40 + ((i * 19) % 280), desvioKm: i % 7 === 0 ? 18 + (i % 20) : 0
    }));
    state.embarques = Array.from({ length: 118 }, (_, i) => ({
      id: `e${i + 1}`, cliente: `Cliente ${i + 1}`, local: `Ponto de embarque ${i + 1}`, regiao: regioes[i % regioes.length],
      x: 6 + ((i * 13) % 88), y: 8 + ((i * 29) % 82), status: i % 13 === 0 ? 'em_andamento' : i % 17 === 0 ? 'concluido' : 'aguardando',
      prioridade: i % 10 === 0 ? 'urgente' : 'normal', janela: `${String(7 + (i % 9)).padStart(2, '0')}:00-${String(10 + (i % 9)).padStart(2, '0')}:00`
    }));
  }

  async function loadFromSupabase() {
    try {
      const sb = _opts.supabase;
      if (!sb) throw new Error('Supabase indisponível');
      const { data: veics } = await sb.from('frotas_veiculos').select('id,placa,motorista,coordenacao,latitude,longitude,status').limit(250);
      if (Array.isArray(veics) && veics.length) {
        state.veiculos = veics.map((v, i) => ({ id: v.id || `v${i}`, placa: v.placa || `VEIC${i}`, motorista: v.motorista || '—', regiao: v.coordenacao || regioes[i % regioes.length], x: 6 + ((i * 17) % 88), y: 8 + ((i * 23) % 80), status: 'disponivel', kmHoje: 0, desvioKm: 0 }));
      }
    } catch (e) { console.warn('[roteirizacao] usando dados simulados:', e?.message || e); }
    seedData();
  }

  function roteirizar() {
    const disponiveis = state.veiculos.filter(v => v.status !== 'sem_sinal');
    const pendentes = state.embarques.filter(e => e.status !== 'concluido');
    const porRegiao = new Map();
    pendentes.forEach(e => { if (!porRegiao.has(e.regiao)) porRegiao.set(e.regiao, []); porRegiao.get(e.regiao).push(e); });
    const rotas = [];
    for (const [regiao, pontos] of porRegiao.entries()) {
      const candidatos = disponiveis.filter(v => v.regiao === regiao).concat(disponiveis.filter(v => v.regiao !== regiao)).slice(0, 8);
      const chunks = Math.max(1, Math.ceil(pontos.length / 9));
      for (let c = 0; c < chunks; c++) {
        const lote = pontos.slice(c * 9, c * 9 + 9).sort((a, b) => (b.prioridade === 'urgente') - (a.prioridade === 'urgente'));
        if (!lote.length) continue;
        const veic = candidatos[(c + rotas.length) % Math.max(1, candidatos.length)] || disponiveis[rotas.length % disponiveis.length];
        if (!veic) continue;
        let atual = veic, totalKm = 0;
        const ordenados = [];
        const restantes = [...lote];
        while (restantes.length) {
          restantes.sort((a, b) => dist(atual, a) - dist(atual, b));
          const next = restantes.shift();
          totalKm += km(atual, next);
          ordenados.push(next);
          atual = next;
        }
        rotas.push({ id: `r${rotas.length + 1}`, veiculo: veic, regiao, pontos: ordenados, km: totalKm, tempo: Math.round(totalKm / 48 * 60), status: 'planejada' });
      }
    }
    state.rotas = rotas;
    state.planejado = true;
    buildAlerts();
    render();
    toast(`${rotas.length} rotas sugeridas automaticamente.`);
  }

  function buildAlerts() {
    state.alertas = [];
    state.veiculos.filter(v => v.desvioKm > 12).slice(0, 5).forEach(v => state.alertas.push({ tipo: 'Desvio de rota', texto: `${v.placa} com ${v.desvioKm} km acima do previsto`, nivel: 'warn' }));
    state.veiculos.filter(v => v.status === 'sem_sinal').slice(0, 4).forEach(v => state.alertas.push({ tipo: 'Perda de sinal', texto: `${v.placa} sem posição recente do rastreador`, nivel: 'err' }));
    if (state.embarques.some(e => e.prioridade === 'urgente' && e.status === 'aguardando')) state.alertas.unshift({ tipo: 'Embarque urgente', texto: 'Existe ponto urgente aguardando encaixe de rota', nivel: 'warn' });
  }

  function simulateMove() {
    state.tick += 1;
    state.veiculos = state.veiculos.map((v, i) => {
      if (v.status === 'sem_sinal') return v;
      const dx = Math.sin((state.tick + i) / 5) * .22;
      const dy = Math.cos((state.tick + i) / 6) * .18;
      return { ...v, x: Math.max(3, Math.min(97, v.x + dx)), y: Math.max(3, Math.min(97, v.y + dy)), kmHoje: v.kmHoje + .2 };
    });
    renderMapOnly();
  }

  function addNovoEmbarque() {
    const i = state.embarques.length + 1;
    state.embarques.unshift({ id: `e${i}`, cliente: `Cliente novo ${i}`, local: `Novo ponto ${i}`, regiao: regioes[i % regioes.length], x: 8 + Math.random() * 84, y: 8 + Math.random() * 82, status: 'aguardando', prioridade: 'urgente', janela: 'Hoje' });
    state.planejado = false;
    buildAlerts();
    render();
    toast('Novo embarque adicionado. Roteirização precisa ser recalculada.');
  }

  function kpis() {
    const kmTotal = state.rotas.reduce((s, r) => s + r.km, 0);
    const pend = state.embarques.filter(e => e.status !== 'concluido').length;
    const desvios = state.veiculos.filter(v => v.desvioKm > 12).length;
    return { veiculos: state.veiculos.length, embarques: state.embarques.length, pend, rotas: state.rotas.length, kmTotal, desvios };
  }

  function routeLinesHtml() {
    if (!state.planejado) return '';
    const lines = [];
    state.rotas.forEach((r) => {
      let prev = r.veiculo;
      r.pontos.forEach(p => {
        const x1 = prev.x, y1 = prev.y, x2 = p.x, y2 = p.y;
        const len = Math.sqrt((x2-x1)**2 + (y2-y1)**2);
        const ang = Math.atan2(y2-y1, x2-x1) * 180 / Math.PI;
        lines.push(`<div class="rot-route-line" style="left:${x1}%;top:${y1}%;width:${len}%;transform:rotate(${ang}deg)"></div>`);
        prev = p;
      });
    });
    return lines.join('');
  }

  function mapHtml() {
    const showAll = state.filtro === 'todos';
    const pontos = state.embarques.filter(e => showAll || e.status === state.filtro).map(e => `<div class="rot-point ${e.prioridade === 'urgente' ? 'urgent' : ''} ${e.status === 'concluido' ? 'done' : ''}" style="left:${e.x}%;top:${e.y}%" title="${esc(e.local)} · ${esc(e.janela)}"></div>`).join('');
    const veics = state.veiculos.map(v => `<div class="rot-vehicle" style="left:${v.x}%;top:${v.y}%" title="${esc(v.placa)} · ${esc(v.motorista)}">${v.status === 'sem_sinal' ? '!' : '▶'}</div>`).join('');
    return `<div class="rot-map"><div class="rot-map-inner">${routeLinesHtml()}${pontos}${veics}</div></div>`;
  }

  function renderMapOnly() { const map = document.querySelector('.rot-map'); if (!map) return; map.outerHTML = mapHtml(); }

  function render() {
    const k = kpis();
    const root = _opts.root;
    if (!root) return;
    root.innerHTML = `${styles}<section class="rot-shell"><div class="rot-head"><div class="rot-kicker">Frotas · Controle inteligente</div><h2 class="rot-title">Roteirização dinâmica e monitoramento em tempo real</h2><p class="rot-sub">Sugere automaticamente a melhor distribuição de veículos para os pontos de embarque do dia, priorizando menor km total, agrupamento por região, menor tempo e janelas de horário. A integração real com BFLEET/TMS entra nesta mesma tela.</p></div><div class="rot-card"><div class="rot-toolbar"><div class="rot-tools-left"><button class="rot-btn primary" data-act="roteirizar">Roteirizar agora</button><button class="rot-btn soft" data-act="novo">+ Novo embarque</button><button class="rot-btn ghost" data-act="publicar">Publicar rotas</button></div><div class="rot-tools-right"><select class="rot-select" data-act="filtro"><option value="todos">Todos os pontos</option><option value="aguardando">Aguardando</option><option value="em_andamento">Em andamento</option><option value="concluido">Concluídos</option></select></div></div><div class="rot-grid">${mapHtml()}<aside class="rot-side"><div class="rot-kpis"><div class="rot-kpi"><span>Veículos</span><strong>${br(k.veiculos)}</strong></div><div class="rot-kpi"><span>Embarques</span><strong>${br(k.embarques)}</strong></div><div class="rot-kpi"><span>Pendentes</span><strong>${br(k.pend)}</strong></div><div class="rot-kpi"><span>Rotas</span><strong>${br(k.rotas)}</strong></div><div class="rot-kpi"><span>Km planejado</span><strong>${br(k.kmTotal)}</strong></div><div class="rot-kpi"><span>Desvios</span><strong>${br(k.desvios)}</strong></div></div>${routesPanel()}${alertsPanel()}</aside></div></div></section>`;
    bind();
  }

  function routesPanel() {
    if (!state.rotas.length) return `<div class="rot-panel"><h3>Rotas sugeridas</h3><div class="rot-empty">Clique em “Roteirizar agora” para gerar a sugestão automática.</div></div>`;
    return `<div class="rot-panel"><h3>Rotas sugeridas</h3><div class="rot-list">${state.rotas.slice(0, 18).map(r => `<div class="rot-row"><div><strong>${esc(r.veiculo.placa)} · ${esc(r.regiao)}</strong><small>${r.pontos.length} pontos · ${br(r.km)} km · ${br(r.tempo)} min</small></div><span class="rot-badge ok">Planejada</span></div>`).join('')}</div></div>`;
  }

  function alertsPanel() {
    if (!state.alertas.length) return `<div class="rot-panel"><h3>Alertas operacionais</h3><div class="rot-empty">Nenhum alerta crítico neste momento.</div></div>`;
    return `<div class="rot-panel"><h3>Alertas operacionais</h3><div class="rot-list">${state.alertas.slice(0, 10).map(a => `<div class="rot-alert"><span class="rot-alert-dot"></span><div><strong>${esc(a.tipo)}</strong><small>${esc(a.texto)}</small></div></div>`).join('')}</div></div>`;
  }

  function bind() {
    document.querySelector('[data-act="roteirizar"]')?.addEventListener('click', roteirizar);
    document.querySelector('[data-act="novo"]')?.addEventListener('click', addNovoEmbarque);
    document.querySelector('[data-act="publicar"]')?.addEventListener('click', () => toast(state.rotas.length ? 'Rotas prontas para envio aos motoristas.' : 'Gere as rotas antes de publicar.', !state.rotas.length));
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
