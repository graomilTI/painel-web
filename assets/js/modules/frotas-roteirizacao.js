(function () {
  const MODULE_NAME = 'FROTAS_ROTEIRIZACAO';

  const ROTEIRIZAR_FUNCTION = window.FROTAS_CONFIG?.ROTEIRIZAR_FUNCTION || 'frotas-roteirizar';
  const BFLEET_POSICOES_FUNCTION = window.FROTAS_CONFIG?.BFLEET_POSICOES_FUNCTION || 'bfleet-posicoes';
  const REFRESH_MS = 45000;
  const SEM_SINAL_HORAS = 3;

  // Contorno simplificado do Brasil (lat, lng) usado como referência geográfica
  // de fundo no mapa, projetado com a mesma função project() dos marcadores.
  const BRASIL_OUTLINE = [
    [5.27, -60.20], [4.50, -58.00], [4.00, -55.00], [2.00, -51.50], [0.50, -50.00],
    [-1.00, -48.50], [-2.50, -44.50], [-2.90, -41.80], [-3.70, -38.50], [-5.20, -35.20],
    [-7.10, -34.80], [-8.10, -34.90], [-9.70, -35.70], [-11.00, -37.10], [-13.00, -38.50],
    [-15.80, -38.90], [-17.90, -39.20], [-20.30, -40.30], [-22.90, -43.20], [-23.97, -46.30],
    [-25.50, -48.50], [-26.90, -48.60], [-28.60, -48.90], [-30.00, -50.20], [-32.00, -52.10],
    [-33.75, -53.40], [-30.20, -57.60], [-27.50, -55.50], [-25.60, -54.60], [-23.00, -54.30],
    [-22.30, -57.90], [-21.00, -57.70], [-19.30, -57.70], [-16.30, -58.40], [-13.00, -60.50],
    [-11.00, -65.30], [-9.00, -66.00], [-9.00, -70.60], [-7.70, -73.70], [-9.00, -72.50],
    [-4.50, -70.00], [-1.00, -69.50], [1.50, -69.90], [2.80, -60.00],
  ];

  const styles = `
    <style>
      .rot-shell{color:#e2e2f0}.rot-head{margin-bottom:16px}.rot-kicker{color:#86efac;text-transform:uppercase;letter-spacing:.14em;font-weight:950;font-size:12px}.rot-title{margin:8px 0 6px;font-size:clamp(24px,2.5vw,34px);letter-spacing:-.04em;color:#f8fafc}.rot-sub{max-width:1050px;color:#94a3b8;line-height:1.55;margin:0}.rot-sub code{color:#bbf7d0}.rot-card{border:1px solid rgba(148,163,184,.16);border-radius:24px;background:radial-gradient(circle at top left,rgba(34,197,94,.12),transparent 34%),linear-gradient(180deg,rgba(15,23,42,.98),rgba(2,6,23,.98));box-shadow:0 20px 60px rgba(0,0,0,.28);overflow:hidden}.rot-toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between;padding:14px;border-bottom:1px solid rgba(148,163,184,.12);background:rgba(2,6,23,.42)}.rot-tools-left,.rot-tools-right{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.rot-btn{border:0;border-radius:14px;min-height:42px;padding:0 16px;font-weight:950;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;font-size:13px;white-space:nowrap}.rot-btn.primary{background:linear-gradient(135deg,#16a34a,#22c55e);color:#052e16}.rot-btn.soft{border:1px solid rgba(34,197,94,.24);background:rgba(34,197,94,.12);color:#86efac}.rot-btn.ghost{border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.72);color:#cbd5e1}.rot-btn:disabled{opacity:.55;cursor:not-allowed}.rot-select{height:42px;border:1px solid rgba(148,163,184,.18);border-radius:14px;background:#0d0d18;color:#e2e2f0;padding:0 12px;outline:none;color-scheme:dark}.rot-grid{display:grid;grid-template-columns:minmax(620px,1.45fr) minmax(360px,.82fr);gap:14px;padding:14px}.rot-map-wrap{display:flex;flex-direction:column;gap:10px}.rot-map{height:calc(100vh - 235px);min-height:560px;border:1px solid rgba(148,163,184,.14);border-radius:22px;background:linear-gradient(135deg,rgba(15,23,42,.78),rgba(2,6,23,.96));position:relative;overflow:hidden}.rot-map::before{content:'';position:absolute;inset:0;background-image:linear-gradient(rgba(148,163,184,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(148,163,184,.08) 1px,transparent 1px);background-size:46px 46px;opacity:.32}.rot-map-brasil{position:absolute;inset:0;width:100%;height:100%;display:block}.rot-map-brasil path{fill:rgba(34,197,94,.07);stroke:rgba(148,163,184,.34);stroke-width:.15}.rot-map-inner{position:absolute;inset:0}.rot-point,.rot-vehicle{position:absolute;transform:translate(-50%,-50%);z-index:4}.rot-point{width:10px;height:10px;border-radius:50%;background:#a78bfa;border:2px solid rgba(255,255,255,.76);box-shadow:0 0 0 4px rgba(167,139,250,.10)}.rot-point.urgent{background:#f59e0b;box-shadow:0 0 0 6px rgba(245,158,11,.15)}.rot-point.done{background:#22c55e}.rot-point.selected{width:14px;height:14px;z-index:6;box-shadow:0 0 0 8px rgba(34,197,94,.18)}.rot-vehicle{width:22px;height:22px;border-radius:8px;background:#22c55e;border:2px solid #dcfce7;box-shadow:0 0 0 7px rgba(34,197,94,.14);display:flex;align-items:center;justify-content:center;font-size:10px;color:#052e16;font-weight:1000}.rot-vehicle.off{background:#ef4444;color:#fff;border-color:#fecaca}.rot-vehicle.selected{width:28px;height:28px;z-index:7;box-shadow:0 0 0 10px rgba(34,197,94,.20)}.rot-route-line{position:absolute;height:4px;transform-origin:left center;border-radius:999px;background:linear-gradient(90deg,rgba(34,197,94,.28),rgba(34,197,94,.95));box-shadow:0 0 16px rgba(34,197,94,.22);z-index:2}.rot-map-hint{position:absolute;left:14px;bottom:14px;right:14px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;z-index:8}.rot-chip{display:inline-flex;align-items:center;gap:7px;border:1px solid rgba(148,163,184,.16);background:rgba(2,6,23,.82);border-radius:999px;padding:7px 10px;color:#cbd5e1;font-size:11px;font-weight:850}.rot-dot{width:9px;height:9px;border-radius:50%;display:inline-block}.rot-dot.veic{background:#22c55e}.rot-dot.ponto{background:#a78bfa}.rot-dot.urg{background:#f59e0b}.rot-dot.rota{background:#16a34a}.rot-side{display:flex;flex-direction:column;gap:14px;min-width:0}.rot-kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.rot-kpi{border:1px solid rgba(34,197,94,.18);background:rgba(2,6,23,.32);border-radius:18px;padding:14px;min-height:78px}.rot-kpi span{display:block;color:#93c5fd;font-size:10px;font-weight:950;letter-spacing:.1em;text-transform:uppercase}.rot-kpi strong{display:block;margin-top:8px;color:#fff;font-size:24px}.rot-panel{border:1px solid rgba(148,163,184,.14);border-radius:20px;background:rgba(2,6,23,.36);overflow:hidden}.rot-panel h3{margin:0;padding:14px 16px;color:#fff;font-size:15px;border-bottom:1px solid rgba(148,163,184,.12);display:flex;justify-content:space-between;gap:8px}.rot-list{max-height:300px;overflow:auto}.rot-row{padding:12px 14px;border-bottom:1px solid rgba(148,163,184,.10);display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;cursor:pointer}.rot-row:hover,.rot-row.active{background:rgba(34,197,94,.10)}.rot-row strong{display:block;color:#f8fafc;font-size:13px}.rot-row small{display:block;color:#94a3b8;margin-top:4px;line-height:1.35}.rot-badge{display:inline-flex;align-items:center;border-radius:999px;padding:4px 9px;font-size:10px;font-weight:950;border:1px solid rgba(148,163,184,.18);color:#cbd5e1;background:rgba(15,23,42,.72);white-space:nowrap}.rot-badge.ok{border-color:rgba(34,197,94,.35);background:rgba(22,101,52,.24);color:#bbf7d0}.rot-badge.warn{border-color:rgba(245,158,11,.34);background:rgba(245,158,11,.12);color:#fde68a}.rot-badge.err{border-color:rgba(239,68,68,.34);background:rgba(239,68,68,.12);color:#fecaca}.rot-alert{padding:12px 14px;border-bottom:1px solid rgba(148,163,184,.10);display:grid;grid-template-columns:14px 1fr;gap:10px;align-items:start}.rot-alert-dot{width:9px;height:9px;border-radius:50%;background:#f59e0b;box-shadow:0 0 0 5px rgba(245,158,11,.12);margin-top:5px}.rot-alert strong{display:block;color:#fff;font-size:13px;margin-bottom:3px}.rot-alert small{display:block;color:#cbd5e1;line-height:1.35}.rot-empty{padding:26px;text-align:center;color:#94a3b8}.rot-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.rot-mini{border:1px solid rgba(148,163,184,.12);background:rgba(15,23,42,.42);border-radius:16px;padding:12px}.rot-mini span{display:block;color:#94a3b8;font-size:10px;text-transform:uppercase;font-weight:950;letter-spacing:.08em}.rot-mini strong{display:block;margin-top:6px;color:#fff;font-size:18px}.rot-form{display:grid;gap:10px;padding:14px}.rot-field{display:flex;flex-direction:column;gap:6px}.rot-field label{font-size:10px;color:#94a3b8;font-weight:950;letter-spacing:.08em;text-transform:uppercase}.rot-input{height:40px;border:1px solid rgba(148,163,184,.18);border-radius:12px;background:#0d0d18;color:#e2e2f0;padding:0 12px;outline:none;color-scheme:dark}.rot-form-actions{display:flex;gap:8px;justify-content:flex-end}.rot-row-rm{border:0;border-radius:10px;padding:6px 10px;font-weight:900;cursor:pointer;font-size:11px;background:rgba(239,68,68,.14);color:#fecaca}.rot-toast{position:fixed;right:22px;bottom:22px;z-index:9999;border:1px solid rgba(134,239,172,.32);background:rgba(22,101,52,.96);color:#dcfce7;border-radius:16px;padding:12px 16px;font-weight:950;box-shadow:0 16px 45px rgba(0,0,0,.35);opacity:0;transform:translateY(10px);pointer-events:none;transition:.2s ease}.rot-toast.show{opacity:1;transform:translateY(0)}@media(max-width:1180px){.rot-grid{grid-template-columns:1fr}.rot-map{height:auto;min-height:520px}}@media(max-width:680px){.rot-toolbar{align-items:stretch}.rot-tools-left,.rot-tools-right{width:100%;display:grid;grid-template-columns:1fr}.rot-kpis,.rot-summary{grid-template-columns:1fr}.rot-map{min-height:420px}}
    </style>`;

  const state = {
    veiculos: [],
    rotas: [],
    naoAlocados: [],
    semCoordenadas: [],
    totais: {},
    alertas: [],
    embarquesExtras: [],
    filtro: 'todos',
    rotaSelecionadaId: null,
    mostrarTodasRotas: false,
    mostrarFormEmbarque: false,
    bounds: null,
    loading: false,
    busy: false,
    publicadoEm: null,
  };

  let _opts = {};
  let _timer = null;
  let _veiculosBase = [];

  function esc(v) { return String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[c])); }
  function br(n, d = 0) { return Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: d }); }
  function toast(msg, error = false) { let el = document.querySelector('.rot-toast'); if (!el) { el = document.createElement('div'); el.className = 'rot-toast'; document.body.appendChild(el); } el.textContent = msg; el.style.background = error ? 'rgba(127,29,29,.96)' : 'rgba(22,101,52,.96)'; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 3200); }
  function fmtTempo(min) { const h = Math.floor((min || 0) / 60); const m = Math.round((min || 0) % 60); if (!h) return `${m} min`; return `${h}h${String(m).padStart(2, '0')}`; }
  function normalizePlate(v) { return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7); }
  function statusLabel(status) { return { em_movimento: 'Em movimento', parado: 'Parado', sem_sinal: 'Sem sinal' }[status] || status; }
  function todaySP() { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); }

  function resolveSupabase(opts = {}) {
    const candidates = [
      opts?.supabase,
      window.supabase,
      window.supabaseClient,
      window.SUPABASE_CLIENT,
      window.__SUPABASE_CLIENT__,
      window.APP_SUPABASE,
      window.App?.supabase,
      window.ADM?.supabase,
      window.PAINEL?.supabase,
      window.auth?.supabase,
      window.AUTH?.supabase
    ];
    return candidates.find((client) => client && typeof client.from === 'function') || null;
  }

  async function callEdgeFunction(opts, name, body) {
    const supabase = resolveSupabase(opts);
    if (!supabase?.functions?.invoke) {
      throw new Error('Supabase Functions não encontrado nesta página.');
    }
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (error) {
      const msg = error.context?.error || error.context?.message || error.message || `Falha na function ${name}`;
      throw new Error(msg);
    }
    if (data?.error) throw new Error(data.error);
    return data || {};
  }

  function mergeVeiculos(veiculosBase, posicoes) {
    const posByVeiculo = new Map();
    const posByPlaca = new Map();
    (posicoes || []).forEach(p => {
      if (p.veiculo_id) posByVeiculo.set(p.veiculo_id, p);
      const placa = normalizePlate(p.placa);
      if (placa) posByPlaca.set(placa, p);
    });

    const agora = Date.now();
    state.veiculos = (veiculosBase || []).map(v => {
      const pos = posByVeiculo.get(v.id) || posByPlaca.get(normalizePlate(v.placa)) || null;
      const lat = pos ? Number(pos.latitude) : NaN;
      const lng = pos ? Number(pos.longitude) : NaN;
      const temPosicao = Number.isFinite(lat) && Number.isFinite(lng);
      const reportadoEm = pos?.reportado_em ? new Date(pos.reportado_em) : null;
      const horasDesdeReporte = reportadoEm ? (agora - reportadoEm.getTime()) / 36e5 : Infinity;

      let status = 'sem_sinal';
      if (temPosicao && horasDesdeReporte <= SEM_SINAL_HORAS) {
        status = Number(pos.velocidade_kmh || 0) > 3 ? 'em_movimento' : 'parado';
      }

      return {
        id: v.id,
        placa: v.placa || '—',
        motorista: pos?.motorista || v.motorista_atual || '—',
        coordenacao: v.coordenacao || '',
        supervisao: v.supervisao || '',
        lat: temPosicao ? lat : null,
        lng: temPosicao ? lng : null,
        velocidade: Number(pos?.velocidade_kmh || 0),
        direcao: Number(pos?.direcao || 0),
        ignicao: Boolean(pos?.ignicao),
        endereco: pos?.endereco || '',
        reportadoEm,
        status,
      };
    });
  }

  async function loadDados() {
    const supabase = resolveSupabase(_opts);
    if (!supabase) throw new Error('Supabase indisponível nesta página.');

    const [{ data: veiculos, error: vErr }, { data: posicoes, error: pErr }] = await Promise.all([
      supabase.from('frotas_veiculos').select('id,placa,motorista_atual,coordenacao,supervisao,status').eq('status', 'ATIVO').limit(5000),
      supabase.from('frotas_posicoes').select('placa,veiculo_id,latitude,longitude,velocidade_kmh,direcao,ignicao,endereco,motorista,sinal,reportado_em').limit(5000),
    ]);
    if (vErr) throw vErr;
    if (pErr) throw pErr;

    _veiculosBase = veiculos || [];
    mergeVeiculos(_veiculosBase, posicoes || []);
    await loadRotasPublicadas(supabase);
  }

  async function loadRotasPublicadas(supabase) {
    state.rotas = [];
    state.naoAlocados = [];
    state.semCoordenadas = [];
    state.totais = {};
    state.publicadoEm = null;
    state.rotaSelecionadaId = null;

    const dataStr = todaySP();
    const { data: rotas, error: rErr } = await supabase
      .from('frotas_rotas')
      .select('id,placa,veiculo_id,motorista,origem_latitude,origem_longitude,km_total_estimado,duracao_estimada_min,geometria,publicado_em')
      .eq('data', dataStr)
      .eq('status', 'publicada');
    if (rErr) throw rErr;
    if (!rotas || !rotas.length) return;

    const ids = rotas.map(r => r.id);
    const { data: paradas, error: ppErr } = await supabase
      .from('frotas_rotas_paradas')
      .select('id,rota_id,os_id,ordem,ponto_nome,embarque_texto,latitude,longitude,distancia_km_trecho,duracao_min_trecho')
      .in('rota_id', ids)
      .order('ordem', { ascending: true });
    if (ppErr) throw ppErr;

    const paradasPorRota = new Map();
    (paradas || []).forEach(p => {
      if (!paradasPorRota.has(p.rota_id)) paradasPorRota.set(p.rota_id, []);
      paradasPorRota.get(p.rota_id).push({
        ordem: p.ordem,
        os_id: p.os_id,
        ponto_nome: p.ponto_nome,
        embarque_texto: p.embarque_texto,
        lat: Number(p.latitude),
        lng: Number(p.longitude),
        distancia_km_trecho: Number(p.distancia_km_trecho || 0),
        duracao_min_trecho: Number(p.duracao_min_trecho || 0),
      });
    });

    state.rotas = rotas.map(r => ({
      __id: r.id,
      placa: r.placa,
      veiculo_id: r.veiculo_id,
      motorista: r.motorista,
      origem: { lat: Number(r.origem_latitude), lng: Number(r.origem_longitude) },
      paradas: paradasPorRota.get(r.id) || [],
      km_total_estimado: Number(r.km_total_estimado || 0),
      duracao_estimada_min: Number(r.duracao_estimada_min || 0),
      geometria: r.geometria || null,
      distancia_real: !!r.geometria,
    }));

    state.rotaSelecionadaId = state.rotas[0]?.__id || null;
    const ultimaPublicacao = rotas.map(r => r.publicado_em).filter(Boolean).sort().pop();
    state.publicadoEm = ultimaPublicacao || null;
  }

  async function refreshPosicoes(doRender = true) {
    try {
      const supabase = resolveSupabase(_opts);
      if (!supabase) return;
      const { data: posicoes, error } = await supabase
        .from('frotas_posicoes')
        .select('placa,veiculo_id,latitude,longitude,velocidade_kmh,direcao,ignicao,endereco,motorista,sinal,reportado_em')
        .limit(5000);
      if (error) throw error;
      mergeVeiculos(_veiculosBase, posicoes || []);
      computeBounds();
      if (doRender) renderMapOnly();
    } catch (e) {
      console.warn('[roteirizacao] refresh de posições falhou:', e?.message || e);
    }
  }

  function computeBounds() {
    const pontos = [];
    state.veiculos.forEach(v => { if (v.lat != null && v.lng != null) pontos.push([v.lat, v.lng]); });
    state.rotas.forEach(r => {
      if (r.origem) pontos.push([r.origem.lat, r.origem.lng]);
      r.paradas.forEach(p => pontos.push([p.lat, p.lng]));
    });
    state.embarquesExtras.forEach(e => pontos.push([e.latitude, e.longitude]));

    if (!pontos.length) {
      state.bounds = { minLat: -33, maxLat: 5, minLng: -74, maxLng: -34 };
      return;
    }

    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    pontos.forEach(([lat, lng]) => {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    });

    const padLat = Math.max((maxLat - minLat) * 0.08, 0.05);
    const padLng = Math.max((maxLng - minLng) * 0.08, 0.05);
    state.bounds = { minLat: minLat - padLat, maxLat: maxLat + padLat, minLng: minLng - padLng, maxLng: maxLng + padLng };
  }

  function project(lat, lng) {
    const b = state.bounds;
    if (!b || lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const x = ((lng - b.minLng) / (b.maxLng - b.minLng)) * 100;
    const y = ((b.maxLat - lat) / (b.maxLat - b.minLat)) * 100;
    return { x: Math.min(98, Math.max(2, x)), y: Math.min(98, Math.max(2, y)) };
  }

  function brasilOutlineSvg() {
    const pts = BRASIL_OUTLINE.map(([lat, lng]) => project(lat, lng)).filter(Boolean);
    if (pts.length < 3) return '';
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ') + ' Z';
    return `<svg class="rot-map-brasil" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="${d}"/></svg>`;
  }

  function aplicarResultadoRoteirizacao(resp, publicado) {
    state.rotas = (resp.rotas || []).map((r, i) => ({ ...r, __id: publicado ? `pub-${i}` : `preview-${i}` }));
    state.naoAlocados = resp.naoAlocados || [];
    state.semCoordenadas = resp.semCoordenadas || [];
    state.totais = resp.totais || {};
    state.rotaSelecionadaId = state.rotas[0]?.__id || null;
    state.mostrarTodasRotas = false;
    computeBounds();
    buildAlerts();
    if (publicado) state.publicadoEm = new Date().toISOString();
  }

  async function roteirizar() {
    if (state.busy) return;
    state.busy = true;
    render();
    try {
      const resp = await callEdgeFunction(_opts, ROTEIRIZAR_FUNCTION, {
        maxParadas: 6,
        embarquesExtras: state.embarquesExtras,
        publicar: false,
      });
      aplicarResultadoRoteirizacao(resp, false);
      toast(`${resp.rotas?.length || 0} rotas geradas · ${resp.totais?.alocados ?? 0} embarques alocados.`);
    } catch (e) {
      toast(e?.message || 'Falha ao roteirizar.', true);
    } finally {
      state.busy = false;
      render();
    }
  }

  async function publicar() {
    if (state.busy) return;
    if (!state.rotas.length) { toast('Gere as rotas com "Roteirizar agora" antes de publicar.', true); return; }
    if (!confirm('Publicar estas rotas substitui as rotas já publicadas hoje. Continuar?')) return;
    state.busy = true;
    render();
    try {
      const resp = await callEdgeFunction(_opts, ROTEIRIZAR_FUNCTION, {
        maxParadas: 6,
        embarquesExtras: state.embarquesExtras,
        publicar: true,
      });
      aplicarResultadoRoteirizacao(resp, true);
      toast(`Rotas publicadas: ${resp.rotas?.length || 0}.`);
    } catch (e) {
      toast(e?.message || 'Falha ao publicar rotas.', true);
    } finally {
      state.busy = false;
      render();
    }
  }

  async function atualizarPosicoes() {
    if (state.busy) return;
    state.busy = true;
    render();
    try {
      const resp = await callEdgeFunction(_opts, BFLEET_POSICOES_FUNCTION, {});
      await refreshPosicoes(false);
      buildAlerts();
      toast(`Posições atualizadas: ${resp.atualizados ?? 0}/${resp.total ?? 0}.`);
    } catch (e) {
      toast(e?.message || 'Falha ao atualizar posições.', true);
    } finally {
      state.busy = false;
      render();
    }
  }

  function toggleFormEmbarque() {
    state.mostrarFormEmbarque = !state.mostrarFormEmbarque;
    render();
  }

  function salvarEmbarqueExtra(form) {
    const nome = form.querySelector('[data-embarque-nome]')?.value.trim();
    const uf = form.querySelector('[data-embarque-uf]')?.value.trim().toUpperCase();
    const coordsRaw = form.querySelector('[data-embarque-coords]')?.value.trim();
    if (!nome || !coordsRaw) { toast('Preencha o nome e as coordenadas.', true); return; }

    const partes = coordsRaw.split(',').map(s => Number(s.trim()));
    if (partes.length !== 2 || partes.some(n => !Number.isFinite(n))) {
      toast('Coordenadas inválidas. Use o formato "lat, lng".', true);
      return;
    }

    state.embarquesExtras.push({ nome, uf: uf || '', latitude: partes[0], longitude: partes[1] });
    state.mostrarFormEmbarque = false;
    computeBounds();
    render();
    toast('Embarque adicionado. Clique em "Roteirizar agora" para incluir na próxima rota.');
  }

  function removerEmbarqueExtra(idx) {
    state.embarquesExtras.splice(idx, 1);
    computeBounds();
    render();
  }

  function toggleRotas() {
    state.mostrarTodasRotas = !state.mostrarTodasRotas;
    render();
  }

  function buildAlerts() {
    state.alertas = [];
    state.veiculos.filter(v => v.status === 'sem_sinal').slice(0, 6).forEach(v => {
      state.alertas.push({ tipo: 'Sem sinal', texto: `${v.placa} · ${v.motorista !== '—' ? v.motorista : 'sem motorista vinculado'} sem posição recente do rastreador`, nivel: 'err' });
    });
    state.naoAlocados.slice(0, 6).forEach(n => {
      state.alertas.push({ tipo: 'Embarque não alocado', texto: `${n.embarque || 'Embarque'} — ${n.motivo || 'sem motivo informado'}`, nivel: 'warn' });
    });
    state.semCoordenadas.slice(0, 6).forEach(s => {
      state.alertas.push({ tipo: 'Sem coordenadas', texto: `${s.embarque || 'Embarque'}${s.cliente ? ' · ' + s.cliente : ''}`, nivel: 'warn' });
    });
  }

  function kpis() {
    const comPosicao = state.veiculos.filter(v => v.lat != null && v.lng != null).length;
    const semSinal = state.veiculos.filter(v => v.status === 'sem_sinal').length;
    const kmTotal = state.totais.km_total != null
      ? Number(state.totais.km_total)
      : state.rotas.reduce((s, r) => s + Number(r.km_total_estimado || 0), 0);
    const tempoTotal = state.rotas.reduce((s, r) => s + Number(r.duracao_estimada_min || 0), 0);
    const embarques = state.totais.embarques != null
      ? Number(state.totais.embarques)
      : state.rotas.reduce((s, r) => s + r.paradas.length, 0);
    return {
      veiculosComPosicao: comPosicao,
      veiculosTotal: state.veiculos.length,
      embarques,
      pendentes: state.naoAlocados.length + state.semCoordenadas.length,
      rotas: state.rotas.length,
      kmTotal,
      semSinal,
      tempoTotal,
    };
  }

  function rotasVisiveis() {
    if (!state.rotas.length) return [];
    if (state.mostrarTodasRotas) return state.rotas.slice(0, 8);
    const sel = state.rotas.find(r => r.__id === state.rotaSelecionadaId);
    return sel ? [sel] : state.rotas.slice(0, 1);
  }

  function routeLinesHtml() {
    const lines = [];
    rotasVisiveis().forEach((r) => {
      let prev = project(r.origem?.lat, r.origem?.lng);
      r.paradas.forEach(p => {
        const cur = project(p.lat, p.lng);
        if (prev && cur) {
          const len = Math.sqrt((cur.x - prev.x) ** 2 + (cur.y - prev.y) ** 2);
          const ang = Math.atan2(cur.y - prev.y, cur.x - prev.x) * 180 / Math.PI;
          lines.push(`<div class="rot-route-line" style="left:${prev.x}%;top:${prev.y}%;width:${len}%;transform:rotate(${ang}deg)"></div>`);
        }
        prev = cur || prev;
      });
    });
    return lines.join('');
  }

  function mapHtml() {
    const visiveis = rotasVisiveis();
    const pointIds = new Set();
    if (state.mostrarTodasRotas) {
      const sel = state.rotas.find(r => r.__id === state.rotaSelecionadaId);
      sel?.paradas.forEach(p => pointIds.add(`${sel.__id}:${p.ordem}`));
    } else {
      visiveis.forEach(r => r.paradas.forEach(p => pointIds.add(`${r.__id}:${p.ordem}`)));
    }

    const pontosHtml = visiveis.flatMap(r => r.paradas.map(p => {
      const pos = project(p.lat, p.lng);
      if (!pos) return '';
      const urgent = p.os_id == null ? 'urgent' : '';
      const selected = pointIds.has(`${r.__id}:${p.ordem}`) ? 'selected' : '';
      const titulo = `${p.ponto_nome || 'Parada'}${p.embarque_texto ? ' · ' + p.embarque_texto : ''}`;
      return `<div class="rot-point ${urgent} ${selected}" style="left:${pos.x}%;top:${pos.y}%" title="${esc(titulo)}"></div>`;
    })).join('');

    const extrasHtml = state.embarquesExtras.map(e => {
      const pos = project(e.latitude, e.longitude);
      if (!pos) return '';
      return `<div class="rot-point urgent" style="left:${pos.x}%;top:${pos.y}%" title="${esc(e.nome)}${e.uf ? ' · ' + esc(e.uf) : ''} (extra)"></div>`;
    }).join('');

    const filtro = state.filtro;
    const veicsHtml = state.veiculos
      .filter(v => v.lat != null && v.lng != null)
      .filter(v => filtro === 'todos' || v.status === filtro)
      .map(v => {
        const pos = project(v.lat, v.lng);
        if (!pos) return '';
        const off = v.status === 'sem_sinal' ? 'off' : '';
        const titulo = `${v.placa} · ${v.motorista} · ${statusLabel(v.status)} · ${br(v.velocidade)} km/h`;
        const icone = v.status === 'sem_sinal' ? '!' : (v.status === 'em_movimento' ? '▶' : '■');
        return `<div class="rot-vehicle ${off}" style="left:${pos.x}%;top:${pos.y}%" title="${esc(titulo)}">${icone}</div>`;
      }).join('');

    return `<div class="rot-map">${brasilOutlineSvg()}<div class="rot-map-inner">${routeLinesHtml()}${pontosHtml}${extrasHtml}${veicsHtml}<div class="rot-map-hint"><span class="rot-chip"><span class="rot-dot veic"></span>Veículo</span><span class="rot-chip"><span class="rot-dot ponto"></span>Parada</span><span class="rot-chip"><span class="rot-dot urg"></span>Urgente</span><span class="rot-chip"><span class="rot-dot rota"></span>${state.mostrarTodasRotas ? `Até ${Math.min(8, state.rotas.length)} rotas visíveis` : 'Rota selecionada'}</span></div></div></div>`;
  }

  function renderMapOnly() {
    const map = document.querySelector('.rot-map');
    if (!map) return;
    map.outerHTML = mapHtml();
  }

  function summaryHtml(k) {
    const mediaKm = state.rotas.length ? k.kmTotal / state.rotas.length : 0;
    return `<div class="rot-summary"><div class="rot-mini"><span>Tempo total estimado</span><strong>${fmtTempo(k.tempoTotal)}</strong></div><div class="rot-mini"><span>Média por rota</span><strong>${br(mediaKm, 1)} km</strong></div><div class="rot-mini"><span>Modo do mapa</span><strong>${state.mostrarTodasRotas ? 'Geral' : 'Focado'}</strong></div></div>`;
  }

  function routesPanel() {
    if (!state.rotas.length) {
      return `<div class="rot-panel"><h3>Rotas do dia</h3><div class="rot-empty">Clique em “Roteirizar agora” para gerar a sugestão automática com base nos embarques de hoje.</div></div>`;
    }
    return `<div class="rot-panel"><h3><span>Rotas do dia</span><span class="rot-badge">${state.rotas.length}</span></h3><div class="rot-list">${state.rotas.slice(0, 8).map(r => {
      const badge = r.distancia_real ? '<span class="rot-badge ok">Real (OSRM)</span>' : '<span class="rot-badge warn">Estimativa</span>';
      return `<div class="rot-row ${r.__id === state.rotaSelecionadaId ? 'active' : ''}" data-rota="${esc(r.__id)}"><div><strong>${esc(r.placa)} · ${esc(r.motorista || 'sem motorista')}</strong><small>${r.paradas.length} paradas · ${br(r.km_total_estimado, 1)} km · ${fmtTempo(r.duracao_estimada_min)}</small></div>${badge}</div>`;
    }).join('')}</div></div>`;
  }

  function alertsPanel() {
    if (!state.alertas.length) return `<div class="rot-panel"><h3>Alertas operacionais</h3><div class="rot-empty">Nenhum alerta no momento.</div></div>`;
    return `<div class="rot-panel"><h3>Alertas operacionais</h3><div class="rot-list">${state.alertas.slice(0, 12).map(a => `<div class="rot-alert"><span class="rot-alert-dot"></span><div><strong>${esc(a.tipo)}</strong><small>${esc(a.texto)}</small></div></div>`).join('')}</div></div>`;
  }

  function embarqueFormHtml() {
    if (!state.mostrarFormEmbarque) return '';
    return `<div class="rot-panel" data-embarque-form><h3>Novo embarque urgente</h3><div class="rot-form"><div class="rot-field"><label>Nome</label><input class="rot-input" type="text" data-embarque-nome placeholder="Ex.: Embarque urgente Cliente X"></div><div class="rot-field"><label>UF</label><input class="rot-input" type="text" maxlength="2" data-embarque-uf placeholder="PR"></div><div class="rot-field"><label>Coordenadas (lat, lng)</label><input class="rot-input" type="text" data-embarque-coords placeholder="-24.9555, -53.4552"></div><div class="rot-form-actions"><button class="rot-btn ghost" data-act="cancelar-embarque" type="button">Cancelar</button><button class="rot-btn primary" data-act="salvar-embarque" type="button">Adicionar</button></div></div></div>`;
  }

  function embarquesExtrasPanel() {
    if (!state.embarquesExtras.length) return '';
    return `<div class="rot-panel"><h3><span>Embarques extras</span><span class="rot-badge">${state.embarquesExtras.length}</span></h3><div class="rot-list">${state.embarquesExtras.map((e, i) => `<div class="rot-row"><div><strong>${esc(e.nome)}</strong><small>${esc(e.uf || '—')} · ${br(e.latitude, 4)}, ${br(e.longitude, 4)}</small></div><button class="rot-row-rm" data-act="remover-embarque" data-idx="${i}" type="button">Remover</button></div>`).join('')}</div></div>`;
  }

  function render() {
    const k = kpis();
    const root = _opts.root;
    if (!root) return;

    const rotearLabel = state.busy ? 'Roteirizando…' : 'Roteirizar agora';
    const atualizarLabel = state.busy ? 'Atualizando…' : 'Atualizar posições';
    const publicarDisabled = (!state.rotas.length || state.busy) ? 'disabled' : '';
    const toggleDisabled = state.rotas.length ? '' : 'disabled';
    const busyAttr = state.busy ? 'disabled' : '';

    const corpo = state.loading
      ? `<div class="rot-empty">Carregando dados da frota…</div>`
      : `<div class="rot-grid"><div class="rot-map-wrap">${mapHtml()}${summaryHtml(k)}</div><aside class="rot-side">${embarqueFormHtml()}${embarquesExtrasPanel()}<div class="rot-kpis"><div class="rot-kpi"><span>Veículos c/ posição</span><strong>${br(k.veiculosComPosicao)}/${br(k.veiculosTotal)}</strong></div><div class="rot-kpi"><span>Embarques</span><strong>${br(k.embarques)}</strong></div><div class="rot-kpi"><span>Pendentes</span><strong>${br(k.pendentes)}</strong></div><div class="rot-kpi"><span>Rotas</span><strong>${br(k.rotas)}</strong></div><div class="rot-kpi"><span>Km planejado</span><strong>${br(k.kmTotal, 1)}</strong></div><div class="rot-kpi"><span>Sem sinal</span><strong>${br(k.semSinal)}</strong></div></div>${routesPanel()}${alertsPanel()}</aside></div>`;

    root.innerHTML = `${styles}<section class="rot-shell"><div class="rot-head"><div class="rot-kicker">Frotas · Roteirização</div><h2 class="rot-title">Roteirização com dados reais da BFleet</h2><p class="rot-sub">Veículos e posições vêm de <code>frotas_veiculos</code>/<code>frotas_posicoes</code> (sincronizados da BFleet). “Roteirizar agora” chama a função real (OSRM) para sugerir rotas a partir das OS ativas; “Publicar rotas” grava as rotas do dia para os motoristas.${state.publicadoEm ? ` Última publicação: ${new Date(state.publicadoEm).toLocaleString('pt-BR')}.` : ''}</p></div><div class="rot-card"><div class="rot-toolbar"><div class="rot-tools-left"><button class="rot-btn primary" data-act="roteirizar" ${busyAttr}>${rotearLabel}</button><button class="rot-btn soft" data-act="novo">${state.mostrarFormEmbarque ? 'Cancelar embarque' : '+ Novo embarque'}</button><button class="rot-btn ghost" data-act="toggle-rotas" ${toggleDisabled}>${state.mostrarTodasRotas ? 'Ver rota selecionada' : 'Mostrar várias rotas'}</button><button class="rot-btn ghost" data-act="publicar" ${publicarDisabled}>Publicar rotas</button><button class="rot-btn ghost" data-act="atualizar" ${busyAttr}>${atualizarLabel}</button></div><div class="rot-tools-right"><select class="rot-select" data-act="filtro"><option value="todos">Todos os veículos</option><option value="em_movimento">Em movimento</option><option value="parado">Parados</option><option value="sem_sinal">Sem sinal</option></select></div></div>${corpo}</div></section>`;
    bind();
  }

  function bind() {
    document.querySelector('[data-act="roteirizar"]')?.addEventListener('click', roteirizar);
    document.querySelector('[data-act="publicar"]')?.addEventListener('click', publicar);
    document.querySelector('[data-act="atualizar"]')?.addEventListener('click', atualizarPosicoes);
    document.querySelector('[data-act="novo"]')?.addEventListener('click', toggleFormEmbarque);
    document.querySelector('[data-act="cancelar-embarque"]')?.addEventListener('click', toggleFormEmbarque);
    document.querySelector('[data-act="salvar-embarque"]')?.addEventListener('click', () => {
      const form = document.querySelector('[data-embarque-form]');
      if (form) salvarEmbarqueExtra(form);
    });
    document.querySelectorAll('[data-act="remover-embarque"]').forEach(btn => {
      btn.addEventListener('click', () => removerEmbarqueExtra(Number(btn.dataset.idx)));
    });
    document.querySelector('[data-act="toggle-rotas"]')?.addEventListener('click', toggleRotas);
    document.querySelectorAll('[data-rota]').forEach(el => {
      el.addEventListener('click', () => { state.rotaSelecionadaId = el.dataset.rota; state.mostrarTodasRotas = false; render(); });
    });
    const filtro = document.querySelector('[data-act="filtro"]');
    if (filtro) {
      filtro.value = state.filtro;
      filtro.addEventListener('change', e => { state.filtro = e.target.value; renderMapOnly(); });
    }
  }

  async function openHome(root, opts = {}) {
    _opts = { ...opts, root };
    state.loading = true;
    render();
    try {
      await loadDados();
      computeBounds();
      buildAlerts();
    } catch (e) {
      console.error('[roteirizacao] loadDados falhou:', e);
      toast(e?.message || 'Falha ao carregar dados da roteirização.', true);
    }
    state.loading = false;
    render();
    clearInterval(_timer);
    _timer = setInterval(refreshPosicoes, REFRESH_MS);
  }

  window[MODULE_NAME] = { openHome, roteirizar };
})();
