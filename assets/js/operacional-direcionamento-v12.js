import { supabase } from './supabaseClient.js';

(function () {
  'use strict';

  const STYLE_ID = 'opv12-direcionamento-style';
  const LEAFLET_CSS = 'leaflet-css-opv12';
  const LEAFLET_JS = 'leaflet-js-opv12';
  const OSRM_BASE = 'https://router.project-osrm.org';
  const RAIO_REPETIR_COLAB_KM = 5;
  const HOTEL_KM = 120;
  const BR_LAT_MIN = -34.2;
  const BR_LAT_MAX = 6.0;
  const BR_LNG_MIN = -74.5;
  const BR_LNG_MAX = -28.0;

  const st = {
    os: [],
    osTodas: [],
    pontos: [],
    vinculos: [],
    colaboradores: [],
    patrimonios: [],
    rotas: [],
    semAssociacao: [],
    estado: '',
    ponto: '',
    rota: '',
    mostrarRota: true,
    fallbackSaldo: false,
    map: null,
    layer: null,
    rotaRealCache: new Map(),
  };

  const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  const norm = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  const digits = v => String(v ?? '').replace(/\D/g, '');

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    let s = String(v).trim();
    if (!s) return null;
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(',', '.');
    s = s.replace(/[^0-9.-]/g, '');
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  const lat = r => num(r?.latitude ?? r?.lat);
  const lng = r => num(r?.longitude ?? r?.lng ?? r?.lon);
  const first = (r, fs) => fs.map(f => r?.[f]).find(v => v !== undefined && v !== null && String(v).trim() !== '') ?? '';
  const kmFmt = v => Number.isFinite(Number(v)) ? `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km` : '—';

  function inBrazil(a, b) {
    const la = Number(a);
    const lo = Number(b);
    return Number.isFinite(la) && Number.isFinite(lo)
      && la >= BR_LAT_MIN && la <= BR_LAT_MAX
      && lo >= BR_LNG_MIN && lo <= BR_LNG_MAX;
  }

  function geo(r) {
    return inBrazil(lat(r), lng(r));
  }

  function km(a, b, c, d) {
    if (!inBrazil(a, b) || !inBrazil(c, d)) return null;
    const la1 = Number(a), lo1 = Number(b), la2 = Number(c), lo2 = Number(d);
    const R = 6371;
    const dlat = (la2 - la1) * Math.PI / 180;
    const dlon = (lo2 - lo1) * Math.PI / 180;
    const x = Math.sin(dlat / 2) ** 2 + Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dlon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  function colKey(r) {
    const cpf = digits(first(r, ['cpf', 'colaborador_cpf', 'documento', 'colaborador_key']));
    if (cpf.length === 11) return `cpf:${cpf}`;
    return `nome:${norm(first(r, ['nome', 'funcionario', 'colaborador', 'colaborador_nome', 'nome_colaborador', 'colaborador_key']))}`;
  }

  function short(n) {
    const p = String(n || '').trim().split(/\s+/);
    return p.length > 1 ? `${p[0]} ${p[1]}` : (p[0] || '—');
  }

  function splitEmb(t) {
    const m = String(t || '').match(/^([A-Z]{2})\s*-\s*([^()]+?)(?:\s*\(([^)]+)\))?\s*$/i);
    return m ? { uf: m[1], cidade: m[2], local: m[3] || '' } : { uf: '', cidade: String(t || ''), local: '' };
  }

  function pKey(p) {
    return `${norm(p.uf)}|${norm(p.cidade)}|${norm(p.nome_local || p.tipo_local || '')}`;
  }

  async function sel(table, columns = '*', fn = null, limit = 5000) {
    try {
      let q = supabase.from(table).select(columns).limit(limit);
      if (fn) q = fn(q);
      const { data, error } = await q;
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.warn(`[opv12] ${table}:`, e?.message || e);
      return [];
    }
  }

  function osAberta(o) {
    const s = norm(`${o.situacao || ''} ${o.status || ''} ${o.status_logistica || ''} ${o.status_gestor || ''}`);
    return !['FINALIZAD', 'FINALIZADA', 'DEVOLVID', 'CANCELAD', 'CONCLUID', 'ENCERRAD', 'ARQUIVAD', 'INATIV'].some(x => s.includes(x));
  }

  function saldoRemanescente(o) {
    const campos = [
      'saldo_remanescente', 'saldo_remanescente_ton', 'saldo_remanescente_tons', 'saldo_restante',
      'saldo', 'saldo_ton', 'saldo_tons', 'volume_saldo', 'volume_remanescente', 'volume_restante',
      'saldo_a_programar', 'saldo_aberto', 'quantidade_saldo', 'qtd_saldo', 'toneladas_saldo'
    ];

    for (const k of campos) {
      if (Object.prototype.hasOwnProperty.call(o || {}, k)) {
        const n = num(o?.[k]);
        if (n !== null) return n;
      }
    }

    const dynamic = Object.keys(o || {}).find(k => {
      const nk = norm(k);
      return nk.includes('SALDO') || nk.includes('REMANESCENTE') || nk.includes('RESTANTE');
    });
    if (dynamic) {
      const n = num(o?.[dynamic]);
      if (n !== null) return n;
    }

    const volume = num(o?.volume_inicial ?? o?.volume ?? o?.quantidade ?? o?.tons ?? o?.toneladas);
    const realizado = num(o?.volume_realizado ?? o?.volume_atendido ?? o?.quantidade_atendida ?? o?.tons_atendidas ?? o?.embarque_realizado) ?? 0;
    if (volume !== null) return Math.max(0, volume - realizado);

    return null;
  }

  function temSaldoOperacional(o) {
    if (st.fallbackSaldo) return true;
    return (o.__saldo ?? 0) > 0;
  }

  function pontoDaOs(o) {
    const e = splitEmb(o.embarque || o.cidade_embarque || o.local_embarque || '');
    const uf = norm(e.uf || o.uf || o.uf_embarque);
    const cidade = norm(e.cidade || o.cidade || o.cidade_embarque);
    const local = norm(e.local || o.local || o.local_embarque || o.cliente);
    const cli = norm(o.cliente || '');
    const sup = norm(o.supervisao || o.coordenacao || '');

    let best = null;
    for (const p of st.pontos) {
      let sc = 0;
      const pu = norm(p.uf);
      const pc = norm(p.cidade);
      const pn = norm(p.nome_local || p.tipo_local || '');
      const ps = norm(p.supervisao || p.coordenacao || '');
      if (uf && pu === uf) sc += 45;
      if (cidade && (pc === cidade || pc.includes(cidade) || cidade.includes(pc))) sc += 85;
      if (local && (pn.includes(local) || local.includes(pn))) sc += 120;
      if (cli && (pn.includes(cli) || cli.includes(pn))) sc += 25;
      if (sup && ps && (ps.includes(sup) || sup.includes(ps))) sc += 15;
      if (sc >= 110 && (!best || sc > best.sc)) best = { p, sc };
    }
    return best?.p || null;
  }

  function isVeiculoPatrimonio(p) {
    const txt = norm(`${p.identificacao || ''} ${p.categoria || ''} ${p.material || ''} ${p.descricao || ''} ${p.patrimonio_codigo || ''} ${p.numero_patrimonio || ''}`);
    return /VEICULO|VEICULOS|CARRO|CAMINHONETE|CAMINHAO|MOTO|PLACA|SAVEIRO|STRADA|HILUX|AMAROK|S10|L200|RANGER|TORO|FIORINO|UNO|GOL|VOYAGE|ONIX|HB20|FIAT|CHEVROLET|VOLKSWAGEN|TOYOTA|MITSUBISHI|FORD|RENAULT|NISSAN|[A-Z]{3}[0-9][A-Z0-9][0-9]{2}/.test(txt);
  }

  function veicPatr(c) {
    const nome = norm(c.nome);
    const cpf = digits(c.cpf);
    return st.patrimonios.find(p => {
      if (!isVeiculoPatrimonio(p)) return false;
      const sit = norm(`${p.situacao || ''} ${p.status || ''}`);
      if (/INATIV|DESLIGAD|DEMITID|REMOVID|BAIXAD/.test(sit)) return false;
      const pn = norm(p.funcionario || p.colaborador || p.nome || p.responsavel || p.patrimonio_funcionario);
      const pc = digits(p.cpf || p.documento || p.colaborador_cpf);
      return (cpf && pc === cpf) || pn === nome;
    }) || null;
  }

  function mesmoLocalOuRaio(p1, p2) {
    if (!p1 || !p2) return false;
    if (pKey(p1) === pKey(p2)) return true;
    const d = km(lat(p1), lng(p1), lat(p2), lng(p2));
    return d !== null && d <= RAIO_REPETIR_COLAB_KM;
  }

  function podeUsarColaborador(c, ponto, usos) {
    const usados = usos.get(c.id) || [];
    if (!usados.length) return true;
    return usados.some(p => mesmoLocalOuRaio(p, ponto));
  }

  function registrarUso(c, ponto, usos) {
    const arr = usos.get(c.id) || [];
    arr.push(ponto);
    usos.set(c.id, arr);
  }

  function carregarColaboradorDaBase(v, colMap, baseMap) {
    const key = colKey(v);
    const base = baseMap.get(key) || {};
    const cad = colMap.get(key) || {};
    return {
      ...cad,
      ...base,
      id: key,
      cpf: first(cad, ['cpf']) || first(base, ['cpf']) || first(v, ['cpf', 'colaborador_cpf']),
      nome: v.colaborador_nome || first(cad, ['nome']) || first(base, ['nome']) || v.colaborador_key,
    };
  }

  function distColabPonto(c, p) {
    return km(lat(c), lng(c), lat(p), lng(p)) ?? Infinity;
  }

  function escolherColaborador(os, ponto, todos, vinculosPorOs, usos) {
    const vinculados = vinculosPorOs.get(String(os.id)) || [];
    const candidatosVinculados = vinculados
      .filter(c => c.nome && geo(c) && podeUsarColaborador(c, ponto, usos))
      .map(c => ({ c, dist: distColabPonto(c, ponto), origem: 'associado' }))
      .filter(x => Number.isFinite(x.dist))
      .sort((a, b) => a.dist - b.dist);

    if (candidatosVinculados.length) return candidatosVinculados[0];

    return todos
      .filter(c => c.nome && geo(c) && podeUsarColaborador(c, ponto, usos))
      .map(c => ({ c, dist: distColabPonto(c, ponto), origem: 'sugerido' }))
      .filter(x => Number.isFinite(x.dist))
      .sort((a, b) => a.dist - b.dist || (a.c.temFrota ? 0 : 1) - (b.c.temFrota ? 0 : 1))[0] || null;
  }

  async function load() {
    const [osRaw, pontosRaw, vincRaw, colRaw, baseRaw, patRaw] = await Promise.all([
      sel('operacional_os', '*', q => q.order('created_at', { ascending: false })),
      sel('operacional_pontos_embarque', '*', q => q.eq('ativo', true)),
      sel('operacional_os_colaboradores', '*', q => q.order('created_at', { ascending: false })),
      sel('colaboradores', '*'),
      sel('operacional_colaborador_base', '*'),
      sel('vw_patrimonios_atual', '*'),
    ]);

    st.pontos = pontosRaw.filter(geo).map(p => ({ ...p, __key: pKey(p) }));
    st.patrimonios = patRaw;

    const abertas = osRaw.filter(osAberta);
    const abertasComSaldoCalculado = abertas.map(o => ({ ...o, __saldo: saldoRemanescente(o) }));
    let selecionadas = abertasComSaldoCalculado.filter(o => (o.__saldo ?? 0) > 0);
    st.fallbackSaldo = false;

    if (!selecionadas.length && abertasComSaldoCalculado.length) {
      st.fallbackSaldo = true;
      selecionadas = abertasComSaldoCalculado;
      console.warn('[opv12] Nenhuma OS passou no filtro saldo > 0. Fallback aplicado para OS abertas. Colunas:', Object.keys(abertasComSaldoCalculado[0] || {}));
    }

    st.osTodas = abertasComSaldoCalculado
      .map(o => {
        const p = pontoDaOs(o);
        return p ? { ...o, __pontoKey: p.__key, __saldo: o.__saldo } : null;
      })
      .filter(Boolean);

    st.os = selecionadas
      .map(o => {
        const p = pontoDaOs(o);
        return p ? { ...o, __pontoKey: p.__key, __saldo: o.__saldo ?? 'não identificado' } : null;
      })
      .filter(Boolean);

    const osComPonto = new Set(st.os.map(o => String(o.id)));
    const colMap = new Map();
    const baseMap = new Map();

    colRaw.forEach(c => colMap.set(colKey(c), c));
    baseRaw.forEach(c => baseMap.set(colKey(c), c));

    const todosMap = new Map();
    [...colRaw, ...baseRaw].forEach(c => {
      const key = colKey(c);
      if (!key || key === 'nome:') return;
      const merged = { ...(todosMap.get(key) || {}), ...c, id: key, nome: first(c, ['nome', 'funcionario', 'colaborador', 'colaborador_nome']) || todosMap.get(key)?.nome };
      todosMap.set(key, merged);
    });

    st.colaboradores = [...todosMap.values()]
      .filter(c => c.nome && geo(c))
      .map(c => ({ ...c, temFrota: !!(c.patrimonio = veicPatr(c)) }));

    const vinculosPorOs = new Map();
    st.vinculos = vincRaw
      .filter(v => osComPonto.has(String(v.os_id)))
      .map(v => ({ ...v, __colab: carregarColaboradorDaBase(v, colMap, baseMap) }));

    for (const v of st.vinculos) {
      const c = { ...v.__colab, temFrota: !!(v.__colab.patrimonio = veicPatr(v.__colab)) };
      const arr = vinculosPorOs.get(String(v.os_id)) || [];
      arr.push(c);
      vinculosPorOs.set(String(v.os_id), arr);
    }

    build(vinculosPorOs);
  }

  function build(vinculosPorOs) {
    const pontos = new Map(st.pontos.map(p => [p.__key, p]));
    const usos = new Map();

    st.semAssociacao = [];
    st.rotas = [];

    const ordenadas = [...st.os].sort((a, b) => {
      const pa = pontos.get(a.__pontoKey);
      const pb = pontos.get(b.__pontoKey);
      return norm(`${pa?.uf || ''}${pa?.cidade || ''}${pa?.nome_local || ''}`).localeCompare(norm(`${pb?.uf || ''}${pb?.cidade || ''}${pb?.nome_local || ''}`));
    });

    for (const os of ordenadas) {
      const ponto = pontos.get(os.__pontoKey);
      if (!ponto) continue;

      const escolhido = escolherColaborador(os, ponto, st.colaboradores, vinculosPorOs, usos);
      if (!escolhido) {
        st.semAssociacao.push({ os, ponto, motivo: 'Sem colaborador com coordenada disponível respeitando repetição por local/5 km' });
        continue;
      }

      const c = escolhido.c;
      registrarUso(c, ponto, usos);

      const d = escolhido.dist;
      const repetido = (usos.get(c.id) || []).length > 1;
      let modo = escolhido.origem === 'associado' ? 'Colaborador associado' : 'Sugerido automaticamente';
      if (repetido) modo += ' · repetido por local/5 km';
      if (c.temFrota) modo += ' · frota';

      st.rotas.push({
        id: `${os.id}|${c.id}`,
        os,
        ponto,
        colab: c,
        dist: d,
        modo,
        origem: escolhido.origem,
        repetido,
        distante: d > 120,
        precisaHotel: d > HOTEL_KM,
        score: d + (d > 120 ? 10000 : 0),
      });
    }

    st.rotas.sort((a, b) => a.score - b.score || a.dist - b.dist);
    st.pontos = st.pontos.filter(p => st.osTodas.some(o => o.__pontoKey === p.__key));
  }

  function estadosDisponiveis() {
    return [...new Set(st.osTodas.map(o => String(st.pontos.find(p => p.__key === o.__pontoKey)?.uf || '').toUpperCase()).filter(Boolean))].sort();
  }

  function passaFiltroPonto(p) {
    if (!p) return false;
    if (st.estado && String(p.uf).toUpperCase() !== st.estado) return false;
    if (st.ponto && p.__key !== st.ponto) return false;
    return true;
  }

  async function rotaReal(points) {
    const key = points.map(p => `${Number(p.lng).toFixed(5)},${Number(p.lat).toFixed(5)}`).join(';');
    if (st.rotaRealCache.has(key)) return st.rotaRealCache.get(key);

    try {
      const url = `${OSRM_BASE}/route/v1/driving/${key}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
      const data = await res.json();
      const route = data?.routes?.[0];
      if (!route?.geometry?.coordinates) throw new Error('Sem rota real para os pontos');
      const out = {
        km: route.distance / 1000,
        min: route.duration / 60,
        coords: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      };
      st.rotaRealCache.set(key, out);
      return out;
    } catch (err) {
      console.warn('[opv12] rota real indisponível:', err?.message || err);
      const fallback = { km: null, min: null, coords: null, erro: String(err?.message || err) };
      st.rotaRealCache.set(key, fallback);
      return fallback;
    }
  }

  function css() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      .opv2{color:#e2e8f0;display:flex;flex-direction:column;gap:14px}
      .opv2-card{border:1px solid rgba(148,163,184,.16);border-radius:22px;background:linear-gradient(180deg,rgba(15,23,42,.96),rgba(2,6,23,.9));overflow:hidden}
      .opv2-head{padding:16px;display:flex;justify-content:space-between;gap:12px}
      .opv2 h2,.opv2 h3{margin:0;color:#fff}.opv2 p{color:#94a3b8;margin:6px 0 0;font-size:13px}
      .opv2-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.opv2-btn{border:1px solid rgba(34,197,94,.35);border-radius:13px;background:#166534;color:#ecfdf5;font-weight:900;padding:9px 13px;cursor:pointer}.opv2-btn.off{background:#334155;border-color:rgba(148,163,184,.35)}
      .opv2-select{height:40px;border:1px solid rgba(148,163,184,.2);border-radius:13px;background:#0d0d18;color:#e2e8f0;padding:0 12px;width:100%}
      .opv2-filter{padding:0 16px 14px;display:grid;grid-template-columns:180px 1fr;gap:8px}.opv2-grid{display:grid;grid-template-columns:minmax(0,1fr) 400px;gap:14px;padding:0 16px 16px}
      .opv2-map{height:650px;border:1px solid rgba(148,163,184,.14);border-radius:20px;background:#0d1117}.opv2-side{display:flex;flex-direction:column;gap:12px}
      .opv2-kpis{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.opv2-kpi{border:1px solid rgba(34,197,94,.18);border-radius:16px;padding:12px;background:rgba(2,6,23,.35)}
      .opv2-kpi span{font-size:10px;color:#94a3b8;font-weight:900;text-transform:uppercase}.opv2-kpi strong{display:block;color:#fff;font-size:23px;margin-top:5px}
      .opv2-list{max-height:420px;overflow:auto;padding:10px}.opv2-row{border:1px solid rgba(148,163,184,.14);border-radius:15px;background:rgba(15,23,42,.62);padding:10px;margin-bottom:8px;cursor:pointer}
      .opv2-row.active,.opv2-row:hover{border-color:#22c55e;background:rgba(22,101,52,.13)}.opv2-row.sem{border-color:rgba(248,113,113,.35)}
      .opv2-row strong{display:block;color:#fff;font-size:13px}.opv2-row small{display:block;color:#94a3b8;margin-top:4px}
      .opv2-pill{display:inline-flex;border-radius:999px;padding:3px 8px;font-size:10px;font-weight:900;background:rgba(15,23,42,.8);border:1px solid rgba(148,163,184,.2)}
      .ok{color:#bbf7d0}.warn{color:#fde68a}.bad{color:#fecaca}.info{color:#bfdbfe}
      .opv2-detail{padding:14px;border-top:1px solid rgba(148,163,184,.12);display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
      .opv2-mini{border:1px solid rgba(148,163,184,.12);border-radius:13px;padding:10px}.opv2-mini span{display:block;font-size:10px;color:#94a3b8;text-transform:uppercase;font-weight:900}.opv2-mini strong{display:block;color:#fff;margin-top:4px;font-size:13px}
      .opv2-alert{padding:10px 16px;color:#fde68a;background:rgba(120,53,15,.16);border-top:1px solid rgba(251,191,36,.18);font-size:12px}.opv2-legend{display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:0 16px 12px;color:#94a3b8;font-size:12px}.opv2-legend i{display:inline-block;width:12px;height:12px;border-radius:50%;border:2px solid #fff;vertical-align:-2px;margin-right:5px}.opv2-legend .azul{background:#3b82f6}.opv2-legend .verde{background:#22c55e}.opv2-legend .vermelho{background:#ef4444}.opv2-legend .frota{background:#3b82f6;box-shadow:inset 0 0 0 3px #fff}
      .mk{position:relative;width:20px;height:20px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 2px rgba(0,0,0,.25)}.mk.os-ok{background:#22c55e}.mk.os-zero{background:#ef4444}.mk.colab{background:#3b82f6}.mk.frota{background:#3b82f6}.mk.frota:after{content:'';position:absolute;left:5px;top:5px;width:6px;height:6px;border-radius:50%;background:#fff}.mk.sel{box-shadow:0 0 0 4px rgba(250,204,21,.45)}
      .opv2-load{padding:28px;text-align:center;color:#94a3b8}
      @media(max-width:1100px){.opv2-grid{grid-template-columns:1fr}.opv2-map{height:520px}.opv2-filter{grid-template-columns:1fr}}
    `;
    document.head.appendChild(s);
  }

  async function leaflet() {
    if (window.L) return true;
    try {
      addCss('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', LEAFLET_CSS);
      await script('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', LEAFLET_JS);
      return !!window.L;
    } catch (err) {
      console.warn('[opv12] leaflet:', err?.message || err);
      return false;
    }
  }

  function addCss(h, id) {
    if (document.getElementById(id)) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = h;
    l.id = id;
    document.head.appendChild(l);
  }

  function script(src, id) {
    return new Promise((res, rej) => {
      if (document.getElementById(id)) return res();
      const s = document.createElement('script');
      s.src = src;
      s.id = id;
      s.onload = res;
      s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  function kpis() {
    const osSemSaldo = st.osTodas.filter(o => o.__saldo !== null && Number(o.__saldo) <= 0).length;
    return {
      os: st.os.length,
      pontos: st.pontos.length,
      rotas: st.rotas.length,
      veiculosLeitura: st.patrimonios.filter(isVeiculoPatrimonio).length,
      frotaOs: st.rotas.filter(r => r.colab.temFrota).length,
      repetidos: st.rotas.filter(r => r.repetido).length,
      semColaborador: st.semAssociacao.length,
      osSemSaldo,
    };
  }

  function rows() {
    const base = st.rotas.filter(r => passaFiltroPonto(r.ponto));
    const sem = st.semAssociacao.filter(r => passaFiltroPonto(r.ponto));
    return { base, sem };
  }

  function badge(r) {
    if (r.origem === 'associado') return '<span class="opv2-pill ok">associado</span>';
    if (r.repetido) return '<span class="opv2-pill warn">repetido 5 km</span>';
    return '<span class="opv2-pill info">sugerido</span>';
  }

  function html() {
    const k = kpis();
    const { base, sem } = rows();
    const estados = estadosDisponiveis();
    const pontosFiltrados = st.pontos.filter(p => !st.estado || String(p.uf).toUpperCase() === st.estado);
    const alertaSaldo = st.fallbackSaldo
      ? '<div class="opv2-alert">Não encontrei coluna de saldo remanescente válida. Exibindo OS abertas como fallback até configurar o campo correto.</div>'
      : '';
    const alertaSem = sem.length
      ? `<div class="opv2-alert">${sem.length} OS aberta(s) ainda sem colaborador disponível para associação.</div>`
      : '';

    return `
      <div class="opv2">
        <section class="opv2-card">
          <div class="opv2-head">
            <div>
              <h2>Mapa de direcionamento</h2>
              <p>Azul = colaborador, azul com círculo = motorista/frota, verde = OS com saldo, vermelho = OS sem saldo. Rota real pode ser ligada/desligada.</p>
            </div>
            <div class="opv2-actions">
              <button class="opv2-btn ${st.mostrarRota ? '' : 'off'}" data-toggle-rota>${st.mostrarRota ? 'Desligar rota' : 'Ligar rota'}</button>
              <button class="opv2-btn" data-reload>Atualizar</button>
            </div>
          </div>
          ${alertaSaldo}${alertaSem}
          <div class="opv2-filter">
            <select class="opv2-select" data-estado>
              <option value="">Todos os estados</option>
              ${estados.map(uf => `<option value="${esc(uf)}" ${st.estado === uf ? 'selected' : ''}>${esc(uf)}</option>`).join('')}
            </select>
            <select class="opv2-select" data-ponto>
              <option value="">Todos os pontos com OS aberta</option>
              ${pontosFiltrados.map(p => `<option value="${esc(p.__key)}" ${st.ponto === p.__key ? 'selected' : ''}>${esc(p.cidade)}/${esc(p.uf)} · ${esc(p.nome_local || p.tipo_local || 'Ponto')}</option>`).join('')}
            </select>
          </div>
          <div class="opv2-legend">
            <span><i class="azul"></i>Colaborador</span>
            <span><i class="frota"></i>Motorista/frota</span>
            <span><i class="verde"></i>OS saldo &gt; 0</span>
            <span><i class="vermelho"></i>OS saldo &lt;= 0</span>
          </div>
          <div class="opv2-grid">
            <div id="opv2Map" class="opv2-map"><div class="opv2-load">Carregando mapa...</div></div>
            <aside class="opv2-side">
              <div class="opv2-kpis">
                <div class="opv2-kpi"><span>${st.fallbackSaldo ? 'OS abertas' : 'OS com saldo'}</span><strong>${k.os}</strong></div>
                <div class="opv2-kpi"><span>OS sem saldo</span><strong>${k.osSemSaldo}</strong></div>
                <div class="opv2-kpi"><span>Associadas/sugeridas</span><strong>${k.rotas}</strong></div>
                <div class="opv2-kpi"><span>Veículos c/ leitura</span><strong>${k.veiculosLeitura}</strong></div>
                <div class="opv2-kpi"><span>Frota nas OS</span><strong>${k.frotaOs}</strong></div>
                <div class="opv2-kpi"><span>Repetidos 5 km</span><strong>${k.repetidos}</strong></div>
                <div class="opv2-kpi"><span>Pontos</span><strong>${k.pontos}</strong></div>
                <div class="opv2-kpi"><span>Sem colaborador</span><strong>${k.semColaborador}</strong></div>
              </div>
              <section class="opv2-card">
                <div class="opv2-list">
                  ${base.length ? base.map(r => `
                    <div class="opv2-row ${st.rota === r.id ? 'active' : ''}" data-rota="${esc(r.id)}">
                      <strong>${esc(short(r.colab.nome))} · ${esc(r.os.cliente || 'OS')}</strong>
                      <small>${esc(r.modo)} · ${kmFmt(r.dist)} base · OS ${esc(r.os.numero_os || r.os.os || r.os.id)} · saldo ${esc(r.os.__saldo)}</small>
                      ${badge(r)}
                    </div>
                  `).join('') : ''}
                  ${sem.map(r => `
                    <div class="opv2-row sem">
                      <strong>Sem colaborador · ${esc(r.os.cliente || 'OS')}</strong>
                      <small>OS ${esc(r.os.numero_os || r.os.os || r.os.id)} · ${esc(r.ponto.cidade)}/${esc(r.ponto.uf)} · saldo ${esc(r.os.__saldo)}</small>
                      <span class="opv2-pill bad">pendente</span>
                    </div>
                  `).join('')}
                  ${!base.length && !sem.length ? '<div class="opv2-load">Nenhuma OS encontrada para o filtro.</div>' : ''}
                </div>
              </section>
              <section class="opv2-card">${detail()}</section>
            </aside>
          </div>
        </section>
      </div>
    `;
  }

  function detail() {
    const r = st.rotas.find(x => x.id === st.rota) || rows().base[0];
    if (!r) return '<div class="opv2-load">Selecione uma rota.</div>';
    st.rota = r.id;
    return `
      <div class="opv2-detail">
        <div class="opv2-mini"><span>Colaborador</span><strong>${esc(r.colab.nome)}</strong></div>
        <div class="opv2-mini"><span>Ponto/OS</span><strong>${esc(r.ponto.nome_local || r.ponto.tipo_local)} · ${esc(r.ponto.cidade)}/${esc(r.ponto.uf)}</strong></div>
        <div class="opv2-mini"><span>Regra</span><strong>${esc(r.modo)}</strong></div>
        <div class="opv2-mini"><span>Distância base</span><strong>${kmFmt(r.dist)}</strong></div>
        <div class="opv2-mini"><span>Hospedagem &gt; 120 km</span><strong>${r.precisaHotel ? 'Verificar hospedagem próxima' : 'Não precisa'}</strong></div>
        <div class="opv2-mini"><span>Rota real</span><strong data-rota-real-info>${st.mostrarRota ? 'Calculando trajeto...' : 'Desligada'}</strong></div>
      </div>
    `;
  }

  function bind(root) {
    root.querySelector('[data-estado]')?.addEventListener('change', e => {
      st.estado = e.target.value;
      st.ponto = '';
      st.rota = '';
      render(root);
    });
    root.querySelector('[data-ponto]')?.addEventListener('change', e => {
      st.ponto = e.target.value;
      st.rota = '';
      render(root);
    });
    root.querySelector('[data-toggle-rota]')?.addEventListener('click', () => {
      st.mostrarRota = !st.mostrarRota;
      render(root);
    });
    root.querySelector('[data-reload]')?.addEventListener('click', () => openHome(root));
    root.querySelectorAll('[data-rota]').forEach(el => {
      el.onclick = () => {
        st.rota = el.dataset.rota;
        render(root);
      };
    });
  }

  async function map(root) {
    const el = root.querySelector('#opv2Map');
    if (!el) return;
    const ok = await leaflet();
    if (!ok) {
      el.innerHTML = '<div class="opv2-load">Não foi possível carregar o mapa.</div>';
      return;
    }

    if (st.map) {
      try { st.map.remove(); } catch {}
    }

    const L = window.L;
    st.map = L.map(el, { center: [-14.235, -51.925], zoom: 4 });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
      attribution: '&copy; OSM',
    }).addTo(st.map);

    st.layer = L.layerGroup().addTo(st.map);
    await draw(root);
    setTimeout(() => st.map?.invalidateSize(), 80);
  }

  function icon(t, selected = false) {
    return window.L.divIcon({ className: '', html: `<div class="mk ${t} ${selected ? 'sel' : ''}"></div>`, iconSize: [20, 20], iconAnchor: [10, 10] });
  }

  function osPorPonto(ponto) {
    return st.osTodas.filter(o => o.__pontoKey === ponto.__key);
  }

  async function draw(root) {
    if (!st.map || !window.L || !st.layer) return;
    const L = window.L;
    const b = [];
    st.layer.clearLayers();

    const { base } = rows();
    const r = st.rotas.find(x => x.id === st.rota) || base[0];
    const pontosVisiveis = st.pontos.filter(passaFiltroPonto);

    pontosVisiveis.forEach(p => {
      const oss = osPorPonto(p);
      const comSaldo = oss.some(o => temSaldoOperacional(o));
      const semSaldo = oss.length && oss.every(o => !temSaldoOperacional(o));
      const cls = semSaldo ? 'os-zero' : 'os-ok';
      const tooltip = `${semSaldo ? 'OS sem saldo' : 'OS com saldo'} · ${esc(p.nome_local || p.tipo_local || 'Ponto')} · ${esc(p.cidade)}/${esc(p.uf)} · ${oss.length} OS`;
      L.marker([lat(p), lng(p)], { icon: icon(cls, r?.ponto?.__key === p.__key) }).bindTooltip(tooltip).addTo(st.layer);
      b.push([lat(p), lng(p)]);
      if (!comSaldo && !semSaldo) return;
    });

    const usados = new Map();
    base.forEach(x => {
      if (!geo(x.colab)) return;
      if (!usados.has(x.colab.id)) usados.set(x.colab.id, x.colab);
    });

    usados.forEach(c => {
      L.marker([lat(c), lng(c)], { icon: icon(c.temFrota ? 'frota' : 'colab', r?.colab?.id === c.id) })
        .bindTooltip(`${c.temFrota ? 'Motorista/frota' : 'Colaborador'}: ${esc(c.nome)}`)
        .addTo(st.layer);
      b.push([lat(c), lng(c)]);
    });

    if (r && geo(r.colab) && geo(r.ponto) && st.mostrarRota) {
      const c = { lat: lat(r.colab), lng: lng(r.colab) };
      const p = { lat: lat(r.ponto), lng: lng(r.ponto) };
      const real = await rotaReal([c, p]);

      if (real?.coords?.length) {
        L.polyline(real.coords, { color: '#22c55e', weight: 4, opacity: .95 }).addTo(st.layer);
        real.coords.forEach(x => b.push(x));
      } else {
        L.polyline([[c.lat, c.lng], [p.lat, p.lng]], { color: '#f59e0b', weight: 4, opacity: .8, dashArray: '6 8' }).addTo(st.layer);
        b.push([c.lat, c.lng], [p.lat, p.lng]);
      }

      const info = root.querySelector('[data-rota-real-info]');
      if (info) info.textContent = real?.km ? `${kmFmt(real.km)} · ${Math.round(real.min || 0)} min` : 'Rota real indisponível no OSRM';
    }

    if (b.length) st.map.fitBounds(b, { padding: [34, 34], maxZoom: st.estado || st.ponto ? 9 : 10 });
  }

  function render(root) {
    root.innerHTML = html();
    bind(root);
    map(root);
  }

  function renderErro(root, err) {
    root.innerHTML = `
      <div class="opv2">
        <section class="opv2-card">
          <div class="opv2-load">
            Não foi possível carregar o mapa operacional.<br>
            <small>${esc(err?.message || err || 'Erro desconhecido')}</small>
          </div>
        </section>
      </div>
    `;
  }

  async function openHome(root) {
    css();
    root.innerHTML = '<div class="opv2"><section class="opv2-card"><div class="opv2-load">Carregando OS, colaboradores, frota e pontos de embarque...</div></section></div>';

    try {
      await load();
      st.rota = rows().base[0]?.id || '';
      render(root);
      console.info('[opv12] direcionamento carregado', {
        fallbackSaldo: st.fallbackSaldo,
        osOperacionais: st.os.length,
        osTodas: st.osTodas.length,
        pontos: st.pontos.length,
        associadas: st.rotas.length,
        semAssociacao: st.semAssociacao.length,
        repetidos5km: st.rotas.filter(r => r.repetido).length,
      });
    } catch (err) {
      console.error('[opv12] erro ao carregar direcionamento:', err);
      renderErro(root, err);
    }
  }

  window.OPERACIONAL = { openHome };
})();
