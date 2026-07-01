import { supabase } from './supabaseClient.js';

(function () {
  'use strict';

  const STYLE_ID = 'mapa-operacional-style';
  const LEAFLET_CSS = 'leaflet-css-mapaop';
  const LEAFLET_JS = 'leaflet-js-mapaop';
  const OSRM_BASE = 'https://router.project-osrm.org';
  const TILE_LAYERS = {
    escuro: {
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      options: { maxZoom: 19, subdomains: 'abcd', attribution: '&copy; OSM' },
    },
    real: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      options: { maxZoom: 19, attribution: 'Tiles &copy; Esri' },
    },
    padrao: {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      options: { maxZoom: 19, subdomains: 'abc', attribution: '&copy; OpenStreetMap contributors' },
    },
  };

  const BR_LAT_MIN = -34.2, BR_LAT_MAX = 6.0, BR_LNG_MIN = -74.5, BR_LNG_MAX = -28.0;
  // Raio pra permitir reusar um colaborador já usado em outra OS. Analisado em 2026-07-01:
  // ignorando esse raio inteiramente (reuso livre), 94% das 842 OS abertas têm alguém a menos de
  // 150km e a mediana é 3,4km — ou seja, quase nunca é escassez real de mão de obra. O raio de 5km
  // tratava esse backlog (que se espalha por semanas) como se fosse um único dia de rotas, fazendo
  // a primeira OS grande processada "gastar" o colaborador mais próximo pra sempre, mesmo que ele
  // pudesse perfeitamente atender uma segunda OS a 30-80km em outro dia — daí colaboradores sendo
  // sugeridos a 800+km quando havia gente muito mais perto, só que já "usada" numa OS vizinha maior.
  const RAIO_REPETIR_COLAB_KM = 100;
  const RAIO_HOTEL_KM = 60;
  const RAIO_CARONA_KM = 5;
  // Dentro dessa margem, candidatos são tratados como "praticamente igual em distância" e o
  // desempate passa a ser por carga de trabalho — sem isso, alargar RAIO_REPETIR_COLAB_KM faria
  // o colaborador mais central de uma região virar sugestão repetida pra dezenas de OS (um empate
  // exato de distância real quase nunca acontece, então o desempate por carga nunca entrava).
  const DIST_TOLERANCIA_EMPATE_KM = 20;
  const OS_SALDO_PEQUENO_KG = 500;
  // Leitura de patrimônio (Frotas > Veículos) mais velha que isso não confirma posse atual do
  // veículo — média real hoje é 4,4 dias, 65% das leituras são de até 7 dias.
  const LIMITE_DIAS_LEITURA_PATRIMONIO = 7;
  const ROTAS_REAIS_SIMULTANEAS = 4;
  const ROTAS_REAIS_LIMITE = 180;

  // Combustível: R$7/L, 10km/L, ida+volta. Mesma premissa usada em programacao-fase2-custos.js.
  const COMBUSTIVEL_PRECO_L = 7;
  const COMBUSTIVEL_KM_L = 10;
  // Uber/táxi: média real de preco_liquido/distancia_km de 270 corridas em conferencia_uber_corridas
  // (corrida média de 8,5km). Acima desse raio (p90 real de colaborador->OS mais próxima = ~60km) a
  // tarifa por km deixa de ser realista para Uber/táxi intermunicipal; nesse caso assume-se carro.
  const UBER_RS_KM = 6.77;
  const UBER_RAIO_MAX_KM = 60;
  // Acima disso, ida+volta no mesmo dia deixa de ser fisicamente executável (ex.: 795km = 1590km
  // no dia). Sem hospedagem real cadastrada por perto, a sugestão precisa ser sinalizada como
  // inviável em vez de aparecer como um "deslocar no dia" normal — mesmo raciocínio do antigo
  // HOTEL_KM_THRESHOLD de programacao-fase2-custos.js.
  const DIST_MAX_DESLOCAMENTO_DIARIO_KM = 150;
  // Diária informativa quando o registro real escolheu alojamento/hotel mas não há um match
  // real (coordenada/cidade) por perto — mesmo fallback usado em programacao-fase2-custos.js.
  const EST_ESTADIA_FALLBACK = { ALOJAMENTO: 60, HOTEL: 180 };
  // OS com saldo acima disso (400 toneladas) justificam hospedar o colaborador mesmo sem hotel
  // real cadastrado por perto — melhor que mandar alguém rodar centenas de km no mesmo dia.
  const OS_GRANDE_KG = 400000;

  const st = {
    os: [], osTodas: [], pontos: [], colaboradores: [], veiculos: [], rotas: [], semAssociacao: [],
    estado: '', ponto: '', rota: '', mostrarRota: true, tab: 'mapa', mapaBase: 'escuro',
    mostrarVeiculos: true, mostrarColaboradores: true, mostrarOS: true, mostrarHoteis: false,
    comparativo: [], supervisaoComparativo: '',
    map: null, tileLayer: null, layer: null, routeLayer: null, rotaRealCache: new Map(), drawToken: 0,
  };

  const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  const norm = v => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
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
  const fmtKm = v => Number.isFinite(Number(v)) ? `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km` : '—';
  const fmtKg = v => Number.isFinite(Number(v)) ? `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} kg` : '—';
  const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtRs = v => Number.isFinite(Number(v)) ? BRL.format(v) : '—';

  function inBrazil(a, b) {
    const la = Number(a), lo = Number(b);
    return Number.isFinite(la) && Number.isFinite(lo) && la >= BR_LAT_MIN && la <= BR_LAT_MAX && lo >= BR_LNG_MIN && lo <= BR_LNG_MAX;
  }
  function geo(r) { return inBrazil(lat(r), lng(r)); }
  function km(a, b, c, d) {
    if (!inBrazil(a, b) || !inBrazil(c, d)) return null;
    const la1 = Number(a), lo1 = Number(b), la2 = Number(c), lo2 = Number(d);
    const R = 6371, dlat = (la2 - la1) * Math.PI / 180, dlon = (lo2 - lo1) * Math.PI / 180;
    const x = Math.sin(dlat / 2) ** 2 + Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dlon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }
  function distColabPonto(c, p) { return km(lat(c), lng(c), lat(p), lng(p)) ?? Infinity; }

  function combustivelIdaVolta(distKmUmaVia) { return (Number(distKmUmaVia) || 0) * 2 / COMBUSTIVEL_KM_L * COMBUSTIVEL_PRECO_L; }
  function uberIdaVolta(distKmUmaVia) { return (Number(distKmUmaVia) || 0) * 2 * UBER_RS_KM; }
  // Fora do raio real de Uber/táxi, extrapolar a tarifa por km gera valores absurdos (ex.: 1000km
  // de distância vira ~R$13mil numa única rota). Além do raio, assume-se custo de carro (mais realista).
  function uberOuCarroIdaVolta(distKmUmaVia) {
    return (Number(distKmUmaVia) || 0) <= UBER_RAIO_MAX_KM ? uberIdaVolta(distKmUmaVia) : combustivelIdaVolta(distKmUmaVia);
  }

  function short(n) { const p = String(n || '').trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[1]}` : (p[0] || '—'); }
  function splitEmbarque(t) {
    const m = String(t || '').match(/^([A-Z]{2})\s*-\s*([^()]+?)(?:\s*\(([^)]+)\))?\s*$/i);
    return m ? { uf: m[1], cidade: m[2].trim(), local: (m[3] || '').trim() } : { uf: '', cidade: '', local: '' };
  }

  async function sel(table, columns = '*', fn = null, limit = 5000) {
    try {
      let q = supabase.from(table).select(columns).limit(limit);
      if (fn) q = fn(q);
      const { data, error } = await q;
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.warn(`[mapa-operacional] ${table}:`, e?.message || e);
      return [];
    }
  }

  function osAberta(o) {
    const s = norm(`${o.situacao || ''} ${o.status || ''} ${o.status_logistica || ''} ${o.status_gestor || ''}`);
    return !['FINALIZAD', 'FINALIZAR', 'DEVOLVID', 'CANCELAD', 'CONCLUID', 'ENCERRAD', 'ARQUIVAD', 'INATIV'].some(x => s.includes(x));
  }

  function colaboradorAtivo(c) { return norm(c.situacao) === 'ATIVO'; }

  function colKey(cpf, nome, extra) {
    const d = digits(cpf);
    if (d.length === 11) return `cpf:${d}`;
    // Sem CPF válido: soma cidade/UF-base para reduzir colisão entre homônimos.
    return `nome:${norm(nome)}|${norm(extra || '')}`;
  }

  // --- Carregamento ---------------------------------------------------

  function pontoDeOs(o) {
    const embarque = splitEmbarque(o.embarque || '');
    const temCoord = geo({ latitude: o.ponto1_latitude, longitude: o.ponto1_longitude });
    return {
      lat: temCoord ? Number(o.ponto1_latitude) : null,
      lng: temCoord ? Number(o.ponto1_longitude) : null,
      nome_local: o.ponto1_nome || embarque.local || o.cliente || 'Ponto',
      cidade: embarque.cidade,
      uf: norm(embarque.uf),
      temCoord,
    };
  }

  async function loadOsEPontos() {
    const osRaw = await sel('operacional_os', '*', q => q.order('created_at', { ascending: false }));
    const pontosPorChave = new Map();
    // Todas as OS por id (qualquer situação), usada pela aba Sugerido x Registrado — que precisa
    // de OS já atendidas, não só o backlog aberto com saldo.
    const osPorId = new Map();
    osRaw.forEach(o => { osPorId.set(String(o.id), { ...pontoDeOs(o), numero_os: o.numero_os, cliente: o.cliente }); });

    const abertas = osRaw.filter(osAberta).map(o => {
      const p = pontoDeOs(o);
      const chave = p.temCoord
        ? `${p.lat.toFixed(3)}|${p.lng.toFixed(3)}`
        : `sem-coord:${p.uf}|${norm(p.cidade)}|${norm(p.nome_local)}`;

      if (!pontosPorChave.has(chave)) pontosPorChave.set(chave, { __key: chave, ...p });
      return { ...o, __pontoKey: chave, __saldo: num(o.remanescente) || 0 };
    });

    return { abertas, pontos: [...pontosPorChave.values()], osPorId };
  }

  async function loadColaboradores() {
    const [baseRaw, colRaw] = await Promise.all([
      sel('operacional_colaborador_base', '*', q => q.eq('ativo', true)),
      sel('colaboradores', 'cpf,nome,situacao,cargo'),
    ]);

    const colPorCpf = new Map();
    colRaw.filter(colaboradorAtivo).forEach(c => { const d = digits(c.cpf); if (d.length === 11) colPorCpf.set(d, c); });

    return baseRaw
      .map(b => {
        const cpf = digits(b.cpf);
        const cad = colPorCpf.get(cpf);
        if (cpf.length === 11 && colRaw.length && !cad) return null; // desligado na base de colaboradores
        if (norm(cad?.cargo) === 'ADMINISTRATIVO') return null; // setor administrativo não embarca
        return { id: colKey(b.cpf, b.nome, `${b.cidade_base}|${b.uf_base}`), cpf, nome: b.nome || cad?.nome, latitude: b.latitude, longitude: b.longitude, cidade_base: b.cidade_base, uf_base: b.uf_base };
      })
      .filter(c => c && c.nome && geo(c));
  }

  async function loadVinculos() {
    const vincRaw = await sel('operacional_os_colaboradores', '*');
    const porOs = new Map();
    vincRaw.forEach(v => {
      const arr = porOs.get(String(v.os_id)) || [];
      arr.push({ cpf: v.colaborador_cpf, nome: v.colaborador_nome || v.colaborador_key });
      porOs.set(String(v.os_id), arr);
    });
    return porOs;
  }

  async function loadModoHabitual() {
    const rows = await sel('programacao_deslocamento', 'colaborador_id,nome_colaborador,tipo_deslocamento,data_referencia,updated_at');
    const porCpf = new Map(), porNome = new Map();
    for (const r of rows) {
      const quando = r.data_referencia || r.updated_at || '';
      const cpf = digits(r.colaborador_id);
      const entrada = { tipo: norm(r.tipo_deslocamento), quando };
      if (cpf.length === 11) {
        const atual = porCpf.get(cpf);
        if (!atual || String(quando) > String(atual.quando)) porCpf.set(cpf, entrada);
      }
      const nomeKey = norm(r.nome_colaborador);
      if (nomeKey) {
        const atual = porNome.get(nomeKey);
        if (!atual || String(quando) > String(atual.quando)) porNome.set(nomeKey, entrada);
      }
    }
    return { porCpf, porNome };
  }

  async function loadVeiculoProprio() {
    const rows = await sel('programacao_veiculo_proprio', 'colaborador_id,nome,ativo', q => q.eq('ativo', true));
    const cpfs = new Set(), nomes = new Set();
    rows.forEach(r => { const d = digits(r.colaborador_id); if (d.length === 11) cpfs.add(d); if (r.nome) nomes.add(norm(r.nome)); });
    return { cpfs, nomes };
  }

  function placaNorm(v) { return String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function posKey(pos) {
    const placa = placaNorm(pos?.placa);
    if (placa) return `placa:${placa}`;
    if (pos?.veiculo_id) return `id:${pos.veiculo_id}`;
    if (pos?.idgps) return `gps:${pos.idgps}`;
    return '';
  }
  function posKeys(pos) {
    const keys = [];
    const placa = placaNorm(pos?.placa);
    if (placa) keys.push(`placa:${placa}`);
    if (pos?.veiculo_id) keys.push(`id:${pos.veiculo_id}`);
    if (pos?.idgps) keys.push(`gps:${pos.idgps}`);
    return [...new Set(keys)];
  }
  function veiculoKeys(v) {
    const keys = [];
    [v?.id, v?.bfleet_vehicle_id, v?.bfleet_id].filter(Boolean).forEach(id => keys.push(`id:${id}`));
    [v?.bfleet_idgps].filter(Boolean).forEach(id => keys.push(`gps:${id}`));
    [v?.placa, v?.placa_normalizada, v?.bfleet_placa, v?.bfleet_patente].map(placaNorm).filter(Boolean).forEach(p => keys.push(`placa:${p}`));
    return [...new Set(keys)];
  }
  async function loadFrotaAtual() {
    const [veiculos, posicoes] = await Promise.all([
      sel('frotas_veiculos', 'id,placa,placa_normalizada,motorista_atual,patrimonio_funcionario,patrimonio_dias_sem_leitura,bfleet_vehicle_id,bfleet_id,bfleet_idgps,bfleet_placa,bfleet_patente,status'),
      sel('frotas_posicoes', 'placa,veiculo_id,idgps,latitude,longitude,velocidade_kmh,direcao,ignicao,endereco,motorista,sinal,reportado_em,atualizado_em'),
    ]);

    const veiculoPorChave = new Map();
    veiculos.forEach(v => veiculoKeys(v).forEach(k => { if (!veiculoPorChave.has(k)) veiculoPorChave.set(k, v); }));

    const posPorChave = new Map();
    posicoes.forEach(p => {
      if (!geo(p)) return;
      const keys = posKeys(p);
      if (!keys.length) {
        const k = posKey(p);
        if (k) keys.push(k);
      }
      keys.forEach(k => { if (!posPorChave.has(k)) posPorChave.set(k, p); });
    });

    const veiculosMapa = [];
    const usadosMapa = new Set();
    posicoes.filter(geo).forEach(p => {
      const match = posKeys(p).map(k => veiculoPorChave.get(k)).find(Boolean) || {};
      const placa = match.placa || match.placa_normalizada || match.bfleet_placa || match.bfleet_patente || p.placa || '';
      const id = match.id || p.veiculo_id || placaNorm(placa) || p.idgps || `${lat(p)},${lng(p)}`;
      const chave = String(id);
      if (usadosMapa.has(chave)) return;
      usadosMapa.add(chave);
      const velocidade = num(p.velocidade_kmh) ?? 0;
      veiculosMapa.push({
        id,
        placa,
        motorista: p.motorista || match.motorista_atual || match.patrimonio_funcionario || '',
        latitude: lat(p),
        longitude: lng(p),
        velocidade,
        direcao: num(p.direcao),
        ignicao: p.ignicao,
        endereco: p.endereco || '',
        sinal: p.sinal || '',
        reportado_em: p.reportado_em || p.atualizado_em || '',
        status: velocidade > 3 ? 'em_movimento' : 'parado',
      });
    });

    const nomesFrotaSet = new Set();
    const posicaoPorNome = new Map();
    const nomeOriginalPorNome = new Map();
    const guardarNome = (nome) => { const key = norm(nome); nomesFrotaSet.add(key); if (!nomeOriginalPorNome.has(key)) nomeOriginalPorNome.set(key, String(nome).trim()); return key; };

    // "Motorista" só conta quem está de fato com o veículo — mesmo critério já usado em
    // Frotas > Veículos: leitura de patrimônio recente (patrimonio_funcionario/_dias_sem_leitura),
    // não o cadastro nominal de "motorista_atual" (que pode estar desatualizado).
    veiculos.forEach(v => {
      const nome = v?.patrimonio_funcionario;
      const dias = num(v?.patrimonio_dias_sem_leitura);
      if (!nome || !String(nome).trim() || dias === null || dias > LIMITE_DIAS_LEITURA_PATRIMONIO) return;
      const key = guardarNome(nome);
      const pos = veiculoKeys(v).map(k => posPorChave.get(k)).find(Boolean);
      if (pos && !posicaoPorNome.has(key)) posicaoPorNome.set(key, pos);
    });
    // Posição de GPS ao vivo só refina a distância de quem já foi confirmado por leitura de
    // patrimônio — não adiciona ninguém novo ao conjunto de motoristas.
    posicoes.forEach(p => { const key = norm(p.motorista); if (p.motorista && nomesFrotaSet.has(key) && !posicaoPorNome.has(key)) posicaoPorNome.set(key, p); });

    return { nomesFrotaSet, posicaoPorNome, nomeOriginalPorNome, veiculos: veiculosMapa };
  }

  async function loadHospedagem() {
    const [hoteis, alojamentos] = await Promise.all([
      sel('hospedagem_hoteis', 'nome,cidade,uf,latitude,longitude,valor_diaria_individual,valor_diaria_padrao'),
      sel('hospedagem_alojamentos', 'nome,cidade,uf,status', q => q.eq('status', 'ATIVO')),
    ]);
    const hoteisComCoord = hoteis.filter(geo);
    // Poucos registros (dezenas) — mantidos em lista simples, não em Map por chave exata: nomes
    // de cidade em hospedagem_alojamentos às vezes vêm truncados/abreviados (ex.: "Campo Novo"
    // em vez de "Campo Novo do Parecis"), então o casamento com o ponto da OS precisa ser por
    // substring, não igualdade exata.
    const alojamentosPorUf = alojamentos.map(a => ({ ...a, cidadeNorm: norm(a.cidade), ufNorm: norm(a.uf) }));
    return { hoteisComCoord, alojamentosPorUf };
  }

  // --- Motor de custo-benefício ----------------------------------------

  function alojamentoParaPonto(ponto) {
    const ufN = norm(ponto.uf), cidadeN = norm(ponto.cidade);
    if (!ufN || !cidadeN) return null;
    return st.alojamentosPorUf.find(a => a.ufNorm === ufN && (cidadeN.includes(a.cidadeNorm) || a.cidadeNorm.includes(cidadeN))) || null;
  }

  function hospedagemParaPonto(ponto) {
    const alojamento = alojamentoParaPonto(ponto);
    if (alojamento) return { tipo: 'alojamento', nome: alojamento.nome, custoDia: 0 };

    if (!ponto.temCoord) return null;
    // Prioriza hotel com diária real cadastrada; na falta, usa o hotel real mais próximo sem
    // diária (temos a localização, só não o preço) com estimativa — melhor que ignorar um hotel
    // que existe de verdade e cair direto no fallback genérico de "sem hotel cadastrado".
    let melhorComPreco = null;
    let melhorSemPreco = null;
    for (const h of st.hoteisComCoord) {
      const d = km(ponto.lat, ponto.lng, lat(h), lng(h));
      if (d === null || d > RAIO_HOTEL_KM) continue;
      const diaria = num(h.valor_diaria_individual) ?? num(h.valor_diaria_padrao);
      if (diaria !== null) {
        if (!melhorComPreco || diaria < melhorComPreco.custoDia) melhorComPreco = { tipo: 'hotel', nome: h.nome, custoDia: diaria, distKm: d };
      } else if (!melhorSemPreco || d < melhorSemPreco.distKm) {
        melhorSemPreco = { tipo: 'hotel', nome: h.nome, custoDia: EST_ESTADIA_FALLBACK.HOTEL, distKm: d, estimado: true };
      }
    }
    return melhorComPreco || melhorSemPreco;
  }

  // Distância aproximada de um ponto até um segmento (trajeto reto entre dois pontos), por
  // amostragem — suficiente pra um raio de tolerância, sem precisar de rota real via OSRM.
  function distPontoTrajeto(ponto, trajeto, amostras = 12) {
    let min = Infinity;
    for (let i = 0; i <= amostras; i++) {
      const t = i / amostras;
      const la = trajeto.aLat + (trajeto.bLat - trajeto.aLat) * t;
      const lo = trajeto.aLng + (trajeto.bLng - trajeto.aLng) * t;
      const d = km(ponto.lat, ponto.lng, la, lo);
      if (d !== null && d < min) min = d;
    }
    return min;
  }

  // Carona só conta como custo zero se o ponto estiver a até 5km do trajeto de algum motorista
  // de frota até o embarque mais próximo dele — senão vira "carona fantasma" sem motorista real por perto.
  function caronaDisponivelPara(ponto) {
    if (!ponto.temCoord || !st.frotaTrajetos?.length) return false;
    return st.frotaTrajetos.some(t => distPontoTrajeto(ponto, t) <= RAIO_CARONA_KM);
  }

  function modoColaborador(c, ponto) {
    // "Motorista de frota" (custo zero) exige leitura de patrimônio recente confirmando que a
    // pessoa está de fato com o veículo agora (mesmo critério já usado em Frotas > Veículos,
    // via patrimonio_funcionario + patrimonio_dias_sem_leitura) — não o cadastro nominal de
    // motorista_atual, que pode estar desatualizado e não refletir quem realmente está com o carro.
    if (st.nomesFrotaSet.has(norm(c.nome))) return { modo: 'frota', label: 'Motorista/frota (leitura de patrimônio recente)', custo: 0 };

    const habitual = st.modoHabitualPorCpf.get(c.cpf) || st.modoHabitualPorNome.get(norm(c.nome));
    if (habitual?.tipo === 'MOTORISTA FROTA') return { modo: 'reembolso', label: 'Motorista de frota (sem leitura recente — veículo da empresa)', custoFn: combustivelIdaVolta };
    if (habitual?.tipo === 'CARONA FROTA' && caronaDisponivelPara(ponto)) return { modo: 'carona', label: 'Carona com frota', custo: 0 };
    if (habitual?.tipo === 'NAO PRECISA') return { modo: 'local', label: 'Já está no local', custo: 0 };
    if (habitual?.tipo === 'REEMBOLSO KM') return { modo: 'reembolso', label: 'Veículo próprio', custoFn: combustivelIdaVolta };
    if (habitual?.tipo === 'UBER TAXI' || habitual?.tipo === 'UBER/TAXI') return { modo: 'uber', label: 'Uber/táxi', custoFn: uberOuCarroIdaVolta };

    if (st.veiculoProprioCpfs.has(c.cpf) || st.veiculoProprioNomes.has(norm(c.nome))) {
      return { modo: 'reembolso', label: 'Veículo próprio (estimado)', custoFn: combustivelIdaVolta, estimado: true };
    }
    return { modo: 'a-definir', label: 'A definir (estimado)', custoFn: uberOuCarroIdaVolta, estimado: true };
  }

  function avaliarCandidato(c, ponto, dist, osSaldoKg = 0) {
    const posicaoFrota = st.posicaoPorNome.get(norm(c.nome));
    const candidato = posicaoFrota && geo(posicaoFrota) ? { ...c, latitude: lat(posicaoFrota), longitude: lng(posicaoFrota) } : c;
    const distReal = posicaoFrota && geo(posicaoFrota) ? distColabPonto(candidato, ponto) : dist;

    const modoInfo = modoColaborador(c, ponto);
    const custoDeslocamento = modoInfo.custo ?? modoInfo.custoFn(distReal);
    let hospedagem = ponto.temCoord || alojamentoParaPonto(ponto) ? hospedagemParaPonto(ponto) : null;

    // OS grande (>400t) sem hotel/alojamento real cadastrado por perto: melhor hospedar por
    // estimativa do que mandar o colaborador rodar centenas de km ida+volta no mesmo dia.
    if (!hospedagem && osSaldoKg > OS_GRANDE_KG && ponto.temCoord) {
      hospedagem = { tipo: 'estimado', nome: 'Hospedagem a definir (sem hotel cadastrado por perto)', custoDia: EST_ESTADIA_FALLBACK.HOTEL, estimado: true };
    }

    const hospedar = hospedagem && hospedagem.custoDia < custoDeslocamento;
    const custoDia = hospedar ? hospedagem.custoDia : custoDeslocamento;
    const economia = hospedar ? (custoDeslocamento - hospedagem.custoDia) : 0;

    // Sem custo zero (frota/carona/local) nem hospedagem real, e distância além do que dá pra
    // fazer ida+volta no mesmo dia: não é uma recomendação executável, é o "menos pior" disponível
    // porque a mão de obra próxima já foi consumida por outras OS. Precisa ficar visível como tal.
    const inviavel = !hospedar && custoDeslocamento > 0 && distReal > DIST_MAX_DESLOCAMENTO_DIARIO_KM;

    return {
      candidato, distReal, modoInfo, custoDeslocamento, hospedagem,
      recomendacao: hospedar ? 'hospedar' : 'deslocar', custoDia, economia, inviavel,
    };
  }

  function mesmoLocalOuRaio(p1, p2) {
    if (!p1 || !p2) return false;
    if (p1.__key === p2.__key) return true;
    if (!p1.temCoord || !p2.temCoord) return false;
    const d = km(p1.lat, p1.lng, p2.lat, p2.lng);
    return d !== null && d <= RAIO_REPETIR_COLAB_KM;
  }

  function podeUsarColaborador(c, ponto, usos, osSaldoKg) {
    const usados = usos.get(c.id) || [];
    if (!usados.length) return true;
    // OS pequena (saldo <= 500kg): não justifica dedicar um colaborador exclusivo, quem já
    // está em campo hoje pode assumir também, mesmo fora do raio de reuso (RAIO_REPETIR_COLAB_KM).
    if (Number(osSaldoKg) <= OS_SALDO_PEQUENO_KG) return true;
    return usados.some(u => mesmoLocalOuRaio(u.ponto, ponto));
  }
  function registrarUso(c, ponto, saldo, usos) {
    const arr = usos.get(c.id) || [];
    arr.push({ ponto, saldo: Number(saldo) || 0 });
    usos.set(c.id, arr);
  }
  function saldoAcumulado(c, usos) { return (usos.get(c.id) || []).reduce((acc, u) => acc + u.saldo, 0); }

  function escolherColaborador(os, ponto, usos) {
    const vinculados = (st.vinculosPorOs.get(String(os.id)) || [])
      .map(v => st.colaboradores.find(c => (digits(v.cpf).length === 11 && c.cpf === digits(v.cpf)) || norm(c.nome) === norm(v.nome)))
      .filter(Boolean);

    function ranquear(lista) {
      // Todo item de st.colaboradores (cadastrados ou sintéticos de frota) já tem geo válida garantida na origem.
      return lista
        .filter(c => podeUsarColaborador(c, ponto, usos, os.__saldo))
        .map(c => {
          const dist = distColabPonto(c, ponto);
          const avaliacao = avaliarCandidato(c, ponto, dist, os.__saldo);
          return { c, dist: avaliacao.distReal, avaliacao, saldoAtual: saldoAcumulado(c, usos) };
        })
        .filter(x => Number.isFinite(x.dist))
        // Sempre o colaborador mais próximo primeiro — nunca mandamos alguém a milhares de km só
        // porque o modo de transporte "parece" mais barato no papel. Mas dentro de ~20km de
        // diferença, distância deixa de ser decisiva e quem tem menos carga acumulada no dia
        // ganha prioridade — senão o colaborador mais central de uma região vira sugestão
        // repetida pra dezenas de OS, já que um empate exato de distância real é raríssimo.
        .sort((a, b) => {
          if (Math.abs(a.dist - b.dist) > DIST_TOLERANCIA_EMPATE_KM) return a.dist - b.dist;
          return a.saldoAtual - b.saldoAtual || a.avaliacao.custoDia - b.avaliacao.custoDia || a.dist - b.dist;
        });
    }

    const candidatosVinculados = ranquear(vinculados);
    if (candidatosVinculados.length) return { ...candidatosVinculados[0], origem: 'associado' };

    const candidatosTodos = ranquear(st.colaboradores);
    return candidatosTodos.length ? { ...candidatosTodos[0], origem: 'sugerido' } : null;
  }

  async function load() {
    const [{ abertas, pontos, osPorId }, colaboradores, vinculosPorOs, modoHabitual, veiculoProprio, frotaAtual, hospedagem] = await Promise.all([
      loadOsEPontos(), loadColaboradores(), loadVinculos(), loadModoHabitual(), loadVeiculoProprio(), loadFrotaAtual(), loadHospedagem(),
    ]);
    st.osPorId = osPorId;

    st.vinculosPorOs = vinculosPorOs;
    st.modoHabitualPorCpf = modoHabitual.porCpf;
    st.modoHabitualPorNome = modoHabitual.porNome;
    st.veiculoProprioCpfs = veiculoProprio.cpfs;
    st.veiculoProprioNomes = veiculoProprio.nomes;
    st.nomesFrotaSet = frotaAtual.nomesFrotaSet;
    st.posicaoPorNome = frotaAtual.posicaoPorNome;
    st.veiculos = frotaAtual.veiculos || [];
    st.hoteisComCoord = hospedagem.hoteisComCoord;
    st.alojamentosPorUf = hospedagem.alojamentosPorUf;

    // Motoristas de frota com posição atual mas sem cadastro em operacional_colaborador_base
    // (ex.: admissão recente) não podem ficar de fora — senão nunca seriam sugeridos,
    // mesmo custando zero e estando fisicamente perto do ponto.
    const nomesJaCadastrados = new Set(colaboradores.map(c => norm(c.nome)));
    const sinteticos = [];
    for (const [key, pos] of frotaAtual.posicaoPorNome.entries()) {
      if (nomesJaCadastrados.has(key) || !geo(pos)) continue;
      const nome = frotaAtual.nomeOriginalPorNome.get(key) || key;
      sinteticos.push({ id: colKey('', nome, 'frota-sem-cadastro'), cpf: '', nome, latitude: lat(pos), longitude: lng(pos) });
      nomesJaCadastrados.add(key);
    }

    st.pontos = pontos;
    st.colaboradores = [...colaboradores, ...sinteticos];
    st.osTodas = abertas;
    st.os = abertas.filter(o => o.__saldo > 0);
    st.frotaTrajetos = calcularTrajetosFrota();
    build();
    st.comparativo = await loadComparativo();
  }

  // Aproxima o "trajeto do motorista até seu ponto de embarque" pelo segmento entre a posição
  // atual/base do motorista de frota e o ponto de OS mais próximo dele — não temos a rota real
  // de cada motorista, então usamos essa reta como raio de referência pra validar carona.
  function calcularTrajetosFrota() {
    const trajetos = [];
    for (const c of st.colaboradores) {
      if (!st.nomesFrotaSet.has(norm(c.nome))) continue;
      const posAtual = st.posicaoPorNome.get(norm(c.nome));
      const aLat = posAtual && geo(posAtual) ? lat(posAtual) : lat(c);
      const aLng = posAtual && geo(posAtual) ? lng(posAtual) : lng(c);
      if (!Number.isFinite(aLat) || !Number.isFinite(aLng)) continue;

      let destino = null, menor = Infinity;
      for (const p of st.pontos) {
        if (!p.temCoord) continue;
        const d = km(aLat, aLng, p.lat, p.lng);
        if (d !== null && d < menor) { menor = d; destino = p; }
      }
      if (destino) trajetos.push({ aLat, aLng, bLat: destino.lat, bLng: destino.lng });
    }
    return trajetos;
  }

  // --- Comparativo: sugerido (motor) x registrado (Programação) ---------

  function categoriaDeslocamentoRegistrado(tipo) {
    const t = norm(tipo);
    if (t === 'MOTORISTA FROTA') return 'frota';
    if (t === 'CARONA FROTA') return 'carona';
    if (t === 'REEMBOLSO KM') return 'reembolso';
    if (t === 'UBER TAXI' || t === 'UBER/TAXI') return 'uber';
    if (t === 'NAO PRECISA') return 'local';
    return 'outro';
  }

  function custoDeslocamentoRegistrado(tipo, distKmUmaVia) {
    const t = norm(tipo);
    if (t === 'MOTORISTA FROTA' || t === 'CARONA FROTA' || t === 'NAO PRECISA') return 0;
    if (t === 'REEMBOLSO KM') return combustivelIdaVolta(distKmUmaVia);
    if (t === 'UBER TAXI' || t === 'UBER/TAXI') return uberOuCarroIdaVolta(distKmUmaVia);
    return null; // ÔNIBUS/OUTRO: sem fórmula confiável pra estimar
  }

  function custoEstadiaRegistrada(tipoEstadia, ponto) {
    const t = norm(tipoEstadia);
    if (!t || t === 'CASA' || t === 'PERNOITE') return 0;
    if (t === 'ALOJAMENTO' || t === 'HOTEL') {
      const h = hospedagemParaPonto(ponto);
      return h ? h.custoDia : (EST_ESTADIA_FALLBACK[t] ?? 0);
    }
    return 0;
  }

  async function loadComparativo() {
    const equipe = await sel('programacao_equipe', 'id,programacao_id,os_id,colaborador_id,nome_colaborador', q => q.eq('confirmado', true));
    if (!equipe.length) return [];

    const [programacoesRows, deslocRows, estadiaRows] = await Promise.all([
      sel('programacoes', 'id,data_referencia,supervisao'),
      sel('programacao_deslocamento', 'programacao_id,colaborador_id,tipo_deslocamento'),
      sel('programacao_estadia', 'programacao_id,colaborador_id,tipo_estadia'),
    ]);

    const programacaoPorId = new Map(programacoesRows.map(p => [String(p.id), p]));
    const deslocPorChave = new Map(deslocRows.map(d => [`${d.programacao_id}|${digits(d.colaborador_id)}`, d]));
    const estadiaPorChave = new Map(estadiaRows.map(e => [`${e.programacao_id}|${digits(e.colaborador_id)}`, e]));
    const colabPorCpf = new Map(st.colaboradores.filter(c => c.cpf).map(c => [c.cpf, c]));

    const linhas = [];
    for (const e of equipe) {
      const ponto = st.osPorId.get(String(e.os_id));
      if (!ponto || !ponto.temCoord) continue;
      const cpf = digits(e.colaborador_id);
      const colab = colabPorCpf.get(cpf);
      if (!colab || !geo(colab)) continue;

      const dist = distColabPonto(colab, ponto);
      if (!Number.isFinite(dist)) continue;

      const avaliacao = avaliarCandidato(colab, ponto, dist);
      const categoriaSugerida = avaliacao.recomendacao === 'hospedar' ? 'hospedagem' : avaliacao.modoInfo.modo;

      const chave = `${e.programacao_id}|${cpf}`;
      const desloc = deslocPorChave.get(chave);
      const estadia = estadiaPorChave.get(chave);
      const custoDeslocReg = desloc ? custoDeslocamentoRegistrado(desloc.tipo_deslocamento, dist) : null;
      const custoEstadiaReg = estadia ? custoEstadiaRegistrada(estadia.tipo_estadia, ponto) : null;

      // tipo_deslocamento e tipo_estadia são fatos independentes na Programação (a pessoa pode
      // ter ido de frota E ainda assim ter ficado hospedada) — não são estratégias alternativas
      // como no motor de sugestão. Hospedagem real (ALOJAMENTO/HOTEL) é o fato dominante quando
      // presente; comparar por "menor custo" erraria sempre pro lado do modo mais barato (ex.:
      // "não precisa"/pernoite = R$0) mesmo quando a pessoa de fato ficou num hotel.
      let categoriaRegistrada = 'sem-registro', custoRegistrado = null, modoRegistradoLabel = 'Sem registro';
      const estadiaReal = estadia && ['ALOJAMENTO', 'HOTEL'].includes(norm(estadia.tipo_estadia));
      if (estadiaReal) {
        categoriaRegistrada = 'hospedagem';
        custoRegistrado = custoEstadiaReg;
        modoRegistradoLabel = `Hospedagem (${estadia.tipo_estadia})`;
      } else if (custoDeslocReg !== null) {
        categoriaRegistrada = categoriaDeslocamentoRegistrado(desloc.tipo_deslocamento);
        custoRegistrado = custoDeslocReg;
        modoRegistradoLabel = desloc.tipo_deslocamento || 'Deslocamento';
      } else if (custoEstadiaReg !== null) {
        categoriaRegistrada = 'local';
        custoRegistrado = custoEstadiaReg;
        modoRegistradoLabel = estadia.tipo_estadia || 'Casa';
      }

      const prog = programacaoPorId.get(String(e.programacao_id));

      linhas.push({
        nome: colab.nome, os: ponto,
        supervisao: prog?.supervisao || 'Sem programação', data: prog?.data_referencia || null,
        modoSugerido: categoriaSugerida === 'hospedagem' ? `Hospedagem (${avaliacao.hospedagem?.nome || '—'})` : avaliacao.modoInfo.label,
        custoSugerido: avaliacao.custoDia,
        modoRegistrado: modoRegistradoLabel, custoRegistrado,
        concorda: categoriaRegistrada !== 'sem-registro' && categoriaRegistrada === categoriaSugerida,
        temRegistro: categoriaRegistrada !== 'sem-registro',
        diferenca: custoRegistrado !== null ? custoRegistrado - avaliacao.custoDia : null,
      });
    }

    return linhas.sort((a, b) => (b.diferenca ?? -Infinity) - (a.diferenca ?? -Infinity));
  }

  function build() {
    const pontosPorChave = new Map(st.pontos.map(p => [p.__key, p]));
    const usos = new Map();
    st.semAssociacao = [];
    st.rotas = [];

    const ordenadas = [...st.os].sort((a, b) => b.__saldo - a.__saldo);
    for (const os of ordenadas) {
      const ponto = pontosPorChave.get(os.__pontoKey);
      if (!ponto) continue;
      const escolhido = ponto.temCoord ? escolherColaborador(os, ponto, usos) : null;
      if (!escolhido) {
        const motivo = ponto.temCoord
          ? `Sem colaborador com coordenada disponível respeitando repetição por local/${RAIO_REPETIR_COLAB_KM} km`
          : 'Ponto de embarque sem coordenada cadastrada (endereço não geocodificado) — associe manualmente';
        st.semAssociacao.push({ os, ponto, motivo });
        continue;
      }
      const { c, dist, avaliacao, saldoAtual, origem } = escolhido;
      registrarUso(c, ponto, os.__saldo, usos);
      const repetido = (usos.get(c.id) || []).length > 1;

      st.rotas.push({
        id: `${os.id}|${c.id}`, os, ponto, colab: avaliacao.candidato, dist,
        origem, repetido,
        modo: avaliacao.modoInfo.modo, modoLabel: avaliacao.modoInfo.label, modoEstimado: !!avaliacao.modoInfo.estimado,
        custoDeslocamento: avaliacao.custoDeslocamento, hospedagem: avaliacao.hospedagem,
        recomendacao: avaliacao.recomendacao, custoDia: avaliacao.custoDia, economia: avaliacao.economia,
        inviavel: avaliacao.inviavel,
        saldoAntes: saldoAtual, saldoDepois: saldoAtual + os.__saldo,
      });
    }
    st.rotas.sort((a, b) => b.custoDia - a.custoDia || b.dist - a.dist);
    st.pontos = st.pontos.filter(p => st.osTodas.some(o => o.__pontoKey === p.__key));
  }

  // --- Renderização ------------------------------------------------------

  function estadosDisponiveis() { return [...new Set(st.osTodas.map(o => pontoKeyToUf(o.__pontoKey)).filter(Boolean))].sort(); }
  function pontoKeyToUf(key) { return st.pontos.find(p => p.__key === key)?.uf || ''; }
  function passaFiltroPonto(p) { if (!p) return false; if (st.estado && p.uf !== st.estado) return false; if (st.ponto && p.__key !== st.ponto) return false; return true; }

  async function rotaReal(points) {
    const key = points.map(p => `${Number(p.lng).toFixed(5)},${Number(p.lat).toFixed(5)}`).join(';');
    if (st.rotaRealCache.has(key)) return st.rotaRealCache.get(key);
    if (st.rotaRealCache.size > 2000) st.rotaRealCache.clear(); // evita crescimento sem limite em sessões longas
    try {
      const res = await fetch(`${OSRM_BASE}/route/v1/driving/${key}?overview=full&geometries=geojson`);
      if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
      const data = await res.json();
      const route = data?.routes?.[0];
      if (!route?.geometry?.coordinates) throw new Error('Sem rota real para os pontos');
      const out = { coords: route.geometry.coordinates.map(([lg, la]) => [la, lg]) };
      st.rotaRealCache.set(key, out);
      return out;
    } catch (err) {
      const fallback = { coords: null };
      st.rotaRealCache.set(key, fallback);
      return fallback;
    }
  }

  function css() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      .mo{color:#e2e8f0;display:flex;flex-direction:column;gap:12px}.mo-card{border:1px solid rgba(148,163,184,.16);border-radius:18px;background:linear-gradient(180deg,rgba(15,23,42,.96),rgba(2,6,23,.9));overflow:visible;position:relative;isolation:isolate}.mo-head{padding:14px 16px 10px;display:flex;justify-content:space-between;gap:12px;position:relative;z-index:30}.mo h2,.mo h3{margin:0;color:#fff}.mo h2{font-size:24px;line-height:1}.mo p{color:#94a3b8;margin:5px 0 0;font-size:12px}.mo-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.mo-btn{border:1px solid rgba(34,197,94,.35);border-radius:12px;background:#166534;color:#ecfdf5;font-weight:900;padding:8px 12px;cursor:pointer}.mo-btn.off{background:#334155;border-color:rgba(148,163,184,.35)}.mo-select{height:38px;border:1px solid rgba(148,163,184,.2);border-radius:12px;background:#0d0d18;color:#e2e8f0;padding:0 12px;width:100%}.mo-map-select{width:180px}.mo-map-tools{position:relative;z-index:2500;padding:0 16px 10px;display:grid;grid-template-columns:minmax(360px,1fr) auto;gap:10px;align-items:center}.mo-filter{display:grid;grid-template-columns:180px 1fr;gap:8px}.mo-body{display:flex;flex-direction:column;gap:12px;padding:0 16px 16px}.mo-map{height:calc(100vh - 300px);min-height:500px;max-height:760px;border:1px solid rgba(148,163,184,.14);border-radius:18px;background:#0d1117;z-index:1}.mo-below{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:14px}.mo-kpis{display:flex;gap:8px;overflow-x:auto;padding-bottom:2px}.mo-kpi{flex:1 0 126px;min-width:0;border:1px solid rgba(34,197,94,.18);border-radius:12px;padding:8px;background:rgba(2,6,23,.35)}.mo-kpi span{display:block;font-size:8.5px;color:#94a3b8;font-weight:900;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mo-kpi strong{display:block;color:#fff;font-size:16px;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mo-list{max-height:420px;overflow:auto;padding:10px}.mo-row{border:1px solid rgba(148,163,184,.14);border-radius:15px;background:rgba(15,23,42,.62);padding:10px;margin-bottom:8px;cursor:pointer}.mo-row.active,.mo-row:hover{border-color:#22c55e;background:rgba(22,101,52,.13)}.mo-row.sem{border-color:rgba(248,113,113,.35)}.mo-row strong{display:block;color:#fff;font-size:13px}.mo-row small{display:block;color:#94a3b8;margin-top:4px}.mo-pill{display:inline-flex;border-radius:999px;padding:3px 8px;font-size:10px;font-weight:900;background:rgba(15,23,42,.8);border:1px solid rgba(148,163,184,.2);margin-right:4px}.ok{color:#bbf7d0}.warn{color:#fde68a}.bad{color:#fecaca}.info{color:#bfdbfe}.mo-detail{padding:14px;border-top:1px solid rgba(148,163,184,.12);display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.mo-mini{border:1px solid rgba(148,163,184,.12);border-radius:13px;padding:10px}.mo-mini span{display:block;font-size:10px;color:#94a3b8;text-transform:uppercase;font-weight:900}.mo-mini strong{display:block;color:#fff;margin-top:4px;font-size:13px}.mo-alerts{border-top:1px solid rgba(251,191,36,.18);border-bottom:1px solid rgba(251,191,36,.12);background:rgba(120,53,15,.12)}.mo-alert{padding:7px 16px;color:#fde68a;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mo-alert+.mo-alert{border-top:1px solid rgba(251,191,36,.12)}.mo-legend{display:flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap;color:#94a3b8;font-size:12px}.mo-legend i{display:inline-block;width:12px;height:12px;border-radius:50%;border:2px solid #fff;vertical-align:-2px;margin-right:5px}.mo-legend .azul{background:#3b82f6}.mo-legend .verde{background:#22c55e}.mo-legend .vermelho{background:#ef4444}.mo-legend .veiculo{background:#06b6d4}.mo-legend .roxo{background:#a855f7}.mo-legend .frota{background:#3b82f6;box-shadow:inset 0 0 0 3px #fff}.mo-marker-toggle{border:1px solid rgba(34,197,94,.28);background:rgba(6,78,59,.45);color:#ecfdf5;border-radius:999px;padding:6px 10px;font-size:11px;font-weight:900;cursor:pointer}.mo-marker-toggle.off{background:rgba(15,23,42,.72);border-color:rgba(148,163,184,.22);color:#94a3b8}.mk{position:relative;width:13px;height:13px;border-radius:50%;border:1.5px solid #fff;box-shadow:0 0 0 1.5px rgba(0,0,0,.25)}.mk.os-ok{background:#22c55e}.mk.os-zero{background:#ef4444}.mk.colab{background:#3b82f6}.mk.frota{background:#3b82f6}.mk.frota:after{content:'';position:absolute;left:4px;top:4px;width:4px;height:4px;border-radius:50%;background:#fff}.mk.veic-mov{background:#06b6d4}.mk.veic-park{background:#f59e0b}.mk.veic-mov:after,.mk.veic-park:after{content:'';position:absolute;left:3px;top:3px;width:5px;height:5px;border-radius:50%;background:#0f172a}.mk.hotel{background:#a855f7}.mk.sel{box-shadow:0 0 0 3px rgba(250,204,21,.45)}.mo-load{padding:28px;text-align:center;color:#94a3b8}.mo-map .leaflet-pane,.mo-map .leaflet-top,.mo-map .leaflet-bottom{z-index:1!important}.mo-map .leaflet-control{z-index:10!important}.mo-colabs-card{border:1px solid rgba(148,163,184,.16);border-radius:18px;background:linear-gradient(180deg,rgba(15,23,42,.96),rgba(2,6,23,.9));overflow:hidden;margin:0 16px 16px}.mo-colabs-head{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px 14px;border-bottom:1px solid rgba(148,163,184,.12)}.mo-colabs-head strong{color:#fff;font-size:14px}.mo-colabs-head span{color:#94a3b8;font-size:12px}.mo-colabs-table{width:100%;border-collapse:collapse;font-size:12px}.mo-colabs-table th,.mo-colabs-table td{padding:8px 10px;border-bottom:1px solid rgba(148,163,184,.08);text-align:left;color:#cbd5e1}.mo-colabs-table th{color:#93c5fd;text-transform:uppercase;font-size:10px;letter-spacing:.03em;background:rgba(15,23,42,.55)}.mo-colabs-table td:nth-child(3),.mo-colabs-table td:nth-child(4),.mo-colabs-table td:nth-child(5){text-align:right}.mo-colabs-table tbody tr{cursor:pointer}.mo-colabs-table tbody tr:hover{background:rgba(63,168,120,.1)}.mo-colabs-table tbody tr.active{background:rgba(22,101,52,.22)}.mo-colabs-table tbody tr.active td:first-child{color:#facc15;font-weight:800}.mo-tag{display:inline-flex;align-items:center;border-radius:999px;padding:3px 8px;font-size:10px;font-weight:900;border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.8)}.mo-tag.frota,.mo-tag.carona{color:#bbf7d0}.mo-tag.reembolso{color:#bfdbfe}.mo-tag.uber,.mo-tag[class*="a-definir"]{color:#fde68a}.mo-tag.local{color:#e9d5ff}.mo-tabs{display:flex;gap:8px;padding:0 16px 8px;position:relative;z-index:20}.mo-tab-btn{border:1px solid rgba(148,163,184,.2);background:transparent;color:#94a3b8;border-radius:10px;padding:8px 14px;font-weight:800;cursor:pointer;font-size:12.5px}.mo-tab-btn.active{background:#166534;border-color:rgba(34,197,94,.4);color:#ecfdf5}.mo-comp-table{width:100%;border-collapse:collapse;font-size:12px}.mo-comp-table th,.mo-comp-table td{padding:8px 10px;border-bottom:1px solid rgba(148,163,184,.08);text-align:left;color:#cbd5e1}.mo-comp-table th{color:#93c5fd;text-transform:uppercase;font-size:10px;letter-spacing:.03em;background:rgba(15,23,42,.55);position:sticky;top:0}.mo-comp-table td.num{text-align:right;white-space:nowrap}.mo-comp-wrap{max-height:520px;overflow:auto;border:1px solid rgba(148,163,184,.14);border-radius:16px}.mo-pill.concorda{color:#bbf7d0}.mo-pill.diverge{color:#fecaca}.mo-pill.sem-registro{color:#94a3b8}@media(max-width:1100px){.mo-head{flex-direction:column}.mo-map-tools{grid-template-columns:1fr}.mo-legend{justify-content:flex-start}.mo-below{grid-template-columns:1fr}.mo-map{height:560px;min-height:420px}.mo-filter{grid-template-columns:1fr}.mo-kpis{flex-wrap:nowrap}.mo-map-select{width:100%}}
    `;
    document.head.appendChild(s);
  }

  async function leaflet() {
    if (window.L) return true;
    try { addCss('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', LEAFLET_CSS); await scriptTag('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', LEAFLET_JS); return !!window.L; }
    catch (err) { console.warn('[mapa-operacional] leaflet:', err?.message || err); return false; }
  }
  function addCss(h, id) { if (document.getElementById(id)) return; const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = h; l.id = id; document.head.appendChild(l); }
  function scriptTag(src, id) { return new Promise((res, rej) => { if (document.getElementById(id)) return res(); const s = document.createElement('script'); s.src = src; s.id = id; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }

  function kpis() {
    const osSemSaldo = st.osTodas.filter(o => o.__saldo <= 0).length;
    // Soma de todas as rotas sugeridas no backlog aberto (não é o custo de "hoje" — as OS abertas
    // se espalham por datas e regiões diferentes). Por isso reportamos também a média por rota.
    const custoTotalBacklog = st.rotas.reduce((acc, r) => acc + r.custoDia, 0);
    const custoMedioRota = st.rotas.length ? custoTotalBacklog / st.rotas.length : 0;
    const economiaPotencial = st.rotas.reduce((acc, r) => acc + r.economia, 0);
    return {
      os: st.os.length, osSemSaldo, pontos: st.pontos.length, rotas: st.rotas.length,
      semColaborador: st.semAssociacao.length, repetidos: st.rotas.filter(r => r.repetido).length,
      custoTotalBacklog, custoMedioRota, economiaPotencial, hospedar: st.rotas.filter(r => r.recomendacao === 'hospedar').length,
      hospedarEstimado: st.rotas.filter(r => r.recomendacao === 'hospedar' && r.hospedagem?.estimado).length,
      inviaveis: st.rotas.filter(r => r.inviavel).length,
    };
  }
  function rows() { return { base: st.rotas.filter(r => passaFiltroPonto(r.ponto)), sem: st.semAssociacao.filter(r => passaFiltroPonto(r.ponto)) }; }
  function badge(r) {
    let html = r.origem === 'associado' ? '<span class="mo-pill ok">associado</span>' : '<span class="mo-pill info">sugerido</span>';
    if (r.repetido) html += `<span class="mo-pill warn">repetido ${RAIO_REPETIR_COLAB_KM} km</span>`;
    if (r.recomendacao === 'hospedar') html += `<span class="mo-pill warn">hospedar compensa${r.hospedagem?.estimado ? ' (estimado)' : ''}</span>`;
    if (r.inviavel) html += '<span class="mo-pill bad">sem opção viável perto</span>';
    return html;
  }

  function html() {
    const tabs = `<div class="mo-tabs"><button class="mo-tab-btn ${st.tab === 'mapa' ? 'active' : ''}" data-tab="mapa">Mapa</button><button class="mo-tab-btn ${st.tab === 'comparativo' ? 'active' : ''}" data-tab="comparativo">Sugerido x Registrado</button></div>`;
    const corpo = st.tab === 'comparativo' ? htmlComparativo() : htmlMapa();
    return `
      <div class="mo"><section class="mo-card"><div class="mo-head"><div><h2>Mapa operacional</h2><p>Custo-benefício por OS: compara frota/carona (grátis), veículo próprio, Uber/táxi (até 60km, além disso vira carro) e hospedagem próxima.</p></div><div class="mo-actions"><select class="mo-select mo-map-select" data-map-base><option value="escuro" ${st.mapaBase === 'escuro' ? 'selected' : ''}>Mapa escuro</option><option value="real" ${st.mapaBase === 'real' ? 'selected' : ''}>Visualização real</option><option value="padrao" ${st.mapaBase === 'padrao' ? 'selected' : ''}>Mapa padrão</option></select><button class="mo-btn ${st.mostrarRota ? '' : 'off'}" data-toggle-rota>${st.mostrarRota ? 'Desligar rota' : 'Ligar rota'}</button><button class="mo-btn" data-reload>Atualizar</button></div></div>
        ${tabs}
        ${corpo}
      </section>${st.tab === 'mapa' ? colabsHtml() : ''}</div>`;
  }

  function htmlMapa() {
    const k = kpis(), { base, sem } = rows(), estados = estadosDisponiveis(), pontosFiltrados = st.pontos.filter(p => !st.estado || p.uf === st.estado);
    const alertas = [
      sem.length ? `${sem.length} OS com saldo remanescente ainda sem colaborador disponível respeitando local/${RAIO_REPETIR_COLAB_KM} km.` : '',
      k.inviaveis ? `${k.inviaveis} OS com colaborador sugerido a mais de ${DIST_MAX_DESLOCAMENTO_DIARIO_KM}km e sem hospedagem conhecida por perto — precisa de hospedagem (a cadastrar) ou revisão manual.` : '',
    ].filter(Boolean);
    const alertasHtml = alertas.length ? `<div class="mo-alerts">${alertas.map(a => `<div class="mo-alert" title="${esc(a)}">${esc(a)}</div>`).join('')}</div>` : '';
    const rotaInfo = st.mostrarRota ? `Ligado · desenhando ${base.length} rota(s) visíveis` : 'Desligada';
    return `${alertasHtml}
        <div class="mo-map-tools"><div class="mo-filter"><select class="mo-select" data-estado><option value="">Todos os estados</option>${estados.map(uf => `<option value="${esc(uf)}" ${st.estado === uf ? 'selected' : ''}>${esc(uf)}</option>`).join('')}</select><select class="mo-select" data-ponto><option value="">Todos os pontos com OS aberta</option>${pontosFiltrados.map(p => `<option value="${esc(p.__key)}" ${st.ponto === p.__key ? 'selected' : ''}>${esc(p.cidade || p.nome_local)}/${esc(p.uf)} · ${esc(p.nome_local || 'Ponto')}</option>`).join('')}</select></div>
        <div class="mo-legend"><button class="mo-marker-toggle ${st.mostrarVeiculos ? '' : 'off'}" data-toggle-marker="veiculos"><i class="veiculo"></i>Veículos ${st.mostrarVeiculos ? 'On' : 'Off'}</button><button class="mo-marker-toggle ${st.mostrarColaboradores ? '' : 'off'}" data-toggle-marker="colaboradores"><i class="azul"></i>Colaboradores ${st.mostrarColaboradores ? 'On' : 'Off'}</button><button class="mo-marker-toggle ${st.mostrarOS ? '' : 'off'}" data-toggle-marker="os"><i class="verde"></i>OS ${st.mostrarOS ? 'On' : 'Off'}</button><button class="mo-marker-toggle ${st.mostrarHoteis ? '' : 'off'}" data-toggle-marker="hoteis"><i class="roxo"></i>Hotéis ${st.mostrarHoteis ? 'On' : 'Off'}</button><span><i class="vermelho"></i>OS sem saldo</span><span data-rota-status>Rotas: ${rotaInfo}</span></div></div>
        <div class="mo-body">
          <div id="moMap" class="mo-map"><div class="mo-load">Carregando mapa...</div></div>
          <div class="mo-kpis"><div class="mo-kpi"><span>OS com saldo</span><strong>${k.os}</strong></div><div class="mo-kpi"><span>OS sem saldo</span><strong>${k.osSemSaldo}</strong></div><div class="mo-kpi"><span>Custo médio/rota</span><strong>${fmtRs(k.custoMedioRota)}</strong></div><div class="mo-kpi"><span>Custo total (backlog)</span><strong>${fmtRs(k.custoTotalBacklog)}</strong></div><div class="mo-kpi"><span>Economia hospedagem</span><strong>${fmtRs(k.economiaPotencial)}</strong></div><div class="mo-kpi"><span>Associadas/sugeridas</span><strong>${k.rotas}</strong></div><div class="mo-kpi"><span>Recomendam hospedar</span><strong>${k.hospedar}</strong></div><div class="mo-kpi"><span>Hospedagem c/ diária estimada</span><strong>${k.hospedarEstimado}</strong></div><div class="mo-kpi"><span>Sem opção viável perto</span><strong>${k.inviaveis}</strong></div><div class="mo-kpi"><span>Pontos</span><strong>${k.pontos}</strong></div><div class="mo-kpi"><span>Sem colaborador</span><strong>${k.semColaborador}</strong></div></div>
          <div class="mo-below"><section class="mo-card"><div class="mo-list">${base.length ? base.map(r => `<div class="mo-row ${st.rota === r.id ? 'active' : ''} ${r.inviavel ? 'sem' : ''}" data-rota="${esc(r.id)}"><strong>${esc(short(r.colab.nome))} · ${esc(r.os.cliente || 'OS')}</strong><small>${esc(r.modoLabel)} · ${fmtKm(r.dist)} · custo ${fmtRs(r.custoDia)} · saldo OS ${fmtKg(r.os.__saldo)}</small>${badge(r)}</div>`).join('') : ''}${sem.map(r => `<div class="mo-row sem"><strong>${r.ponto.temCoord ? 'Sem colaborador' : 'Sem coordenada do ponto'} · ${esc(r.os.cliente || 'OS')}</strong><small>OS ${esc(r.os.numero_os || r.os.id)} · ${esc(r.ponto.cidade)}/${esc(r.ponto.uf)} · saldo ${fmtKg(r.os.__saldo)} · ${esc(r.motivo)}</small><span class="mo-pill bad">pendente</span></div>`).join('')}${!base.length && !sem.length ? '<div class="mo-load">Nenhuma OS com saldo remanescente encontrada para o filtro.</div>' : ''}</div></section><section class="mo-card">${detail()}</section></div>
        </div>`;
  }

  function passaFiltroSupervisao(l) { return !st.supervisaoComparativo || l.supervisao === st.supervisaoComparativo; }
  function supervisoesComparativo() { return [...new Set(st.comparativo.map(l => l.supervisao))].sort(); }

  function kpisComparativo() {
    const linhas = st.comparativo.filter(passaFiltroSupervisao);
    const comRegistro = linhas.filter(l => l.temRegistro);
    const concordam = comRegistro.filter(l => l.concorda).length;
    const custoSugeridoTotal = comRegistro.reduce((a, l) => a + l.custoSugerido, 0);
    const custoRegistradoTotal = comRegistro.reduce((a, l) => a + l.custoRegistrado, 0);
    return {
      total: linhas.length, comRegistro: comRegistro.length,
      pctConcordancia: comRegistro.length ? Math.round((concordam / comRegistro.length) * 100) : 0,
      custoSugeridoTotal, custoRegistradoTotal, diferencaTotal: custoRegistradoTotal - custoSugeridoTotal,
    };
  }

  function htmlComparativo() {
    const k = kpisComparativo();
    const supervisoes = supervisoesComparativo();
    const linhas = st.comparativo.filter(passaFiltroSupervisao);
    return `
        <div class="mo-body">
          <p style="color:#94a3b8;font-size:12px;margin:0 16px">Compara o que o motor de custo-benefício recomendaria hoje contra o que foi de fato escolhido na Programação (Organizar Equipe / Fechar custos). É estimativa contra estimativa — nenhum dos dois lados é despesa paga de verdade. Supervisão só é conhecida quando a programação de origem ainda existe no cadastro; registros antigos aparecem como "Sem programação".</p>
          <div class="mo-kpis"><div class="mo-kpi"><span>OS comparadas</span><strong>${k.total}</strong></div><div class="mo-kpi"><span>Com registro real</span><strong>${k.comRegistro}</strong></div><div class="mo-kpi"><span>Concordância</span><strong>${k.pctConcordancia}%</strong></div><div class="mo-kpi"><span>Custo sugerido</span><strong>${fmtRs(k.custoSugeridoTotal)}</strong></div><div class="mo-kpi"><span>Custo registrado</span><strong>${fmtRs(k.custoRegistradoTotal)}</strong></div><div class="mo-kpi"><span>Diferença</span><strong>${fmtRs(k.diferencaTotal)}</strong></div></div>
          <div class="mo-filter" style="grid-template-columns:260px auto"><select class="mo-select" data-supervisao-comp><option value="">Todas as supervisões</option>${supervisoes.map(s => `<option value="${esc(s)}" ${st.supervisaoComparativo === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select><button class="mo-btn" data-export-csv style="justify-self:start">Exportar CSV</button></div>
          <div class="mo-comp-wrap"><table class="mo-comp-table"><thead><tr><th>Colaborador</th><th>OS/Cliente</th><th>Supervisão</th><th>Sugerido</th><th>Registrado</th><th>Custo sugerido</th><th>Custo registrado</th><th>Diferença</th><th></th></tr></thead><tbody>${linhas.length ? linhas.map(l => `
            <tr>
              <td>${esc(l.nome)}</td>
              <td>${esc(l.os.cliente || l.os.numero_os || '—')}</td>
              <td>${esc(l.supervisao)}</td>
              <td>${esc(l.modoSugerido)}</td>
              <td>${esc(l.modoRegistrado)}</td>
              <td class="num">${fmtRs(l.custoSugerido)}</td>
              <td class="num">${l.custoRegistrado !== null ? fmtRs(l.custoRegistrado) : '—'}</td>
              <td class="num">${l.diferenca !== null ? fmtRs(l.diferenca) : '—'}</td>
              <td>${l.temRegistro ? (l.concorda ? '<span class="mo-pill concorda">concorda</span>' : '<span class="mo-pill diverge">diverge</span>') : '<span class="mo-pill sem-registro">sem registro</span>'}</td>
            </tr>`).join('') : '<tr><td colspan="9" style="text-align:center;padding:20px;color:#94a3b8">Nenhuma OS confirmada na Programação encontrada.</td></tr>'}</tbody></table></div>
        </div>`;
  }

  function exportarComparativoCSV() {
    const linhas = st.comparativo.filter(passaFiltroSupervisao);
    const cab = ['Colaborador', 'OS/Cliente', 'Supervisão', 'Sugerido', 'Registrado', 'Custo sugerido', 'Custo registrado', 'Diferença', 'Status'];
    const csvEsc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const linhasCsv = linhas.map(l => [
      l.nome, l.os.cliente || l.os.numero_os || '', l.supervisao, l.modoSugerido, l.modoRegistrado,
      l.custoSugerido.toFixed(2).replace('.', ','), l.custoRegistrado !== null ? l.custoRegistrado.toFixed(2).replace('.', ',') : '',
      l.diferenca !== null ? l.diferenca.toFixed(2).replace('.', ',') : '',
      l.temRegistro ? (l.concorda ? 'concorda' : 'diverge') : 'sem registro',
    ].map(csvEsc).join(';'));
    const csv = [cab.map(csvEsc).join(';'), ...linhasCsv].join('\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mapa-operacional-sugerido-x-registrado.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function detail() {
    const r = st.rotas.find(x => x.id === st.rota) || rows().base[0];
    if (!r) return '<div class="mo-load">Selecione uma rota.</div>';
    st.rota = r.id;
    const hospInfo = r.hospedagem ? `${esc(r.hospedagem.nome)} · ${fmtRs(r.hospedagem.custoDia)}/dia${r.hospedagem.estimado ? ' (diária estimada)' : ''}${r.hospedagem.distKm != null ? ` · ${fmtKm(r.hospedagem.distKm)} do ponto` : ''}` : 'Nenhuma opção próxima conhecida';
    return `<div class="mo-detail"><div class="mo-mini"><span>Colaborador</span><strong>${esc(r.colab.nome)}</strong></div><div class="mo-mini"><span>Ponto/OS</span><strong>${esc(r.ponto.nome_local)} · ${esc(r.ponto.cidade)}/${esc(r.ponto.uf)}</strong></div><div class="mo-mini"><span>Modo de deslocamento</span><strong>${esc(r.modoLabel)}${r.modoEstimado ? ' (estimado)' : ''}</strong></div><div class="mo-mini"><span>Custo deslocamento/dia</span><strong>${fmtRs(r.custoDeslocamento)}</strong></div><div class="mo-mini"><span>Hospedagem próxima</span><strong>${hospInfo}</strong></div><div class="mo-mini"><span>Recomendação</span><strong>${r.inviavel ? `Sem opção viável em ${fmtKm(r.dist)} — mão de obra próxima já alocada em OS maiores; precisa de hospedagem (não cadastrada aqui) ou revisão manual` : r.recomendacao === 'hospedar' ? `Hospedar — economiza ${fmtRs(r.economia)}/dia` : 'Deslocar no dia'}</strong></div><div class="mo-mini"><span>Saldo da OS</span><strong>${fmtKg(r.os.__saldo)}</strong></div><div class="mo-mini"><span>Saldo acumulado colab.</span><strong>${fmtKg(r.saldoDepois)}</strong></div></div>`;
  }

  function colabsHtml() {
    const porColab = new Map();
    for (const r of st.rotas) {
      const key = norm(r.colab.nome);
      // st.rotas já vem ordenado por custo desc (build()); a primeira rota encontrada aqui pra
      // cada colaborador é a de maior custo — usada como âncora pro clique (detalhe + ponto no mapa).
      const atual = porColab.get(key) || { nome: r.colab.nome, colabId: r.colab.id, modo: r.modoLabel, os: 0, saldo: 0, custo: 0, rotaPrincipal: r.id };
      atual.os += 1; atual.saldo += r.os.__saldo; atual.custo += r.custoDia;
      porColab.set(key, atual);
    }
    const lista = [...porColab.values()].sort((a, b) => b.custo - a.custo);
    const colabSelecionadoId = st.rotas.find(x => x.id === st.rota)?.colab?.id;
    const body = lista.length
      ? `<table class="mo-colabs-table"><thead><tr><th>Colaborador</th><th>Modo</th><th>OS</th><th>Saldo</th><th>Custo total</th></tr></thead><tbody>${lista.map(c => `<tr class="${c.colabId === colabSelecionadoId ? 'active' : ''}" data-colab-rota="${esc(c.rotaPrincipal)}"><td>${esc(c.nome)}</td><td>${esc(c.modo)}</td><td>${c.os}</td><td>${fmtKg(c.saldo)}</td><td>${fmtRs(c.custo)}</td></tr>`).join('')}</tbody></table>`
      : '<div class="mo-load">Nenhum colaborador associado para o filtro atual.</div>';
    return `<section class="mo-colabs-card"><div class="mo-colabs-head"><strong>Colaboradores no mapa</strong><span>${lista.length} colaborador(es) · clique pra destacar no mapa</span></div>${body}</section>`;
  }

  function bind(root) {
    root.querySelectorAll('[data-tab]').forEach(el => { el.onclick = () => { st.tab = el.dataset.tab; render(root); }; });
    root.querySelector('[data-estado]')?.addEventListener('change', e => { st.estado = e.target.value; st.ponto = ''; st.rota = ''; render(root); });
    root.querySelector('[data-ponto]')?.addEventListener('change', e => { st.ponto = e.target.value; st.rota = ''; render(root); });
    root.querySelector('[data-map-base]')?.addEventListener('change', e => { st.mapaBase = TILE_LAYERS[e.target.value] ? e.target.value : 'escuro'; applyBaseLayer(); });
    root.querySelectorAll('[data-toggle-marker]').forEach(el => {
      el.onclick = () => {
        const alvo = el.dataset.toggleMarker;
        if (alvo === 'veiculos') st.mostrarVeiculos = !st.mostrarVeiculos;
        if (alvo === 'colaboradores') st.mostrarColaboradores = !st.mostrarColaboradores;
        if (alvo === 'os') st.mostrarOS = !st.mostrarOS;
        if (alvo === 'hoteis') st.mostrarHoteis = !st.mostrarHoteis;
        render(root);
      };
    });
    root.querySelector('[data-toggle-rota]')?.addEventListener('click', () => { st.mostrarRota = !st.mostrarRota; render(root); });
    root.querySelector('[data-reload]')?.addEventListener('click', () => openHome(root));
    root.querySelectorAll('[data-rota]').forEach(el => { el.onclick = () => { st.rota = el.dataset.rota; render(root); }; });
    root.querySelectorAll('[data-colab-rota]').forEach(el => { el.onclick = () => { st.rota = el.dataset.colabRota; render(root); }; });
    root.querySelector('[data-supervisao-comp]')?.addEventListener('change', e => { st.supervisaoComparativo = e.target.value; render(root); });
    root.querySelector('[data-export-csv]')?.addEventListener('click', () => exportarComparativoCSV());
  }

  async function map(root) {
    const el = root.querySelector('#moMap');
    if (!el) return;
    const ok = await leaflet();
    if (!ok) { el.innerHTML = '<div class="mo-load">Não foi possível carregar o mapa.</div>'; return; }
    if (st.map) { try { st.map.remove(); } catch {} }
    const L = window.L;
    st.map = L.map(el, { center: [-14.235, -51.925], zoom: 4 });
    st.tileLayer = null;
    applyBaseLayer();
    st.layer = L.layerGroup().addTo(st.map);
    st.routeLayer = L.layerGroup().addTo(st.map);
    await draw(root);
    setTimeout(() => st.map?.invalidateSize(), 80);
  }
  function applyBaseLayer() {
    if (!st.map || !window.L) return;
    const cfg = TILE_LAYERS[st.mapaBase] || TILE_LAYERS.escuro;
    if (st.tileLayer) {
      try { st.map.removeLayer(st.tileLayer); } catch {}
    }
    st.tileLayer = window.L.tileLayer(cfg.url, cfg.options).addTo(st.map);
  }
  function icon(t, selected = false) { return window.L.divIcon({ className: '', html: `<div class="mk ${t} ${selected ? 'sel' : ''}"></div>`, iconSize: [13, 13], iconAnchor: [6.5, 6.5] }); }
  function osPorPonto(ponto) { return st.osTodas.filter(o => o.__pontoKey === ponto.__key); }

  function veiculoTooltip(v) {
    const estado = v.status === 'em_movimento' ? 'em movimento' : 'parado/estacionado';
    const vel = Number.isFinite(Number(v.velocidade)) ? `${Number(v.velocidade).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} km/h` : 'sem velocidade';
    const motorista = v.motorista ? `<br>${esc(v.motorista)}` : '';
    const quando = v.reportado_em ? `<br>${esc(new Date(v.reportado_em).toLocaleString('pt-BR'))}` : '';
    const endereco = v.endereco ? `<br>${esc(v.endereco)}` : '';
    return `<strong>Veículo: ${esc(v.placa || 'Sem placa')}</strong><br>${esc(estado)} · ${esc(vel)}${motorista}${quando}${endereco}`;
  }

  function drawVeiculos(L, bounds) {
    st.veiculos.filter(geo).forEach(v => {
      L.marker([lat(v), lng(v)], { icon: icon(v.status === 'em_movimento' ? 'veic-mov' : 'veic-park') }).bindTooltip(veiculoTooltip(v)).addTo(st.layer);
      if (!st.estado && !st.ponto) bounds.push([lat(v), lng(v)]);
    });
  }

  function hotelTooltip(h) {
    const diaria = num(h.valor_diaria_individual) ?? num(h.valor_diaria_padrao);
    const preco = diaria !== null ? `${fmtRs(diaria)}/dia` : 'sem diária cadastrada';
    const local = [h.cidade, h.uf].filter(Boolean).join('/');
    return `<strong>Hotel: ${esc(h.nome)}</strong>${local ? `<br>${esc(local)}` : ''}<br>${esc(preco)}`;
  }

  function drawHoteis(L, bounds) {
    st.hoteisComCoord.forEach(h => {
      L.marker([lat(h), lng(h)], { icon: icon('hotel') }).bindTooltip(hotelTooltip(h)).addTo(st.layer);
      if (!st.estado && !st.ponto) bounds.push([lat(h), lng(h)]);
    });
  }

  async function draw(root) {
    if (!st.map || !window.L || !st.layer) return;
    const L = window.L, b = [];
    const token = ++st.drawToken;
    st.layer.clearLayers();
    st.routeLayer?.clearLayers();
    const { base } = rows();
    const r = st.rotas.find(x => x.id === st.rota) || base[0];
    const colabSelecionadoId = r?.colab?.id;
    const pontosVisiveis = st.pontos.filter(p => passaFiltroPonto(p) && p.temCoord);

    if (st.mostrarOS) {
      pontosVisiveis.forEach(p => {
        const oss = osPorPonto(p), semSaldo = oss.length && oss.every(o => o.__saldo <= 0);
        L.marker([p.lat, p.lng], { icon: icon(semSaldo ? 'os-zero' : 'os-ok', r?.ponto?.__key === p.__key) }).bindTooltip(`${semSaldo ? 'OS sem saldo' : 'OS com saldo'} · ${esc(p.nome_local)} · ${esc(p.cidade)}/${esc(p.uf)} · ${oss.length} OS`).addTo(st.layer);
        b.push([p.lat, p.lng]);
      });
    }

    if (st.mostrarVeiculos) drawVeiculos(L, b);
    if (st.mostrarHoteis) drawHoteis(L, b);

    const usados = new Map();
    if (st.mostrarColaboradores) base.forEach(x => { if (geo(x.colab) && !usados.has(x.colab.id)) usados.set(x.colab.id, x.colab); });
    // Destaca o colaborador selecionado (via clique na rota ou na tabela "Colaboradores no mapa")
    // e TODAS as rotas dele, não só a rota exata clicada — comparado por id, não por nome, pra não
    // colidir entre homônimos.
    usados.forEach(c => { const sel = c.id === colabSelecionadoId; L.marker([lat(c), lng(c)], { icon: icon(sel ? 'frota' : 'colab', sel) }).bindTooltip(`Colaborador: ${esc(c.nome)}`).addTo(st.layer); b.push([lat(c), lng(c)]); });

    if (st.mostrarRota) drawAllRoutes(root, base, token, b);
    if (b.length) st.map.fitBounds(b, { padding: [34, 34], maxZoom: st.estado || st.ponto ? 9 : 10 });
  }

  function drawFallbackRoute(L, route, selected) {
    const c = [lat(route.colab), lng(route.colab)], p = [route.ponto.lat, route.ponto.lng];
    return L.polyline([c, p], { color: selected ? '#facc15' : '#60a5fa', weight: selected ? 4 : 1.5, opacity: selected ? .9 : .18, dashArray: '5 8' }).addTo(st.routeLayer);
  }

  async function drawAllRoutes(root, base, token, bounds) {
    if (!st.map || !window.L || !st.routeLayer) return;
    const L = window.L;
    const selecionada = st.rotas.find(x => x.id === st.rota) || base[0];
    const colabSelecionadoId = selecionada?.colab?.id;
    const validas = base.filter(r => geo(r.colab) && r.ponto.temCoord);
    validas.forEach(r => {
      // Pontilhado (reta simplificada) só na rota do colaborador selecionado — desenhar em todas
      // poluía o mapa inteiro quando havia centenas de rotas sem rota real carregada ainda.
      if (r.colab.id === colabSelecionadoId) drawFallbackRoute(L, r, true);
      bounds.push([lat(r.colab), lng(r.colab)], [r.ponto.lat, r.ponto.lng]);
    });

    updateRouteStatus(root, `Rotas: desenhando ${validas.length} rota(s) visíveis...`);
    // A rota selecionada vai primeiro na fila — senão ela podia nunca resolver pra rota real se
    // caísse fora do limite de ROTAS_REAIS_LIMITE, ficando só no pontilhado indefinidamente.
    const ordenadas = [...validas].sort((a, b) => (b.colab.id === colabSelecionadoId ? 1 : 0) - (a.colab.id === colabSelecionadoId ? 1 : 0));
    const fila = ordenadas.slice(0, ROTAS_REAIS_LIMITE);
    let done = 0, realOk = 0;
    async function worker() {
      while (fila.length && token === st.drawToken) {
        const r = fila.shift();
        const real = await rotaReal([{ lat: lat(r.colab), lng: lng(r.colab) }, { lat: r.ponto.lat, lng: r.ponto.lng }]);
        if (token !== st.drawToken || !st.routeLayer) return;
        done++;
        if (real?.coords?.length) {
          realOk++;
          const sel = r.colab.id === colabSelecionadoId;
          L.polyline(real.coords, { color: sel ? '#facc15' : '#22c55e', weight: sel ? 4 : 2, opacity: sel ? .95 : .35 }).addTo(st.routeLayer);
        }
        updateRouteStatus(root, `Rotas: ${done}/${Math.min(validas.length, ROTAS_REAIS_LIMITE)} reais carregadas${validas.length > ROTAS_REAIS_LIMITE ? ` · limite ${ROTAS_REAIS_LIMITE}/${validas.length}` : ''}`);
      }
    }
    await Promise.all(Array.from({ length: Math.min(ROTAS_REAIS_SIMULTANEAS, fila.length) }, worker));
    if (token === st.drawToken) updateRouteStatus(root, `Rotas: ${validas.length} visíveis · ${realOk} reais carregadas${validas.length > ROTAS_REAIS_LIMITE ? ' · use filtro de estado/ponto para carregar as demais' : ''}`);
  }

  function updateRouteStatus(root, text) {
    const a = root.querySelector('[data-rota-status]');
    if (a) a.textContent = text;
  }

  function render(root) { root.innerHTML = html(); bind(root); if (st.tab === 'mapa') map(root); }
  function renderErro(root, err) { root.innerHTML = `<div class="mo"><section class="mo-card"><div class="mo-load">Não foi possível carregar o mapa operacional.<br><small>${esc(err?.message || err || 'Erro desconhecido')}</small></div></section></div>`; }

  async function openHome(root) {
    css();
    root.innerHTML = '<div class="mo"><section class="mo-card"><div class="mo-load">Carregando OS, colaboradores, frota e hospedagem...</div></section></div>';
    try {
      await load();
      st.rota = rows().base[0]?.id || '';
      render(root);
      console.info('[mapa-operacional] carregado', { osComSaldo: st.os.length, pontos: st.pontos.length, associadas: st.rotas.length, semAssociacao: st.semAssociacao.length, comparativo: st.comparativo.length });
    } catch (err) {
      console.error('[mapa-operacional] erro ao carregar:', err);
      renderErro(root, err);
    }
  }

  window.OPERACIONAL = { openHome };
})();
