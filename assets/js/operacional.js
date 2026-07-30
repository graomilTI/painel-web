import { supabase } from './supabaseClient.js';
import { getCurrentUser } from './auth.js';

(function () {
  'use strict';

  const STYLE_ID = 'mapa-operacional-style';
  const LEAFLET_CSS = 'leaflet-css-mapaop';
  const LEAFLET_JS = 'leaflet-js-mapaop';
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
  // Nome do estado (como aparece no endereço reverso-geocodificado de frotas_posicoes.endereco,
  // ex.: "..., Mato Grosso, Brazil") -> sigla, pra filtrar veículos pela posição atual deles
  // (não pela UF de registro do veículo, que pode ser de outro estado).
  const UF_POR_NOME_ESTADO = {
    ACRE: 'AC', ALAGOAS: 'AL', AMAPA: 'AP', AMAZONAS: 'AM', BAHIA: 'BA', CEARA: 'CE',
    'DISTRITO FEDERAL': 'DF', 'ESPIRITO SANTO': 'ES', GOIAS: 'GO', MARANHAO: 'MA',
    'MATO GROSSO': 'MT', 'MATO GROSSO DO SUL': 'MS', 'MINAS GERAIS': 'MG', PARA: 'PA',
    PARAIBA: 'PB', PARANA: 'PR', PERNAMBUCO: 'PE', PIAUI: 'PI', 'RIO DE JANEIRO': 'RJ',
    'RIO GRANDE DO NORTE': 'RN', 'RIO GRANDE DO SUL': 'RS', RONDONIA: 'RO', RORAIMA: 'RR',
    'SANTA CATARINA': 'SC', 'SAO PAULO': 'SP', SERGIPE: 'SE', TOCANTINS: 'TO',
  };
  function ufDoEndereco(endereco) {
    const partes = String(endereco || '').split(',').map(p => norm(p).replace(/\s+/g, ' ').trim());
    for (const parte of partes) { if (UF_POR_NOME_ESTADO[parte]) return UF_POR_NOME_ESTADO[parte]; }
    return '';
  }
  // Fallback geográfico (capital mais próxima) pra achar a UF de um ponto que tem coordenada mas
  // não tem texto de embarque parseável (ex.: irregularidades ligadas a OS com "Embarque" vazio
  // na origem) — impreciso perto de fronteira, mas muito melhor que não filtrar nada.
  const CAPITAIS_POR_UF = {
    AC: [-9.97, -67.81], AL: [-9.66, -35.74], AP: [0.04, -51.07], AM: [-3.12, -60.02],
    BA: [-12.97, -38.51], CE: [-3.73, -38.53], DF: [-15.79, -47.88], ES: [-20.32, -40.34],
    GO: [-16.68, -49.25], MA: [-2.53, -44.30], MT: [-15.60, -56.10], MS: [-20.44, -54.65],
    MG: [-19.92, -43.94], PA: [-1.46, -48.50], PB: [-7.12, -34.86], PR: [-25.43, -49.27],
    PE: [-8.05, -34.88], PI: [-5.09, -42.80], RJ: [-22.91, -43.17], RN: [-5.79, -35.21],
    RS: [-30.03, -51.23], RO: [-8.76, -63.90], RR: [2.82, -60.67], SC: [-27.60, -48.55],
    SP: [-23.55, -46.63], SE: [-10.91, -37.07], TO: [-10.25, -48.25],
  };
  function ufDaCoordenada(latitude, longitude) {
    if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) return '';
    let melhorUf = '', menorDist = Infinity;
    for (const [uf, [clat, clng]] of Object.entries(CAPITAIS_POR_UF)) {
      const d = km(latitude, longitude, clat, clng);
      if (d !== null && d < menorDist) { menorDist = d; melhorUf = uf; }
    }
    return melhorUf;
  }
  // Raio pra permitir reusar um colaborador já usado em outra OS. Analisado em 2026-07-01:
  // ignorando esse raio inteiramente (reuso livre), 94% das 842 OS abertas têm alguém a menos de
  // 150km e a mediana é 3,4km — ou seja, quase nunca é escassez real de mão de obra. O raio de 5km
  // tratava esse backlog (que se espalha por semanas) como se fosse um único dia de rotas, fazendo
  // a primeira OS grande processada "gastar" o colaborador mais próximo pra sempre, mesmo que ele
  // pudesse perfeitamente atender uma segunda OS a 30-80km em outro dia — daí colaboradores sendo
  // sugeridos a 800+km quando havia gente muito mais perto, só que já "usada" numa OS vizinha maior.
  const RAIO_HOTEL_KM = 60;
  const RAIO_CARONA_KM = 5;
  // Leitura de patrimônio (Frotas > Veículos) mais velha que isso não confirma posse atual do
  // veículo — média real hoje é 4,4 dias, 65% das leituras são de até 7 dias.
  const LIMITE_DIAS_LEITURA_PATRIMONIO = 7;

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
    os: [], osTodas: [], pontos: [], colaboradores: [], veiculos: [], vinculosPorOs: new Map(),
    estado: '', ponto: '', tab: 'mapa', mapaBase: 'escuro',
    mostrarVeiculos: true, mostrarColaboradores: true, mostrarOsComSaldo: true, mostrarOsSemSaldo: true, mostrarHoteis: false,
    mostrarIrregularidades: true, irregularidades: [], ufPorNumeroOs: new Map(),
    // "Só hoje": recorte fixo (pedido da usuária, 2026-07-30) — só entra OS marcada Atender pelo
    // gestor pra hoje, colaboradores vinculados a elas, frotas desses colaboradores e hotéis com
    // reserva hoje. Deixou de ser opcional (item #51 antigo) — sempre ligado, sem toggle na UI.
    somenteHoje: true, mostrarAlojamentos: false, alojamentosComCoord: [],
    // Rotas calculadas (operacional_mapa_rotas, geradas ao Gestor salvar a Programação) —
    // desenhadas por cima dos marcadores; frota = linha sólida, reembolso_km = tracejada.
    mostrarRotas: true, rotasMapa: [],
    // Escopo por regional: gestor vê só a própria supervisão; sem regional cadastrada (admin/master)
    // vê tudo — mesmo padrão de getMinhasRegionais() em logistica.js/hospedagem.js.
    minhasRegionais: [], minhasRegionaisCarregadas: false,
    // Só relevante com somenteHoje ligado: colaboradores fora do recorte de hoje ficam ocultos
    // por padrão, mas o gestor pode religar um específico manualmente na lista de "não escalados".
    colaboradoresExtras: new Set(), reservasHotelHoje: { porId: new Set(), porNome: new Set() },
    comparativo: [], supervisaoComparativo: '',
    alertasLaudo: [], alertasFiltroData: '', alertasFiltroCoordenacao: '',
    map: null, mapEl: null, tileLayer: null, layer: null,
    // hospedagemParaPonto/caronaInfoPara só dependem do ponto — sem cache, a aba Sugerido x
    // Registrado recalcularia os dois pra cada par (OS × colaborador), varrendo st.hoteisComCoord
    // (~1000 linhas) de novo a cada vez. Cacheado por ponto.__key; limpo no início de cada load().
    hospedagemCache: new Map(), caronaInfoCache: new Map(),
  };

  const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  const norm = v => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  const digits = v => String(v ?? '').replace(/\D/g, '');
  // Data de hoje em Brasília (não UTC do servidor/navegador) — usada só pelo recorte "Só hoje".
  const hojeISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

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
  // Colaborador cadastrado (ativo) em Conferência > Deslocamento (programacao_veiculo_proprio) já
  // é um fato confirmado, não uma suposição — usa tarifa própria de R$1,00/km rodado (ida+volta)
  // pedida pelo usuário, em vez do combustível genérico usado quando não se sabe o meio de transporte.
  const VEICULO_PROPRIO_RS_KM = 1;
  function veiculoProprioIdaVolta(distKmUmaVia) { return (Number(distKmUmaVia) || 0) * 2 * VEICULO_PROPRIO_RS_KM; }
  function uberIdaVolta(distKmUmaVia) { return (Number(distKmUmaVia) || 0) * 2 * UBER_RS_KM; }
  // Fora do raio real de Uber/táxi, extrapolar a tarifa por km gera valores absurdos (ex.: 1000km
  // de distância vira ~R$13mil numa única rota). Além do raio, assume-se custo de carro (mais realista).
  function uberOuCarroIdaVolta(distKmUmaVia) {
    return (Number(distKmUmaVia) || 0) <= UBER_RAIO_MAX_KM ? uberIdaVolta(distKmUmaVia) : combustivelIdaVolta(distKmUmaVia);
  }

  // Escopo por regional (mesmo padrão de getMinhasRegionais em logistica.js/hospedagem.js):
  // gestor com supervisão/coordenação cadastrada só vê a própria regional; sem regional
  // (admin/master) vê tudo — fallback pra "mostrar tudo" quando a lista fica vazia.
  function getUserField(ctx, ...paths) {
    for (const path of paths) {
      const parts = path.split('.');
      let cur = ctx;
      for (const part of parts) cur = cur?.[part];
      if (cur !== undefined && cur !== null && String(cur).trim() !== '') return cur;
    }
    return null;
  }
  function getMinhasRegionais(ctx) {
    const raw = getUserField(ctx, 'supervisao', 'user.supervisao', 'coordenacao', 'user.coordenacao') || '';
    return [...new Set(String(raw).split(/[,;|\n]+/).map((s) => norm(s)).filter(Boolean))];
  }
  function passaRegional(supervisao) {
    if (!st.minhasRegionais.length) return true;
    const s = norm(supervisao);
    return st.minhasRegionais.some((m) => s.includes(m) || m.includes(s));
  }

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
    // Backfill original grava "NOME DO LOCAL · CIDADE/UF" (fazenda/armazém real); a geocodificação
    // automática (geocode-operacional-os, via Nominatim) não acha nomes informais de fazenda e cai
    // pro centro da cidade, gravando só "Cidade, Estado, ..." (sem "·") — sinal confiável de que a
    // coordenada é aproximada (nível de cidade, pode estar a dezenas de km do local real).
    const aproximado = temCoord && !!o.ponto1_nome && !String(o.ponto1_nome).includes('·');
    return {
      lat: temCoord ? Number(o.ponto1_latitude) : null,
      lng: temCoord ? Number(o.ponto1_longitude) : null,
      nome_local: o.ponto1_nome || embarque.local || o.cliente || 'Ponto',
      cidade: embarque.cidade,
      uf: norm(embarque.uf),
      temCoord,
      aproximado,
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
      sel('colaboradores', 'cpf,nome,situacao,cargo,tipo'),
    ]);

    const colPorCpf = new Map();
    colRaw.filter(colaboradorAtivo).forEach(c => { const d = digits(c.cpf); if (d.length === 11) colPorCpf.set(d, c); });

    return baseRaw
      .map(b => {
        const cpf = digits(b.cpf);
        const cad = colPorCpf.get(cpf);
        if (cpf.length === 11 && colRaw.length && !cad) return null; // desligado na base de colaboradores
        // Só quem classifica em campo pode ser sugerido pra atender OS — Suporte, Auditor,
        // Supervisor, Coordenador, Logística e Gerente Operacional não embarcam (achado ao
        // investigar sugestão de um colaborador a 131km quando havia um Classificador a 0,4km:
        // o filtro só excluía "Administrativo", deixando ~223 cargos de escritório competindo
        // por proximidade contra quem de fato vai a campo). Só rejeita quando o cargo é
        // conhecido (cad existe) — sem cadastro casado em colaboradores, mantém como antes.
        if (cad && !norm(cad.cargo).startsWith('CLASSIFICADOR')) return null;
        // tipo de contrato (colaboradores.tipo: Efetivo/Intermitente/Diarista) — usado pra
        // priorizar Efetivo no desempate entre candidatos praticamente equidistantes.
        return { id: colKey(b.cpf, b.nome, `${b.cidade_base}|${b.uf_base}`), cpf, nome: b.nome || cad?.nome, latitude: b.latitude, longitude: b.longitude, cidade_base: b.cidade_base, uf_base: b.uf_base, tipoContrato: cad?.tipo || '' };
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

  // Rotas calculadas (operacional_mapa_rotas), publicadas pela Edge Function
  // operacional-mapa-rotas quando o Gestor salva a Programação — sempre hoje,
  // já filtradas por regional no mesmo passaRegional() usado nas O.S.
  async function loadRotasMapa() {
    const hoje = hojeISO();
    const rotasRaw = await sel('operacional_mapa_rotas', '*', q => q.eq('data_referencia', hoje));
    const rotas = rotasRaw.filter(r => passaRegional(r.supervisao));
    if (!rotas.length) return [];
    const ids = rotas.map(r => r.id);
    const paradasRaw = await sel('operacional_mapa_rotas_paradas', '*', q => q.in('rota_id', ids).order('ordem', { ascending: true }));
    const paradasPorRota = new Map();
    paradasRaw.forEach(p => {
      const arr = paradasPorRota.get(String(p.rota_id)) || [];
      arr.push(p);
      paradasPorRota.set(String(p.rota_id), arr);
    });
    return rotas.map(r => ({ ...r, paradas: paradasPorRota.get(String(r.id)) || [] }));
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
      sel('hospedagem_hoteis', 'id,nome,cidade,uf,latitude,longitude,valor_diaria_individual,valor_diaria_padrao'),
      sel('hospedagem_alojamentos', 'id,nome,cidade,uf,status,latitude,longitude', q => q.eq('status', 'ATIVO')),
    ]);
    const hoteisComCoord = hoteis.filter(geo);
    // Poucos registros (dezenas) — mantidos em lista simples, não em Map por chave exata: nomes
    // de cidade em hospedagem_alojamentos às vezes vêm truncados/abreviados (ex.: "Campo Novo"
    // em vez de "Campo Novo do Parecis"), então o casamento com o ponto da OS precisa ser por
    // substring, não igualdade exata.
    const alojamentosPorUf = alojamentos.map(a => ({ ...a, cidadeNorm: norm(a.cidade), ufNorm: norm(a.uf) }));
    // Camada do mapa (item #51) — só entram os que já têm coordenada geocodificada por
    // cidade/UF (ver adm-hotel-alojamentos-v2.js); sem filtro de dia (alojamento é vínculo
    // mensal, não diária, então "ativo" já é o único recorte que faz sentido aqui).
    const alojamentosComCoord = alojamentos.filter(geo);
    return { hoteisComCoord, alojamentosPorUf, alojamentosComCoord };
  }

  // Reservas de hotel com estadia cobrindo hoje (item #51 — "hotéis ativos no dia"). Casa por
  // hotel_id quando a reserva está ligada ao cadastro de hospedagem_hoteis; cai pro nome/cidade/UF
  // quando a reserva foi lançada avulsa (sem vínculo com o hotel pré-cadastrado).
  async function loadReservasHotelHoje() {
    const hoje = hojeISO();
    const rows = await sel('hospedagem_reservas', 'hotel_id,nome_hotel,cidade_hotel,uf_hotel,data_checkin,data_checkout,status_hospedagem', q => q
      .lte('data_checkin', hoje)
      .gte('data_checkout', hoje)
    );
    const porId = new Set(), porNome = new Set();
    rows.filter(r => !norm(r.status_hospedagem).includes('CANCELAD')).forEach(r => {
      if (r.hotel_id) porId.add(String(r.hotel_id));
      porNome.add(`${norm(r.nome_hotel)}|${norm(r.cidade_hotel)}|${norm(r.uf_hotel)}`);
    });
    return { porId, porNome };
  }

  // --- Motor de custo-benefício ----------------------------------------

  function alojamentoParaPonto(ponto) {
    const ufN = norm(ponto.uf), cidadeN = norm(ponto.cidade);
    if (!ufN || !cidadeN) return null;
    return st.alojamentosPorUf.find(a => a.ufNorm === ufN && (cidadeN.includes(a.cidadeNorm) || a.cidadeNorm.includes(cidadeN))) || null;
  }

  function hospedagemParaPonto(ponto) {
    if (st.hospedagemCache.has(ponto.__key)) return st.hospedagemCache.get(ponto.__key);

    const alojamento = alojamentoParaPonto(ponto);
    if (alojamento) {
      const resultado = { tipo: 'alojamento', nome: alojamento.nome, custoDia: 0 };
      st.hospedagemCache.set(ponto.__key, resultado);
      return resultado;
    }

    if (!ponto.temCoord) { st.hospedagemCache.set(ponto.__key, null); return null; }
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
    const resultado = melhorComPreco || melhorSemPreco;
    st.hospedagemCache.set(ponto.__key, resultado);
    return resultado;
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
  // Resultado só depende do ponto (nunca do colaborador/OS) — cacheado por ponto.__key pelo mesmo
  // motivo do hospedagemCache/candidatosProximosCache: sem isso, build() varria st.frotaTrajetos
  // (amostragem de 12 pontos por trajeto) pra cada par OS×colaborador.
  function caronaDisponivelPara(ponto) {
    if (!ponto.temCoord || !st.frotaTrajetos?.length) return false;
    if (st.caronaInfoCache.has(ponto.__key)) return !!st.caronaInfoCache.get(ponto.__key);
    const disponivel = st.frotaTrajetos.some(t => distPontoTrajeto(ponto, t) <= RAIO_CARONA_KM);
    st.caronaInfoCache.set(ponto.__key, disponivel);
    return disponivel;
  }

  function modoColaborador(c, ponto) {
    // "Motorista de frota" exige leitura de patrimônio recente confirmando que a pessoa está de
    // fato com o veículo agora (mesmo critério já usado em Frotas > Veículos, via
    // patrimonio_funcionario + patrimonio_dias_sem_leitura) — não o cadastro nominal de
    // motorista_atual, que pode estar desatualizado e não refletir quem realmente está com o carro.
    // Custo estimado de combustível (mesma fórmula/tarifa do reembolso — R$0,70/km) mesmo sendo
    // veículo da empresa: sem isso a estimativa de gastos aparecia zerada, como se o deslocamento
    // não custasse nada — a empresa paga o combustível de qualquer forma, só não reembolsa o
    // colaborador. "Carona" continua custo zero: não é uma viagem dedicada, é aproveitar um
    // trajeto que já ia acontecer de qualquer forma.
    if (st.nomesFrotaSet.has(norm(c.nome))) return { modo: 'frota', label: 'Motorista/frota (leitura de patrimônio recente)', custoFn: combustivelIdaVolta };

    const habitual = st.modoHabitualPorCpf.get(c.cpf) || st.modoHabitualPorNome.get(norm(c.nome));
    if (habitual?.tipo === 'MOTORISTA FROTA') return { modo: 'reembolso', label: 'Motorista de frota (sem leitura recente — veículo da empresa)', custoFn: combustivelIdaVolta };
    if (habitual?.tipo === 'CARONA FROTA' && caronaDisponivelPara(ponto)) return { modo: 'carona', label: 'Carona com frota', custo: 0 };
    if (habitual?.tipo === 'NAO PRECISA') return { modo: 'local', label: 'Já está no local', custo: 0 };
    if (habitual?.tipo === 'REEMBOLSO KM') return { modo: 'reembolso', label: 'Veículo próprio', custoFn: combustivelIdaVolta };
    if (habitual?.tipo === 'UBER TAXI' || habitual?.tipo === 'UBER/TAXI') return { modo: 'uber', label: 'Uber/táxi', custoFn: uberOuCarroIdaVolta };

    if (st.veiculoProprioCpfs.has(c.cpf) || st.veiculoProprioNomes.has(norm(c.nome))) {
      return { modo: 'reembolso', label: 'Veículo próprio (Conferência · Deslocamento)', custoFn: veiculoProprioIdaVolta };
    }
    // Sem modo habitual registrado nem veículo próprio marcado (61% dos classificadores ativos —
    // achado ao investigar um custo "exorbitante" pra uma rota curta): a suposição de Uber/táxi
    // aqui era um chute muito mais caro (~10x por km) que a realidade — Uber praticamente não
    // opera entre cidades pequenas do interior. Reembolso por km (veículo próprio) é a suposição
    // mais realista quando não se sabe o meio de transporte; Uber só quando é o modo REGISTRADO.
    return { modo: 'reembolso', label: 'Veículo próprio (estimado)', custoFn: combustivelIdaVolta, estimado: true };
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

  async function loadIrregularidades() {
    return sel('logistica_cargas_irregularidades', '*', q => q.order('detectado_em', { ascending: false }), 500);
  }

  async function loadAlertasLaudo() {
    return sel('operacional_laudos', '*', q => q.order('enviado_em', { ascending: false }), 500);
  }

  // Carrega em duas fases pra o mapa ir mostrando pontos conforme os dados chegam, em vez de
  // ficar tudo em branco até a última consulta terminar: OS/pontos primeiro (dá pra ver algo
  // rápido), depois colaboradores/frota/hospedagem/irregularidades em paralelo. Cada fase chama
  // render(root) pra desenhar o que já tem — render() reaproveita o mapa Leaflet já existente
  // (não recria do zero), então isso só preenche marcadores, não pisca a tela.
  async function load(root) {
    const { abertas, pontos, osPorId } = await loadOsEPontos();
    st.osPorId = osPorId;
    st.pontos = pontos;
    // Escopo por regional: gestor só vê a O.S. da própria supervisão (getMinhasRegionais acima);
    // sem regional cadastrada (admin/master), passaRegional() sempre retorna true (mostra tudo).
    const escopo = abertas.filter(o => passaRegional(o.supervisao));
    st.osTodas = escopo;
    st.os = escopo.filter(o => o.__saldo > 0);
    if (root) render(root, true);

    const [colaboradores, vinculosPorOs, modoHabitual, veiculoProprio, frotaAtual, hospedagem, irregularidades, alertasLaudo, reservasHotelHoje, rotasMapa] = await Promise.all([
      loadColaboradores(), loadVinculos(), loadModoHabitual(), loadVeiculoProprio(), loadFrotaAtual(), loadHospedagem(), loadIrregularidades(), loadAlertasLaudo(), loadReservasHotelHoje(), loadRotasMapa(),
    ]);
    st.rotasMapa = rotasMapa;
    st.irregularidades = irregularidades;
    st.alertasLaudo = alertasLaudo;
    st.reservasHotelHoje = reservasHotelHoje;
    st.alojamentosComCoord = hospedagem.alojamentosComCoord;

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

    st.colaboradores = colaboradores;
    st.frotaTrajetos = calcularTrajetosFrota();
    atualizarUfPorNumeroOs();
    if (root) render(root, true);

    // hospedagemParaPonto/caronaInfoPara cacheiam por ponto — limpa antes de recalcular o
    // comparativo pra não reaproveitar cache de um carregamento anterior (endereço/hotel podem
    // ter mudado). caronaInfoPara depende de st.frotaTrajetos, recém-recalculado acima.
    st.hospedagemCache.clear();
    st.caronaInfoCache.clear();
    st.comparativo = await loadComparativo();
  }

  // logistica_cargas_irregularidades não tem UF própria — só o número da OS. Resolve pela UF do
  // ponto de embarque daquela OS (usa st.osTodas, não só st.os, pra cobrir OS já fechadas).
  // Consumido por ufDaIrregularidade() -> drawIrregularidades().
  function atualizarUfPorNumeroOs() {
    const pontosPorChave = new Map(st.pontos.map(p => [p.__key, p]));
    st.ufPorNumeroOs = new Map();
    st.osTodas.forEach(o => {
      const ponto = pontosPorChave.get(o.__pontoKey);
      const uf = ponto?.uf || ufDaCoordenada(ponto?.lat, ponto?.lng);
      if (uf && o.numero_os) st.ufPorNumeroOs.set(String(o.numero_os), uf);
    });
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

  // --- Renderização ------------------------------------------------------

  function estadosDisponiveis() { return [...new Set(st.osTodas.map(o => pontoKeyToUf(o.__pontoKey)).filter(Boolean))].sort(); }
  function pontoKeyToUf(key) { return st.pontos.find(p => p.__key === key)?.uf || ''; }
  function passaFiltroPonto(p) { if (!p) return false; if (st.estado && p.uf !== st.estado) return false; if (st.ponto && p.__key !== st.ponto) return false; return true; }

  function css() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      .mo{color:#e2e8f0;display:flex;flex-direction:column;gap:12px}.mo-card{border:1px solid rgba(148,163,184,.16);border-radius:18px;background:linear-gradient(180deg,rgba(15,23,42,.96),rgba(2,6,23,.9));overflow:visible;position:relative;isolation:isolate}.mo-head{padding:14px 16px 10px;display:flex;justify-content:space-between;gap:12px;position:relative;z-index:30}.mo h2,.mo h3{margin:0;color:#fff}.mo h2{font-size:24px;line-height:1}.mo p{color:#94a3b8;margin:5px 0 0;font-size:12px}.mo-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.mo-btn{border:1px solid rgba(34,197,94,.35);border-radius:12px;background:#166534;color:#ecfdf5;font-weight:900;padding:8px 12px;cursor:pointer}.mo-btn.off{background:#334155;border-color:rgba(148,163,184,.35)}.mo-select{height:38px;border:1px solid rgba(148,163,184,.2);border-radius:12px;background:#0d0d18;color:#e2e8f0;padding:0 12px;width:100%}.mo-map-select{width:180px}.mo-map-tools{position:relative;z-index:2500;padding:0 16px 10px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}.mo-filter{display:grid;grid-template-columns:180px 1fr;gap:8px}.mo-body{display:flex;flex-direction:column;gap:12px;padding:0 16px 16px}.mo-map{height:calc(100vh - 300px);min-height:500px;max-height:760px;border:1px solid rgba(148,163,184,.14);border-radius:18px;background:#0d1117;z-index:1}.mo-below{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:14px}.mo-kpis{display:flex;gap:8px;overflow-x:auto;padding-bottom:2px}.mo-kpi{flex:1 0 126px;min-width:0;border:1px solid rgba(34,197,94,.18);border-radius:12px;padding:8px;background:rgba(2,6,23,.35)}.mo-kpi.clicavel{cursor:pointer}.mo-kpi.clicavel:hover{border-color:rgba(34,197,94,.5)}.mo-kpi.active{border-color:#facc15;box-shadow:0 0 0 1px rgba(250,204,21,.5);background:rgba(120,53,15,.18)}.mo-kpi span{display:block;font-size:8.5px;color:#94a3b8;font-weight:900;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mo-kpi strong{display:block;color:#fff;font-size:16px;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mo-list{max-height:420px;overflow:auto;padding:10px}.mo-row{border:1px solid rgba(148,163,184,.14);border-radius:15px;background:rgba(15,23,42,.62);padding:10px;margin-bottom:8px;cursor:pointer}.mo-row.active,.mo-row:hover{border-color:#22c55e;background:rgba(22,101,52,.13)}.mo-row.sem{border-color:rgba(248,113,113,.35)}.mo-row strong{display:block;color:#fff;font-size:13px}.mo-row small{display:block;color:#94a3b8;margin-top:4px}.mo-pill{display:inline-flex;border-radius:999px;padding:3px 8px;font-size:10px;font-weight:900;background:rgba(15,23,42,.8);border:1px solid rgba(148,163,184,.2);margin-right:4px}.ok{color:#bbf7d0}.warn{color:#fde68a}.bad{color:#fecaca}.info{color:#bfdbfe}.mo-detail{padding:14px;border-top:1px solid rgba(148,163,184,.12);display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.mo-mini{border:1px solid rgba(148,163,184,.12);border-radius:13px;padding:10px}.mo-mini span{display:block;font-size:10px;color:#94a3b8;text-transform:uppercase;font-weight:900}.mo-mini strong{display:block;color:#fff;margin-top:4px;font-size:13px}.mo-alerts{border-top:1px solid rgba(251,191,36,.18);border-bottom:1px solid rgba(251,191,36,.12);background:rgba(120,53,15,.12)}.mo-alert{padding:7px 16px;color:#fde68a;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mo-alert+.mo-alert{border-top:1px solid rgba(251,191,36,.12)}.mo-legend{display:flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap;color:#94a3b8;font-size:12px}.mo-rota-real{color:#facc15;font-weight:700}.mo-rota-real:empty{display:none}.mo-rota-real.mo-rota-alerta{color:#f87171}.mo-legend i{display:inline-block;width:12px;height:12px;border-radius:50%;border:2px solid #fff;vertical-align:-2px;margin-right:5px}.mo-legend .azul{background:#3b82f6}.mo-legend .verde{background:#22c55e}.mo-legend .vermelho{background:#ef4444}.mo-legend .veiculo{background:#06b6d4}.mo-legend .roxo{background:#a855f7}.mo-legend .laranja{background:#f59e0b}.mo-legend .agua{background:#14b8a6}.mo-marker-toggle{border:1px solid rgba(34,197,94,.28);background:rgba(6,78,59,.45);color:#ecfdf5;border-radius:999px;padding:6px 10px;font-size:11px;font-weight:900;cursor:pointer}.mo-marker-toggle.off{background:rgba(15,23,42,.72);border-color:rgba(148,163,184,.22);color:#94a3b8}.mo-marker-badge{border:1px solid rgba(250,204,21,.35);background:rgba(120,53,15,.25);color:#fde68a;border-radius:999px;padding:6px 10px;font-size:11px;font-weight:900}.mk{position:relative;width:13px;height:13px;border-radius:50%;border:1.5px solid #fff;box-shadow:0 0 0 1.5px rgba(0,0,0,.25)}.mk-irreg{width:19px;height:19px;border-radius:50%;background:#f59e0b;border:2px solid #fff;box-shadow:0 0 0 1.5px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:#451a03;font-weight:900;font-size:12px;line-height:1}.mk-irreg.sel{box-shadow:0 0 0 3px rgba(250,204,21,.6)}.mk.os-ok{background:#22c55e}.mk.os-zero{background:#ef4444}.mk.colab{background:#3b82f6}.mk.colab-fora{background:#ef4444}.mk.veic-mov{background:#06b6d4}.mk.veic-park{background:#f59e0b}.mk.hotel{background:#a855f7}.mk.alojamento{background:#14b8a6}.mk-ico{width:18px;height:18px;border-width:2px;display:flex;align-items:center;justify-content:center;line-height:0}.mk-ico svg{display:block}.mk.sel{box-shadow:0 0 0 3px rgba(250,204,21,.45)}.mk.aprox{border-style:dashed;border-width:2px;border-color:#fde68a}.mo-load{padding:28px;text-align:center;color:#94a3b8}.mo-map .leaflet-pane,.mo-map .leaflet-top,.mo-map .leaflet-bottom{z-index:1!important}.mo-map .leaflet-control{z-index:10!important}.mo-colabs-card{border:1px solid rgba(148,163,184,.16);border-radius:18px;background:linear-gradient(180deg,rgba(15,23,42,.96),rgba(2,6,23,.9));overflow:hidden;margin:0 16px 16px}.mo-colabs-head{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px 14px;border-bottom:1px solid rgba(148,163,184,.12)}.mo-colabs-head strong{color:#fff;font-size:14px}.mo-colabs-head span{color:#94a3b8;font-size:12px}.mo-colabs-table{width:100%;border-collapse:collapse;font-size:12px}.mo-colabs-table th,.mo-colabs-table td{padding:8px 10px;border-bottom:1px solid rgba(148,163,184,.08);text-align:left;color:#cbd5e1}.mo-colabs-table th{color:#93c5fd;text-transform:uppercase;font-size:10px;letter-spacing:.03em;background:rgba(15,23,42,.55)}.mo-colabs-table td:nth-child(4),.mo-colabs-table td:nth-child(5),.mo-colabs-table td:nth-child(6){text-align:right}.mo-colabs-table tbody tr{cursor:pointer}.mo-colabs-table tbody tr:hover{background:rgba(63,168,120,.1)}.mo-colabs-table tbody tr.active{background:rgba(22,101,52,.22)}.mo-colabs-table tbody tr.active td:first-child{color:#facc15;font-weight:800}.mo-tag{display:inline-flex;align-items:center;border-radius:999px;padding:3px 8px;font-size:10px;font-weight:900;border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.8)}.mo-tag.frota,.mo-tag.carona{color:#bbf7d0}.mo-tag.reembolso{color:#bfdbfe}.mo-tag.uber,.mo-tag[class*="a-definir"]{color:#fde68a}.mo-tag.local{color:#e9d5ff}.mo-tabs{display:flex;gap:8px;padding:0 16px 8px;position:relative;z-index:20}.mo-tab-btn{border:1px solid rgba(148,163,184,.2);background:transparent;color:#94a3b8;border-radius:10px;padding:8px 14px;font-weight:800;cursor:pointer;font-size:12.5px}.mo-tab-btn.active{background:#166534;border-color:rgba(34,197,94,.4);color:#ecfdf5}.mo-comp-table{width:100%;border-collapse:collapse;font-size:12px}.mo-comp-table th,.mo-comp-table td{padding:8px 10px;border-bottom:1px solid rgba(148,163,184,.08);text-align:left;color:#cbd5e1}.mo-comp-table th{color:#93c5fd;text-transform:uppercase;font-size:10px;letter-spacing:.03em;background:rgba(15,23,42,.55);position:sticky;top:0}.mo-comp-table td.num{text-align:right;white-space:nowrap}.mo-comp-wrap{max-height:520px;overflow:auto;border:1px solid rgba(148,163,184,.14);border-radius:16px}.mo-pill.concorda{color:#bbf7d0}.mo-pill.diverge{color:#fecaca}.mo-pill.sem-registro{color:#94a3b8}@media(max-width:1100px){.mo-head{flex-direction:column}.mo-map-tools{flex-direction:column;align-items:stretch}.mo-legend{justify-content:flex-start}.mo-below{grid-template-columns:1fr}.mo-map{height:560px;min-height:420px}.mo-filter{grid-template-columns:1fr}.mo-kpis{flex-wrap:nowrap}.mo-map-select{width:100%}}
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
    return { os: st.os.length, osSemSaldo: st.osTodas.filter(o => o.__saldo <= 0).length };
  }

  function html() {
    const irregAbertas = st.irregularidades.filter(i => norm(i.status) === 'ABERTA').length;
    const alertasPendentes = st.alertasLaudo.filter(l => l.suspeito && !l.revisado_em).length;
    const tabs = `<div class="mo-tabs"><button class="mo-tab-btn ${st.tab === 'mapa' ? 'active' : ''}" data-tab="mapa">Mapa</button><button class="mo-tab-btn ${st.tab === 'irregularidades' ? 'active' : ''}" data-tab="irregularidades">Irregularidades${irregAbertas ? ` (${irregAbertas})` : ''}</button><button class="mo-tab-btn ${st.tab === 'comparativo' ? 'active' : ''}" data-tab="comparativo">Sugerido x Registrado</button><button class="mo-tab-btn ${st.tab === 'alertas' ? 'active' : ''}" data-tab="alertas">Alertas${alertasPendentes ? ` (${alertasPendentes})` : ''}</button></div>`;
    const corpo = st.tab === 'comparativo' ? htmlComparativo() : st.tab === 'irregularidades' ? htmlIrregularidades() : st.tab === 'alertas' ? htmlAlertas() : htmlMapa();
    return `
      <div class="mo"><section class="mo-card"><div class="mo-head"><div><h2>Mapa operacional</h2><p>Localização de O.S. abertas, frota, classificadores e hotéis. Filtre por estado ou ponto de embarque.</p></div><div class="mo-actions"><select class="mo-select mo-map-select" data-map-base><option value="escuro" ${st.mapaBase === 'escuro' ? 'selected' : ''}>Mapa escuro</option><option value="real" ${st.mapaBase === 'real' ? 'selected' : ''}>Visualização real</option><option value="padrao" ${st.mapaBase === 'padrao' ? 'selected' : ''}>Mapa padrão</option></select><button class="mo-btn" data-reload>Atualizar</button></div></div>
        ${tabs}
        ${corpo}
      </section></div>`;
  }

  function kpiBox(label, valor) {
    return `<div class="mo-kpi"><span>${esc(label)}</span><strong>${valor}</strong></div>`;
  }
  function htmlMapa() {
    const k = kpis(), estados = estadosDisponiveis(), pontosFiltrados = st.pontos.filter(p => !st.estado || p.uf === st.estado);
    return `
        <div class="mo-map-tools"><div class="mo-filter"><select class="mo-select" data-estado><option value="">Todos os estados</option>${estados.map(uf => `<option value="${esc(uf)}" ${st.estado === uf ? 'selected' : ''}>${esc(uf)}</option>`).join('')}</select><select class="mo-select" data-ponto><option value="">Todos os pontos com OS aberta</option>${pontosFiltrados.map(p => `<option value="${esc(p.__key)}" ${st.ponto === p.__key ? 'selected' : ''}>${esc(p.cidade || p.nome_local)}/${esc(p.uf)} · ${esc(p.nome_local || 'Ponto')}</option>`).join('')}</select></div>
        <div class="mo-legend"><span class="mo-marker-badge" title="O mapa sempre mostra só as O.S. marcadas Atender pra hoje, com os colaboradores/frotas/rotas vinculados a elas">📍 Hoje · Atender</span><button class="mo-marker-toggle ${st.mostrarVeiculos ? '' : 'off'}" data-toggle-marker="veiculos"><i class="veiculo"></i>Veículos ${st.mostrarVeiculos ? 'On' : 'Off'}</button><button class="mo-marker-toggle ${st.mostrarColaboradores ? '' : 'off'}" data-toggle-marker="colaboradores"><i class="azul"></i>Colaboradores ${st.mostrarColaboradores ? 'On' : 'Off'}</button><button class="mo-marker-toggle ${st.mostrarRotas ? '' : 'off'}" data-toggle-marker="rotas" title="Frota = linha sólida · Reembolso km = tracejada"><i class="verde"></i>Rotas ${st.mostrarRotas ? 'On' : 'Off'}</button><button class="mo-marker-toggle ${st.mostrarOsComSaldo ? '' : 'off'}" data-toggle-marker="os-com-saldo"><i class="verde"></i>OS com saldo ${st.mostrarOsComSaldo ? 'On' : 'Off'}</button><button class="mo-marker-toggle ${st.mostrarOsSemSaldo ? '' : 'off'}" data-toggle-marker="os-sem-saldo"><i class="vermelho"></i>OS sem saldo ${st.mostrarOsSemSaldo ? 'On' : 'Off'}</button><button class="mo-marker-toggle ${st.mostrarHoteis ? '' : 'off'}" data-toggle-marker="hoteis"><i class="roxo"></i>Hotéis ${st.mostrarHoteis ? 'On' : 'Off'}</button><button class="mo-marker-toggle ${st.mostrarAlojamentos ? '' : 'off'}" data-toggle-marker="alojamentos"><i class="agua"></i>Alojamentos ${st.mostrarAlojamentos ? 'On' : 'Off'}</button><button class="mo-marker-toggle ${st.mostrarIrregularidades ? '' : 'off'}" data-toggle-marker="irregularidades"><i class="laranja"></i>Irregularidades ${st.mostrarIrregularidades ? 'On' : 'Off'}</button></div></div>
        <div class="mo-body">
          <div id="moMap" class="mo-map"><div class="mo-load">Carregando mapa...</div></div>
          <div class="mo-kpis">${kpiBox('OS com saldo', k.os)}${kpiBox('OS sem saldo', k.osSemSaldo)}</div>
          ${st.somenteHoje ? htmlColaboradoresNaoEscalados() : ''}
        </div>`;
  }

  // Lista de colaboradores fora do recorte "Só hoje" (sem vínculo com OS Atender hoje) — cada um
  // tem um toggle individual (fica com ícone vermelho no mapa quando ligado manualmente). Sem
  // isso, "Só hoje" simplesmente some com todo mundo que não está escalado, sem meio-termo.
  function htmlColaboradoresNaoEscalados() {
    const hojeIds = osAtenderHojeIds();
    const hojeKeys = colaboradoresHojeKeys(hojeIds);
    const fora = st.colaboradores.filter(c => geo(c) && (!st.estado || norm(c.uf_base) === norm(st.estado)) && !hojeKeys.has(colaboradorKey(c)));
    if (!fora.length) return '';
    return `<div class="mo-legend" style="justify-content:flex-start"><span style="color:#94a3b8;font-weight:900;width:100%">Não escalados hoje (${fora.length}) — clique pra mostrar/ocultar no mapa:</span>${fora.map(c => {
      const key = colaboradorKey(c);
      const on = st.colaboradoresExtras.has(key);
      return `<button class="mo-marker-toggle ${on ? '' : 'off'}" data-toggle-colab="${esc(key)}"><i class="vermelho"></i>${esc(c.nome)} ${on ? 'On' : 'Off'}</button>`;
    }).join('')}</div>`;
  }

  function fmtDataBr(v) {
    if (!v) return '—';
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v);
  }

  function irregStatusPill(s) {
    const n = norm(s);
    if (n === 'ABERTA') return '<span class="mo-pill bad">Aberta</span>';
    if (n === 'RESOLVIDA') return '<span class="mo-pill ok">Resolvida</span>';
    return `<span class="mo-pill">${esc(s || '—')}</span>`;
  }

  function htmlIrregularidades() {
    const linhas = st.irregularidades;
    const abertas = linhas.filter(i => norm(i.status) === 'ABERTA').length;
    const raioKm = linhas.length && Number.isFinite(Number(linhas[0].raio_m)) ? (Number(linhas[0].raio_m) / 1000).toLocaleString('pt-BR') : '2';
    return `
        <div class="mo-body">
          <p style="color:#94a3b8;font-size:12px;margin:0 16px">Cargas lançadas fora do raio de ${raioKm}km do Local de Embarque da O.S. — cruza o Relatório de Cargas do dia com o mapa a cada hora.</p>
          <div class="mo-kpis"><div class="mo-kpi"><span>Total</span><strong>${linhas.length}</strong></div><div class="mo-kpi"><span>Abertas</span><strong>${abertas}</strong></div></div>
          <div class="mo-comp-wrap"><table class="mo-comp-table"><thead><tr><th>Data</th><th>O.S.</th><th>Cliente</th><th>Coordenação/Supervisão</th><th>Classificador</th><th>Placa</th><th>Distância</th><th>Status</th></tr></thead><tbody>${linhas.length ? linhas.map(i => `
            <tr>
              <td>${esc(fmtDataBr(i.data_classificacao))}${i.hora_cadastro ? ' ' + esc(i.hora_cadastro) : ''}</td>
              <td>${esc(i.os || '—')}</td>
              <td>${esc(i.cliente || '—')}</td>
              <td>${esc(i.coordenacao || i.supervisao || '—')}</td>
              <td>${esc(i.colaborador || '—')}</td>
              <td>${esc(i.placa || '—')}</td>
              <td class="num">${Number.isFinite(Number(i.distancia_m)) ? fmtKm(Number(i.distancia_m) / 1000) : '—'}</td>
              <td>${irregStatusPill(i.status)}</td>
            </tr>`).join('') : '<tr><td colspan="8" style="text-align:center;padding:20px;color:#94a3b8">Nenhuma irregularidade registrada.</td></tr>'}</tbody></table></div>
        </div>`;
  }

  const ORIGEM_LAUDO_LABEL = { gestor_app: 'App Gestor', programacao: 'Programação', distribuir_os: 'Distribuir O.S.' };
  function origemLaudoLabel(o) { return ORIGEM_LAUDO_LABEL[o] || o || '—'; }
  function fmtDataHoraBr(v) {
    if (!v) return '—';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  function passaFiltroAlertas(l) {
    if (st.alertasFiltroData && String(l.enviado_em || '').slice(0, 10) !== st.alertasFiltroData) return false;
    if (st.alertasFiltroCoordenacao && (l.coordenacao || '') !== st.alertasFiltroCoordenacao) return false;
    return true;
  }
  function coordenacoesAlertas() { return [...new Set(st.alertasLaudo.map(l => l.coordenacao).filter(Boolean))].sort(); }
  function kpisAlertas() {
    const linhas = st.alertasLaudo.filter(passaFiltroAlertas);
    const suspeitos = linhas.filter(l => l.suspeito);
    return {
      total: linhas.length, suspeitos: suspeitos.length,
      pendentes: suspeitos.filter(l => !l.revisado_em).length,
      revisados: suspeitos.filter(l => l.revisado_em).length,
      semGeo: linhas.filter(l => !l.geo_capturada).length,
    };
  }

  function htmlAlertas() {
    const k = kpisAlertas();
    const coordenacoes = coordenacoesAlertas();
    const linhas = st.alertasLaudo.filter(passaFiltroAlertas).filter(l => l.suspeito);
    return `
        <div class="mo-body">
          <p style="color:#94a3b8;font-size:12px;margin:0 16px">Laudos anexados com geolocalização longe da casa do colaborador e do local da O.S. (raio de 1km). Não bloqueia o envio do laudo — é só sinal para revisão manual.</p>
          <div class="mo-kpis"><div class="mo-kpi"><span>Laudos no período</span><strong>${k.total}</strong></div><div class="mo-kpi"><span>Suspeitos</span><strong>${k.suspeitos}</strong></div><div class="mo-kpi"><span>Pendentes</span><strong>${k.pendentes}</strong></div><div class="mo-kpi"><span>Revisados</span><strong>${k.revisados}</strong></div><div class="mo-kpi"><span>Sem geolocalização</span><strong>${k.semGeo}</strong></div></div>
          <div class="mo-filter" style="grid-template-columns:200px 260px auto"><input type="date" class="mo-select" data-alertas-data value="${esc(st.alertasFiltroData)}" /><select class="mo-select" data-alertas-coordenacao><option value="">Todas as coordenações</option>${coordenacoes.map(c => `<option value="${esc(c)}" ${st.alertasFiltroCoordenacao === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
          <div class="mo-comp-wrap"><table class="mo-comp-table"><thead><tr><th>Colaborador</th><th>O.S.</th><th>Cliente</th><th>Dist. casa</th><th>Dist. O.S.</th><th>Origem</th><th>Enviado em</th><th>Status</th><th></th></tr></thead><tbody>${linhas.length ? linhas.map(l => `
            <tr>
              <td>${esc(l.colaborador_nome || l.colaborador_key || '—')}</td>
              <td>${esc(l.numero_os || '—')}</td>
              <td>${esc(l.cliente || '—')}</td>
              <td class="num">${l.distancia_casa_km !== null && l.distancia_casa_km !== undefined ? fmtKm(l.distancia_casa_km) : '—'}</td>
              <td class="num">${l.distancia_os_km !== null && l.distancia_os_km !== undefined ? fmtKm(l.distancia_os_km) : '—'}</td>
              <td>${esc(origemLaudoLabel(l.origem))}</td>
              <td>${esc(fmtDataHoraBr(l.enviado_em))}</td>
              <td>${l.revisado_em ? '<span class="mo-pill ok">Revisado</span>' : '<span class="mo-pill bad">Pendente</span>'}</td>
              <td>${l.revisado_em ? '' : `<button class="mo-btn" data-alerta-revisar="${esc(l.id)}">Revisar</button>`}</td>
            </tr>`).join('') : '<tr><td colspan="9" style="text-align:center;padding:20px;color:#94a3b8">Nenhum laudo suspeito no filtro atual.</td></tr>'}</tbody></table></div>
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

  function bind(root) {
    root.querySelectorAll('[data-tab]').forEach(el => { el.onclick = () => { st.tab = el.dataset.tab; render(root); }; });
    root.querySelector('[data-estado]')?.addEventListener('change', e => { st.estado = e.target.value; st.ponto = ''; render(root, true); });
    root.querySelector('[data-ponto]')?.addEventListener('change', e => { st.ponto = e.target.value; render(root, true); });
    root.querySelector('[data-map-base]')?.addEventListener('change', e => { st.mapaBase = TILE_LAYERS[e.target.value] ? e.target.value : 'escuro'; applyBaseLayer(); });
    root.querySelectorAll('[data-toggle-marker]').forEach(el => {
      el.onclick = () => {
        const alvo = el.dataset.toggleMarker;
        if (alvo === 'veiculos') st.mostrarVeiculos = !st.mostrarVeiculos;
        if (alvo === 'colaboradores') st.mostrarColaboradores = !st.mostrarColaboradores;
        if (alvo === 'os-com-saldo') st.mostrarOsComSaldo = !st.mostrarOsComSaldo;
        if (alvo === 'os-sem-saldo') st.mostrarOsSemSaldo = !st.mostrarOsSemSaldo;
        if (alvo === 'hoteis') st.mostrarHoteis = !st.mostrarHoteis;
        if (alvo === 'alojamentos') st.mostrarAlojamentos = !st.mostrarAlojamentos;
        if (alvo === 'irregularidades') st.mostrarIrregularidades = !st.mostrarIrregularidades;
        if (alvo === 'rotas') st.mostrarRotas = !st.mostrarRotas;
        render(root);
      };
    });
    root.querySelectorAll('[data-toggle-colab]').forEach(el => {
      el.onclick = () => {
        const key = el.dataset.toggleColab;
        if (st.colaboradoresExtras.has(key)) st.colaboradoresExtras.delete(key); else st.colaboradoresExtras.add(key);
        render(root);
      };
    });
    root.querySelector('[data-reload]')?.addEventListener('click', () => openHome(root));
    root.querySelector('[data-supervisao-comp]')?.addEventListener('change', e => { st.supervisaoComparativo = e.target.value; render(root); });
    root.querySelector('[data-export-csv]')?.addEventListener('click', () => exportarComparativoCSV());
    root.querySelector('[data-alertas-data]')?.addEventListener('change', e => { st.alertasFiltroData = e.target.value; render(root); });
    root.querySelector('[data-alertas-coordenacao]')?.addEventListener('change', e => { st.alertasFiltroCoordenacao = e.target.value; render(root); });
    root.querySelectorAll('[data-alerta-revisar]').forEach(el => {
      el.onclick = async () => {
        const id = el.dataset.alertaRevisar;
        const obs = window.prompt('Observação da revisão (opcional):', '') ?? '';
        el.disabled = true; el.textContent = 'Salvando...';
        try {
          const user = await getCurrentUser().catch(() => null);
          const revisadoEm = new Date().toISOString();
          const { error } = await supabase.from('operacional_laudos').update({
            revisado_em: revisadoEm,
            revisado_por: user?.id || null,
            revisado_por_nome: user?.email || null,
            observacao_revisao: obs || null,
          }).eq('id', id);
          if (error) throw error;
          const row = st.alertasLaudo.find(l => String(l.id) === String(id));
          if (row) { row.revisado_em = revisadoEm; row.revisado_por_nome = user?.email || null; row.observacao_revisao = obs || null; }
          render(root);
        } catch (err) {
          alert(err.message || 'Não foi possível marcar como revisado.');
          el.disabled = false; el.textContent = 'Revisar';
        }
      };
    });
  }

  async function map(root) {
    const el = root.querySelector('#moMap');
    if (!el) return;
    const ok = await leaflet();
    if (!ok) { el.innerHTML = '<div class="mo-load">Não foi possível carregar o mapa.</div>'; return; }
    if (st.map) { try { st.map.remove(); } catch {} }
    const L = window.L;
    st.map = L.map(el, { center: [-14.235, -51.925], zoom: 4 });
    st.mapEl = el;
    st.tileLayer = null;
    applyBaseLayer();
    st.layer = L.layerGroup().addTo(st.map);
    await draw(root, true);
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
  // Glifos brancos (casinha p/ classificador, carro p/ frota) desenhados dentro do círculo
  // colorido — mesmo espírito do "!" da irregularidade, só um pouco maiores pra caber o desenho.
  const MARKER_GLYPHS = {
    colab: '<svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true"><path fill="#fff" d="M12 3 2 12h3v8h5v-5h4v5h5v-8h3z"/></svg>',
    'colab-fora': '<svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true"><path fill="#fff" d="M12 3 2 12h3v8h5v-5h4v5h5v-8h3z"/></svg>',
    'veic-mov': '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path fill="#fff" d="M4 11l1.4-4.2A2 2 0 0 1 7.3 5.5h9.4a2 2 0 0 1 1.9 1.3L20 11h.5a1.5 1.5 0 0 1 1.5 1.5V16a1 1 0 0 1-1 1h-1.2a2.3 2.3 0 0 1-4.6 0H8.8a2.3 2.3 0 0 1-4.6 0H3a1 1 0 0 1-1-1v-3.5A1.5 1.5 0 0 1 3.5 11z"/></svg>',
    'veic-park': '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path fill="#fff" d="M4 11l1.4-4.2A2 2 0 0 1 7.3 5.5h9.4a2 2 0 0 1 1.9 1.3L20 11h.5a1.5 1.5 0 0 1 1.5 1.5V16a1 1 0 0 1-1 1h-1.2a2.3 2.3 0 0 1-4.6 0H8.8a2.3 2.3 0 0 1-4.6 0H3a1 1 0 0 1-1-1v-3.5A1.5 1.5 0 0 1 3.5 11z"/></svg>',
  };
  function icon(t, selected = false, aproximado = false) {
    const glifo = MARKER_GLYPHS[t];
    if (glifo) return window.L.divIcon({ className: '', html: `<div class="mk mk-ico ${t} ${selected ? 'sel' : ''} ${aproximado ? 'aprox' : ''}">${glifo}</div>`, iconSize: [18, 18], iconAnchor: [9, 9] });
    return window.L.divIcon({ className: '', html: `<div class="mk ${t} ${selected ? 'sel' : ''} ${aproximado ? 'aprox' : ''}"></div>`, iconSize: [13, 13], iconAnchor: [6.5, 6.5] });
  }
  function osPorPonto(ponto) { return st.osTodas.filter(o => o.__pontoKey === ponto.__key); }

  // --- "Só hoje" (item #51) -------------------------------------------
  function osAtenderHojeIds() {
    const hoje = hojeISO();
    return new Set(st.osTodas.filter(o => norm(o.status_gestor) === 'ATENDER' && String(o.data_os || '').slice(0, 10) === hoje).map(o => String(o.id)));
  }
  function osPorPontoRelevante(ponto, hojeIds) {
    const todas = osPorPonto(ponto);
    return hojeIds ? todas.filter(o => hojeIds.has(String(o.id))) : todas;
  }
  // Colaborador "escalado hoje" = tem vínculo (operacional_os_colaboradores) com alguma OS
  // marcada Atender pra hoje. Chave dupla (CPF normalizado e nome normalizado) porque nem todo
  // vínculo tem CPF preenchido.
  function colaboradoresHojeKeys(hojeIds) {
    const keys = new Set();
    for (const [osId, vinc] of st.vinculosPorOs.entries()) {
      if (!hojeIds.has(String(osId))) continue;
      vinc.forEach(v => { if (v.cpf) keys.add(digits(v.cpf)); if (v.nome) keys.add(norm(v.nome)); });
    }
    return keys;
  }
  function colaboradorKey(c) { return c.cpf ? digits(c.cpf) : norm(c.nome); }
  function hotelAtivoHoje(h) {
    if (h.id && st.reservasHotelHoje.porId.has(String(h.id))) return true;
    return st.reservasHotelHoje.porNome.has(`${norm(h.nome)}|${norm(h.cidade)}|${norm(h.uf)}`);
  }

  function veiculoTooltip(v) {
    const estado = v.status === 'em_movimento' ? 'em movimento' : 'parado/estacionado';
    const vel = Number.isFinite(Number(v.velocidade)) ? `${Number(v.velocidade).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} km/h` : 'sem velocidade';
    const motorista = v.motorista ? `<br>${esc(v.motorista)}` : '';
    const quando = v.reportado_em ? `<br>${esc(new Date(v.reportado_em).toLocaleString('pt-BR'))}` : '';
    const endereco = v.endereco ? `<br>${esc(v.endereco)}` : '';
    return `<strong>Veículo: ${esc(v.placa || 'Sem placa')}</strong><br>${esc(estado)} · ${esc(vel)}${motorista}${quando}${endereco}`;
  }

  function drawVeiculos(L, bounds, hojeKeys) {
    // UF extraída do endereço reverso-geocodificado (posição atual do veículo), não da UF de
    // registro/placa — um veículo emplacado em MT pode estar operando em GO agora.
    st.veiculos
      .filter(geo)
      .filter(v => !st.estado || ufDoEndereco(v.endereco) === st.estado)
      // "Frota ativa no dia" (item #51) = motorista dessa posição está entre os colaboradores
      // escalados hoje (vínculo com OS marcada Atender) — mesma chave de nome usada no restante
      // do módulo (calcularTrajetosFrota, avaliação de custo).
      .filter(v => !st.somenteHoje || hojeKeys.has(norm(v.motorista)))
      .forEach(v => {
        L.marker([lat(v), lng(v)], { icon: icon(v.status === 'em_movimento' ? 'veic-mov' : 'veic-park') }).bindTooltip(veiculoTooltip(v)).addTo(st.layer);
        bounds.push([lat(v), lng(v)]);
      });
  }

  function hotelTooltip(h) {
    const diaria = num(h.valor_diaria_individual) ?? num(h.valor_diaria_padrao);
    const preco = diaria !== null ? `${fmtRs(diaria)}/dia` : 'sem diária cadastrada';
    const local = [h.cidade, h.uf].filter(Boolean).join('/');
    return `<strong>Hotel: ${esc(h.nome)}</strong>${local ? `<br>${esc(local)}` : ''}<br>${esc(preco)}`;
  }

  function drawHoteis(L, bounds) {
    st.hoteisComCoord
      .filter(h => !st.estado || norm(h.uf) === norm(st.estado))
      .filter(h => !st.somenteHoje || hotelAtivoHoje(h))
      .forEach(h => {
        L.marker([lat(h), lng(h)], { icon: icon('hotel') }).bindTooltip(hotelTooltip(h)).addTo(st.layer);
        bounds.push([lat(h), lng(h)]);
      });
  }

  function alojamentoTooltip(a) {
    const local = [a.cidade, a.uf].filter(Boolean).join('/');
    return `<strong>Alojamento: ${esc(a.nome)}</strong>${local ? `<br>${esc(local)}` : ''}`;
  }

  // Alojamento é vínculo mensal (não diária) — mostra todos os ativos sempre, sem recorte de dia.
  function drawAlojamentos(L, bounds) {
    st.alojamentosComCoord.filter(a => !st.estado || norm(a.uf) === norm(st.estado)).forEach(a => {
      L.marker([lat(a), lng(a)], { icon: icon('alojamento') }).bindTooltip(alojamentoTooltip(a)).addTo(st.layer);
      bounds.push([lat(a), lng(a)]);
    });
  }

  // Rotas de operacional_mapa_rotas (geradas ao Gestor salvar a Programação, ver
  // operacional-mapa-rotas/index.ts): frota = veículo rastreado, otimizado via VROOM (linha
  // sólida); reembolso_km = colaborador com carro próprio, rota individual (linha tracejada,
  // pedido da usuária pra "aparecer visualmente a diferença").
  function rotaTooltip(r) {
    const quem = r.tipo === 'frota' ? `${esc(r.placa || 'Veículo')}${r.motorista_nome ? ` · ${esc(r.motorista_nome)}` : ''}` : `${esc(r.colaborador_nome || 'Colaborador')} · Reemb. km`;
    const origemLabel = r.origem_tipo === 'hotel' ? 'hotel' : r.origem_tipo === 'alojamento' ? 'alojamento' : 'casa';
    return `<strong>${quem}</strong><br>Origem: ${esc(origemLabel)}<br>${fmtKm(r.km_total_estimado)} · ${Number(r.duracao_estimada_min || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} min`;
  }

  function drawRotas(L, bounds) {
    st.rotasMapa.forEach(r => {
      if (!Number.isFinite(Number(r.origem_latitude)) || !Number.isFinite(Number(r.origem_longitude))) return;
      const pontosRota = [[Number(r.origem_latitude), Number(r.origem_longitude)]];
      (r.paradas || []).forEach(p => {
        if (Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude))) pontosRota.push([Number(p.latitude), Number(p.longitude)]);
      });
      if (pontosRota.length < 2) return;
      const frota = r.tipo === 'frota';
      L.polyline(pontosRota, {
        color: frota ? '#22c55e' : '#f59e0b',
        weight: frota ? 3 : 2.5,
        opacity: 0.85,
        dashArray: frota ? null : '7,6',
      }).bindTooltip(rotaTooltip(r)).addTo(st.layer);
      pontosRota.forEach(p => bounds.push(p));
    });
  }

  function iconIrreg() { return window.L.divIcon({ className: '', html: '<div class="mk-irreg">!</div>', iconSize: [19, 19], iconAnchor: [9.5, 9.5] }); }

  function irregTooltip(i) {
    const dist = Number.isFinite(Number(i.distancia_m)) ? fmtKm(Number(i.distancia_m) / 1000) : '—';
    return `<strong>⚠️ Carga fora do raio · O.S. ${esc(i.os || '—')}</strong><br>${esc(i.cliente || '')}<br>Classificador: ${esc(i.colaborador || '—')}<br>Distância do embarque: ${esc(dist)}<br>${esc(fmtDataBr(i.data_classificacao))}${i.hora_cadastro ? ' ' + esc(i.hora_cadastro) : ''}`;
  }

  // st.ufPorNumeroOs cobre a maioria; quando a OS não está lá (ex.: já finalizada/fora de
  // st.osTodas), cai na coordenada própria do registro de irregularidade.
  function ufDaIrregularidade(i) {
    return st.ufPorNumeroOs.get(String(i.os))
      || ufDaCoordenada(i.lat_os, i.lng_os)
      || ufDaCoordenada(i.lat_lancamento, i.lng_lancamento);
  }

  // Só marca no mapa as irregularidades ainda ABERTAS — resolvidas ficam de registro histórico
  // só na aba de lista, senão o mapa fica poluído com alertas que já foram tratados.
  function drawIrregularidades(L, bounds) {
    st.irregularidades
      .filter(i => norm(i.status) === 'ABERTA' && geo({ latitude: i.lat_lancamento, longitude: i.lng_lancamento }))
      .filter(i => !st.estado || ufDaIrregularidade(i) === st.estado)
      .forEach(i => {
      L.marker([i.lat_lancamento, i.lng_lancamento], { icon: iconIrreg() }).bindTooltip(irregTooltip(i)).addTo(st.layer);
      bounds.push([i.lat_lancamento, i.lng_lancamento]);
      if (geo({ latitude: i.lat_os, longitude: i.lng_os })) {
        L.circle([i.lat_os, i.lng_os], { radius: Number(i.raio_m) || 2000, color: '#f59e0b', weight: 1, fillOpacity: .05 }).addTo(st.layer);
        L.polyline([[i.lat_lancamento, i.lng_lancamento], [i.lat_os, i.lng_os]], { color: '#f59e0b', weight: 1.5, opacity: .5, dashArray: '4 6' }).addTo(st.layer);
        bounds.push([i.lat_os, i.lng_os]);
      }
    });
  }

  async function draw(root, ajustarZoom = false) {
    if (!st.map || !window.L || !st.layer) return;
    const L = window.L, b = [];
    st.layer.clearLayers();
    const pontosVisiveis = st.pontos.filter(p => passaFiltroPonto(p) && p.temCoord);
    // Recorte "Só hoje" (item #51): calculado uma vez por desenho e reaproveitado pelas camadas
    // de OS, veículos e colaboradores — evita recalcular a mesma coisa em cada ponto/marcador.
    const hojeIds = st.somenteHoje ? osAtenderHojeIds() : null;
    const hojeKeys = st.somenteHoje ? colaboradoresHojeKeys(hojeIds) : null;

    if (st.mostrarOsComSaldo || st.mostrarOsSemSaldo) {
      pontosVisiveis.forEach(p => {
        const oss = osPorPontoRelevante(p, hojeIds);
        const comSaldo = oss.filter(o => o.__saldo > 0).length, semSaldo = oss.filter(o => o.__saldo <= 0).length;
        // Sem seleção de rota não há ponto "selecionado" — sel fica sempre false, mas é mantido
        // como token porque os patches de popup (street view) em operacional-rotas-inteligentes.js
        // usam a linha do marcador (com `sel`) como âncora de string-replace.
        const sel = false;
        const aviso = p.aproximado ? ' · <em>posição aproximada (nível de cidade — fazenda/armazém específico não localizado)</em>' : '';
        if (st.mostrarOsComSaldo && comSaldo) {
          L.marker([p.lat, p.lng], { icon: icon('os-ok', sel, p.aproximado) }).bindTooltip(`OS com saldo · ${esc(p.nome_local)} · ${esc(p.cidade)}/${esc(p.uf)} · ${comSaldo} OS${aviso}`).addTo(st.layer);
          b.push([p.lat, p.lng]);
        }
        if (st.mostrarOsSemSaldo && semSaldo) {
          L.marker([p.lat, p.lng], { icon: icon('os-zero', sel, p.aproximado) }).bindTooltip(`OS sem saldo · ${esc(p.nome_local)} · ${esc(p.cidade)}/${esc(p.uf)} · ${semSaldo} OS${aviso}`).addTo(st.layer);
          b.push([p.lat, p.lng]);
        }
      });
    }

    if (st.mostrarVeiculos) drawVeiculos(L, b, hojeKeys);
    if (st.mostrarHoteis) drawHoteis(L, b);
    if (st.mostrarAlojamentos) drawAlojamentos(L, b);
    if (st.mostrarRotas) drawRotas(L, b);
    if (st.mostrarIrregularidades) drawIrregularidades(L, b);

    // Todos os classificadores ativos com coordenada (casa do colaborador), filtrados por estado
    // quando houver — camada de referência de "onde moram os classificadores", sem pareamento.
    // Com "Só hoje" ligado, só os escalados (vínculo com OS Atender hoje) entram normalmente;
    // os demais ficam ocultos a menos que o gestor religue um específico na lista abaixo do
    // mapa (aí entram com ícone vermelho, sinalizando "fora do recorte de hoje").
    if (st.mostrarColaboradores) {
      st.colaboradores
        .filter(geo)
        .filter(c => !st.estado || norm(c.uf_base) === norm(st.estado))
        .forEach(c => {
          const escaladoHoje = !st.somenteHoje || hojeKeys.has(colaboradorKey(c));
          if (!escaladoHoje && !st.colaboradoresExtras.has(colaboradorKey(c))) return;
          const tipo = escaladoHoje ? 'colab' : 'colab-fora';
          const aviso = escaladoHoje ? '' : ' · Não escalado hoje';
          L.marker([lat(c), lng(c)], { icon: icon(tipo) }).bindTooltip(`Classificador: ${esc(c.nome)}${aviso}`).addTo(st.layer);
          b.push([lat(c), lng(c)]);
        });
    }

    // Só ajusta zoom/posição na carga inicial, ao trocar filtro de estado/ponto ou num recarregar
    // explícito — em toggles de legenda o mapa mantém a posição atual do usuário (senão cada
    // clique "pulava" o mapa de volta pro enquadramento geral, parecendo fechar/reabrir).
    if (b.length && ajustarZoom) st.map.fitBounds(b, { padding: [34, 34], maxZoom: st.estado || st.ponto ? 9 : 10 });
  }

  // ajustarZoom=true só na carga inicial/recarregar/troca de filtro geográfico — em interações
  // comuns (toggle de legenda, seleção de linha) o mapa não se move sozinho.
  function render(root, ajustarZoom = false) {
    // Reaproveita a instância do Leaflet já viva (com zoom/posição/tiles carregados) em vez de
    // destruir e recriar a cada render — reencaixa o mesmo nó DOM no HTML novo. Sem isso, toda
    // interação (mesmo ligar/desligar uma legenda) recriava o mapa do zero, "fechando e reabrindo"
    // e voltando pro enquadramento padrão do Brasil.
    // st.mapEl é a referência persistente do container (sobrevive à troca de aba: ao sair do
    // Mapa o nó fica só na memória, sem estar no documento, e volta inteiro ao retornar).
    const mapEl = st.tab === 'mapa' && st.map && st.mapEl ? st.mapEl : null;
    root.innerHTML = html();
    bind(root);
    if (st.tab !== 'mapa') return;
    if (mapEl) {
      root.querySelector('#moMap').replaceWith(mapEl);
      draw(root, ajustarZoom);
      setTimeout(() => st.map?.invalidateSize(), 80);
    } else {
      map(root);
    }
  }
  function renderErro(root, err) { root.innerHTML = `<div class="mo"><section class="mo-card"><div class="mo-load">Não foi possível carregar o mapa operacional.<br><small>${esc(err?.message || err || 'Erro desconhecido')}</small></div></section></div>`; }

  async function openHome(root, opts) {
    css();
    // Escopo por regional: gestor com supervisão/coordenação cadastrada só vê a própria; sem
    // regional (admin/master) vê tudo. adm-operacional.js repassa o userContext do requireAuth()
    // via opts; getCurrentUser() é o fallback (sessão/user_metadata) se aquele não tiver o campo.
    if (!st.minhasRegionaisCarregadas) {
      st.minhasRegionaisCarregadas = true;
      let ctx = opts?.userContext || null;
      if (!getUserField(ctx, 'supervisao', 'user.supervisao', 'coordenacao', 'user.coordenacao')) {
        const authUser = await getCurrentUser().catch(() => null);
        ctx = { ...ctx, user: { ...(ctx?.user || {}), ...(authUser?.user_metadata || {}) } };
      }
      st.minhasRegionais = getMinhasRegionais(ctx);
    }
    // Só monta a casca do zero na primeira vez — num recarregar (botão Atualizar) o mapa já
    // montado continua visível (em qualquer aba) com os dados antigos enquanto os novos chegam,
    // preenchidos em fases por load(root) em vez de sumir numa tela de "carregando" e reaparecer.
    const jaMontado = !!st.map;
    try {
      if (!jaMontado) {
        root.innerHTML = html();
        bind(root);
        if (st.tab === 'mapa') await map(root);
      }
      await load(root);
      render(root, true);
      console.info('[mapa-operacional] carregado', { osComSaldo: st.os.length, pontos: st.pontos.length, colaboradores: st.colaboradores.length, veiculos: st.veiculos.length, comparativo: st.comparativo.length });
    } catch (err) {
      console.error('[mapa-operacional] erro ao carregar:', err);
      renderErro(root, err);
    }
  }

  window.OPERACIONAL = { openHome };
})();
