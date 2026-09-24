// Locais de Serviço que já existem no GRM (grm_locais_servico, espelhada por
// agentes-grm-sync/grmserver-locais-embarque-api.js). A abertura de O.S. só aceita
// Armazém/Local de embarque que esteja nesse cadastro para a UF+cidade escolhidas.
import { supabase } from './supabaseClient.js';

// Mesma normKey do agente (sem acento/pontuação, minúsculas): casa o que foi digitado com o cadastro.
export function chaveLocal(value) {
  return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// Abaixo disso a tabela é considerada não carregada (agente ainda não rodou): a validação é
// ignorada em vez de bloquear toda abertura de O.S. por falta de dados.
const MIN_LOCAIS_TABELA_PRONTA = 1000;

let tabelaPronta = null;
const cache = new Map();

async function tabelaPreenchida() {
  if (tabelaPronta !== null) return tabelaPronta;
  try {
    const { count, error } = await supabase
      .from('grm_locais_servico')
      .select('spl_code', { count: 'exact', head: true })
      .eq('ativo', true);
    tabelaPronta = !error && (count || 0) >= MIN_LOCAIS_TABELA_PRONTA;
  } catch {
    tabelaPronta = false;
  }
  return tabelaPronta;
}

// Locais ativos do GRM na UF+cidade: [{ nome_local, tipo_local }]. Lança se a consulta falhar.
export async function locaisDaCidade(uf, cidade) {
  const ufKey = String(uf || '').trim().toUpperCase();
  const cidadeKey = chaveLocal(cidade);
  if (!ufKey || !cidadeKey) return [];
  const key = `${ufKey}|${cidadeKey}`;
  if (cache.has(key)) return cache.get(key);
  const { data, error } = await supabase
    .from('grm_locais_servico')
    .select('nome_local,tipo_local,nome_norm')
    .eq('ativo', true)
    .eq('uf', ufKey)
    .eq('cidade_norm', cidadeKey)
    .order('nome_local', { ascending: true })
    .limit(2000);
  if (error) throw error;
  const rows = data || [];
  cache.set(key, rows);
  return rows;
}

// { ok:true } quando o local existe no GRM (ou a validação não se aplica); { ok:false, motivo } caso contrário.
export async function validarLocalEmbarque({ uf, cidade, nome }) {
  if (!(await tabelaPreenchida())) return { ok: true, ignorada: true };
  let locais;
  try {
    locais = await locaisDaCidade(uf, cidade);
  } catch (error) {
    console.warn('[locais-servico] não foi possível validar o local (seguindo sem bloquear):', error?.message || error);
    return { ok: true, ignorada: true };
  }
  const alvo = chaveLocal(nome);
  if (alvo && locais.some((l) => l.nome_norm === alvo)) return { ok: true };
  if (!locais.length) {
    return { ok: false, motivo: `Não há nenhum Local de Serviço cadastrado no GRM em ${cidade}/${uf}. A O.S. só pode ser aberta em um local que já existe — solicite o cadastro do local no GRM antes.` };
  }
  return { ok: false, motivo: `"${nome}" não existe no cadastro de Locais de Serviço do GRM em ${cidade}/${uf}. Escolha um dos locais da lista (${locais.length} disponíveis nesta cidade). A O.S. só pode ser aberta em local já cadastrado.` };
}

function escHtml(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Popula o <select> de Armazém de embarque com os locais existentes da cidade (só dá para escolher
// um deles). Mantém a escolha anterior — ou o valor pendente (dataset.desejado) deixado pela leitura
// de documento/correção enquanto a lista ainda carregava — quando ela existe na lista.
export function preencherSelectLocais(select, locais, placeholderVazio) {
  const desejado = select.value || select.dataset.desejado || '';
  const vistos = new Set();
  const nomes = [];
  locais.forEach((l) => {
    if (vistos.has(l.nome_norm)) return; // homônimos no mesmo município: uma opção só
    vistos.add(l.nome_norm);
    nomes.push(l.nome_local);
  });
  const placeholder = nomes.length ? 'Selecione ou digite para buscar o local' : placeholderVazio;
  select.innerHTML = `<option value="">${escHtml(placeholder)}</option>`
    + nomes.map((n) => `<option value="${escHtml(n)}">${escHtml(n)}</option>`).join('');
  select.disabled = false; // cidade sem locais continua clicável: dá para cadastrar um novo local
  delete select.dataset.desejado;

  const alvo = chaveLocal(desejado);
  if (!alvo) return;
  let achado = nomes.find((n) => chaveLocal(n) === alvo);
  if (!achado && alvo.length >= 6) {
    const parecidos = nomes.filter((n) => { const k = chaveLocal(n); return k.includes(alvo) || alvo.includes(k); });
    if (parecidos.length === 1) achado = parecidos[0]; // só aceita aproximação quando é inequívoca
  }
  if (achado) {
    select.value = achado;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

// ---------------------------------------------------------------------------
// Local de destino: o usuário vê/digita só o LOCAL (texto livre, com sugestões do histórico da
// UF+cidade de destino). O valor gravado continua no formato que o agente do GRM espera
// ("UF - CIDADE (LOCAL)", ver extrairLocalPadrao em grmserver-abrir-os-api.js).
// ---------------------------------------------------------------------------
// Aceita os formatos que existem no histórico: "UF - CIDADE (LOCAL)", "UF - CIDADE - LOCAL" e
// "CIDADE - UF - LOCAL". Devolve null quando não há local no texto (ex.: só "CIDADE - UF").
export function parseDestino(texto) {
  let p = parseDestinoUmaVez(texto);
  // Há registros com UF/cidade repetidas dentro do local ("BA - CANDEIAS (BA - CANDEIAS - SC PORTO)"):
  // desce enquanto o interior repetir a mesma UF+cidade.
  for (let i = 0; p && i < 3; i += 1) {
    const q = parseDestinoUmaVez(p.local);
    if (!q || q.uf !== p.uf || chaveLocal(q.cidade) !== chaveLocal(p.cidade)) break;
    p = { ...p, local: q.local };
  }
  return p;
}

function parseDestinoUmaVez(texto) {
  const t = String(texto ?? '').trim();
  let m = t.match(/^([A-Za-z]{2})\s+-\s+([^()]+?)\s*\((.+)\)\s*$/);
  if (m && !/\s-\s/.test(m[2])) return { uf: m[1].toUpperCase(), cidade: m[2].trim(), local: m[3].trim() };
  m = t.match(/^([A-Za-z]{2})\s+-\s+(.+?)\s+-\s+(.+)$/);
  if (m) return { uf: m[1].toUpperCase(), cidade: m[2].trim(), local: m[3].trim() };
  m = t.match(/^(.+?)\s+-\s+([A-Za-z]{2})\s+-\s+(.+)$/);
  if (m) return { uf: m[2].toUpperCase(), cidade: m[1].trim(), local: m[3].trim() };
  return null;
}

// Só o local, sem UF/cidade (o que aparece no campo).
export function localSemUfCidade(texto) {
  return parseDestino(texto)?.local ?? String(texto ?? '').trim();
}

// Valor gravado em local_destino: "UF - CIDADE (LOCAL)".
export function comporLocalDestino(uf, cidade, local) {
  const nome = localSemUfCidade(local);
  if (!nome) return '';
  return `${String(uf || '').trim().toUpperCase()} - ${String(cidade || '').trim().toUpperCase()} (${nome})`;
}

// Locais já usados como destino na UF+cidade (sem repetir, ignorando acento/caixa).
export function sugestoesLocaisDestino(historico, uf, cidade) {
  const ufKey = String(uf || '').trim().toUpperCase();
  const cidadeKey = chaveLocal(cidade);
  if (!ufKey || !cidadeKey) return [];
  const vistos = new Map();
  (historico || []).forEach((valor) => {
    const p = parseDestino(valor);
    if (!p || p.uf !== ufKey || chaveLocal(p.cidade) !== cidadeKey) return;
    const k = chaveLocal(p.local);
    if (k && !vistos.has(k)) vistos.set(k, p.local);
  });
  return [...vistos.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

// ---------------------------------------------------------------------------
// "Você quis dizer...?": tolera erro de digitação no Armazém de embarque.
// ---------------------------------------------------------------------------
// Distância de edição com transposição (Damerau/OSA): "cvael" -> "cvale" custa 1.
function distanciaEdicao(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) d[i][0] = i;
  for (let j = 0; j <= n; j += 1) d[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + custo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}

// Melhor sugestão entre os locais da cidade para o texto digitado, ou null. Compara sem acento,
// caixa e pontuação ("CVale" ~ "C.VALE"), com a "marca" (texto antes de " - ", ex.: "C.VALE" de
// "C.VALE - RIO BRILHANTE"), com o nome inteiro e com cada palavra do nome. Devolve a marca quando
// ela é o que casou — o usuário então escolhe a filial na lista.
export function sugerirLocal(query, nomes) {
  const q = chaveLocal(query);
  if (q.length < 3) return null;
  const limite = Math.max(1, Math.floor(q.length * 0.34));
  let melhor = null;
  const considerar = (texto, chave, peso) => {
    if (!chave) return;
    // Inteiro, ou só o começo (usuário digitou o início do nome).
    let d = distanciaEdicao(q, chave);
    if (chave.length > q.length) d = Math.min(d, distanciaEdicao(q, chave.slice(0, q.length)) + 0.5);
    if (d > limite) return;
    const nota = d + peso;
    if (!melhor || nota < melhor.nota || (nota === melhor.nota && texto.length < melhor.texto.length)) melhor = { texto, nota };
  };
  for (const nome of nomes) {
    const marca = String(nome).split(' - ')[0].trim();
    considerar(marca, chaveLocal(marca), 0);
    if (marca !== nome) considerar(nome, chaveLocal(nome), 0.2);
    String(nome).split(/[^A-Za-z0-9]+/).filter((w) => w.length >= 4).forEach((w) => {
      // Palavra que casou está na marca? sugere a marca (o usuário escolhe a filial); senão o nome todo.
      considerar(chaveLocal(marca).includes(chaveLocal(w)) ? marca : nome, chaveLocal(w), 0.4);
    });
  }
  return melhor ? melhor.texto : null;
}

// ---------------------------------------------------------------------------
// Novo local de embarque: proximidade (raio de 2 km) e centro da cidade para o mapa.
// ---------------------------------------------------------------------------
export const RAIO_PROXIMIDADE_KM = 2;

export function distanciaKm(lat1, lon1, lat2, lon2) {
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

// Locais (do GRM e novos pendentes) dentro do raio, do mais perto para o mais longe.
export async function locaisProximos(lat, lng, raioKm = RAIO_PROXIMIDADE_KM) {
  const dLat = raioKm / 111.32;
  const dLng = raioKm / (111.32 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  const caixa = (q) => q.gte('latitude', lat - dLat).lte('latitude', lat + dLat).gte('longitude', lng - dLng).lte('longitude', lng + dLng);
  const [grm, novos] = await Promise.all([
    caixa(supabase.from('grm_locais_servico').select('spl_code,nome_local,uf,cidade,latitude,longitude').eq('ativo', true)).limit(300),
    caixa(supabase.from('logistica_locais_embarque_novos').select('id,nome_local,uf,cidade,latitude,longitude').eq('status', 'PENDENTE')).limit(100),
  ]);
  if (grm.error) throw grm.error;
  const linhas = [
    ...(grm.data || []).map((r) => ({ ...r, novo: false })),
    ...(novos.error ? [] : (novos.data || []).map((r) => ({ ...r, novo: true }))),
  ];
  return linhas
    .map((r) => ({ ...r, km: distanciaKm(lat, lng, Number(r.latitude), Number(r.longitude)) }))
    .filter((r) => r.km <= raioKm)
    .sort((a, b) => a.km - b.km);
}

// Contorno oficial do município (malha do IBGE, GeoJSON) para enquadrar o mapa na cidade escolhida.
// Os locais do GRM ficam espalhados pelo município e arredores (fazendas), então a média das coordenadas
// deles NÃO é o centro da cidade — o contorno é a referência correta. Devolve null se o IBGE não responder.
const municipiosPorUf = new Map();
const malhaPorCidade = new Map();

export async function limitesDaCidade(uf, cidade) {
  const ufKey = String(uf || '').trim().toUpperCase();
  const cidadeKey = chaveLocal(cidade);
  if (!ufKey || !cidadeKey) return null;
  const key = `${ufKey}|${cidadeKey}`;
  if (malhaPorCidade.has(key)) return malhaPorCidade.get(key);
  let geo = null;
  try {
    if (!municipiosPorUf.has(ufKey)) {
      const resp = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${ufKey}/municipios`);
      municipiosPorUf.set(ufKey, await resp.json());
    }
    const municipio = (municipiosPorUf.get(ufKey) || []).find((m) => chaveLocal(m.nome) === cidadeKey);
    if (municipio) {
      const resp = await fetch(`https://servicodados.ibge.gov.br/api/v3/malhas/municipios/${municipio.id}?formato=application/vnd.geo+json&qualidade=intermediaria`);
      if (resp.ok) geo = await resp.json();
    }
  } catch (error) {
    console.warn('[novo-local] não foi possível obter o contorno da cidade no IBGE', error);
  }
  if (geo) malhaPorCidade.set(key, geo); // só guarda sucesso: falha de rede pode ser tentada de novo
  return geo;
}

const mediana = (nums) => {
  const v = nums.slice().sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

// Plano B quando não há contorno: mediana (não a média, que as fazendas distantes puxam) dos locais do
// GRM com coordenada na cidade; senão geocodifica "cidade, UF" (OpenStreetMap/Nominatim); senão null.
export async function centroDaCidade(uf, cidade) {
  try {
    const { data } = await supabase
      .from('grm_locais_servico')
      .select('latitude,longitude')
      .eq('ativo', true).eq('uf', String(uf || '').toUpperCase()).eq('cidade_norm', chaveLocal(cidade))
      .not('latitude', 'is', null)
      .limit(200);
    if (data && data.length) {
      return { lat: mediana(data.map((r) => Number(r.latitude))), lng: mediana(data.map((r) => Number(r.longitude))), zoom: 11 };
    }
  } catch { /* segue para o geocoder */ }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(`${cidade}, ${uf}, Brasil`)}`, { signal: ctrl.signal });
    clearTimeout(timer);
    const arr = await resp.json();
    if (Array.isArray(arr) && arr[0]) return { lat: Number(arr[0].lat), lng: Number(arr[0].lon), zoom: 12 };
  } catch { /* sem centro */ }
  return null;
}
