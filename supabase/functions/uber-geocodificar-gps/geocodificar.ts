// Cadeia de geocodificação do endereço de partida/destino da corrida Uber:
//   1. Nominatim (OSM) com consultas montadas a partir do endereço interpretado;
//   2. Photon (OSM, outro índice) quando há nome de rua;
// Sem fallback por CEP: as bases de CEP→coordenada testadas erram vários km em
// algumas cidades, e um ponto errado pode validar corrida sozinha por engano.
// Sem dependência de Deno/Supabase para poder ser testado em Node.
import {
  candidatosBusca,
  ehCodigoRodovia,
  cidadeCompativel,
  interpretarEndereco,
  normKey,
  rankMinimo,
  temLocalEspecifico,
  ufDoResultado,
  type Candidato,
  type EnderecoInterpretado,
  viaCompativel,
} from './endereco.ts';

export type Precisao = 'endereco' | 'rua' | 'bairro';
export type GeoResult = {
  lat: number;
  lng: number;
  display: string;
  query: string;
  provider: 'nominatim' | 'photon' | 'cache' | 'banco';
  precisao: Precisao;
};
export type GeoSearch = {
  result: GeoResult | null;
  error: string | null;
  definitive: boolean; // false = falha transitória (não vale cachear como "não existe")
  motivo?: string; // 'endereco_incompleto' quando não há o que procurar
  tentativas?: string[];
};

export type Opcoes = {
  /** Chamada antes de cada requisição a Nominatim/Photon (respeita 1 req/s). */
  aguardar: () => Promise<void>;
  fetchFn?: typeof fetch;
  userAgent?: string;
  email?: string;
};

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const PHOTON_BASE = 'https://photon.komoot.io/api/';
const TIMEOUT_MS = 12000;

function ehBrasil(v: unknown): boolean {
  const pais = normKey(v);
  return !pais || pais === 'br' || pais === 'brasil' || pais === 'brazil';
}

async function nominatimSearch(cand: Candidato, info: EnderecoInterpretado, o: Opcoes): Promise<GeoSearch> {
  const f = o.fetchFn ?? fetch;
  try {
    const qs = new URLSearchParams({
      q: cand.query,
      format: 'jsonv2',
      limit: '5',
      countrycodes: 'br',
      addressdetails: '1',
    });
    if (o.email) qs.set('email', o.email);
    const res = await f(`${NOMINATIM_BASE}?${qs.toString()}`, {
      headers: { 'User-Agent': o.userAgent || 'PainelGrao1000/1.0', 'Accept-Language': 'pt-BR' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { result: null, error: `Nominatim HTTP ${res.status}`, definitive: false };
    const data = await res.json();
    const itens: any[] = Array.isArray(data) ? data : [];
    const minimo = rankMinimo(cand.nivel);
    const item = itens.find((it) => {
      const lat = Number(it?.lat);
      const lng = Number(it?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
      if (Number(it?.place_rank) < minimo) return false; // centro de cidade/região não serve
      const ufResultado = ufDoResultado(it?.address);
      if (info.uf && ufResultado && ufResultado !== info.uf) return false;
      const a = it?.address || {};
      if (!cidadeCompativel(info.cidade, a.city, a.town, a.village, a.municipality, a.county)) return false;
      if (!info.rua || ehCodigoRodovia(info.rua)) return true;
      // A rua pode vir no campo de via ou no nome do resultado (quando o resultado é a própria rua).
      const via = String([a.road, a.pedestrian, a.footway, a.path, a.cycleway].find(Boolean) || '');
      const nome = String(it?.name || '');
      if (!via && !nome) return true; // sem nome devolvido: não rejeita
      return (via !== '' && viaCompativel(info.rua, via)) || (nome !== '' && viaCompativel(info.rua, nome));
    });
    if (!item) return { result: null, error: null, definitive: true };
    return {
      result: {
        lat: Number(item.lat),
        lng: Number(item.lon),
        display: String(item.display_name || '').trim(),
        query: cand.query,
        provider: 'nominatim',
        precisao: cand.nivel,
      },
      error: null,
      definitive: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { result: null, error: `Falha ao consultar Nominatim: ${message}`, definitive: false };
  }
}

async function photonSearch(cand: Candidato, info: EnderecoInterpretado, o: Opcoes): Promise<GeoSearch> {
  const f = o.fetchFn ?? fetch;
  try {
    const qs = new URLSearchParams({ q: cand.query, limit: '5' });
    const res = await f(`${PHOTON_BASE}?${qs.toString()}`, {
      headers: { 'User-Agent': o.userAgent || 'PainelGrao1000/1.0', 'Accept-Language': 'pt-BR' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { result: null, error: `Photon HTTP ${res.status}`, definitive: false };
    const data = await res.json();
    const features: any[] = Array.isArray(data?.features) ? data.features : [];
    const feature = features.find((ft) => {
      const p = ft?.properties || {};
      const coords = ft?.geometry?.coordinates;
      if (!Array.isArray(coords) || !Number.isFinite(Number(coords[0])) || !Number.isFinite(Number(coords[1]))) return false;
      if (!['house', 'street'].includes(String(p.type))) return false;
      if (!ehBrasil(p.countrycode || p.country)) return false;
      if (!cidadeCompativel(info.cidade, p.city, p.locality, p.county, p.district)) return false;
      const via = String((p.type === 'street' ? p.name : p.street) || '');
      return via !== '' && viaCompativel(info.rua, via); // sem nome de rua não dá pra conferir: recusa
    });
    if (!feature) return { result: null, error: null, definitive: true };
    const p = feature.properties || {};
    const display = [p.name, p.street, p.city, p.state, p.postcode, p.country]
      .filter(Boolean).filter((v, i, all) => all.indexOf(v) === i).join(', ');
    return {
      result: {
        lat: Number(feature.geometry.coordinates[1]),
        lng: Number(feature.geometry.coordinates[0]),
        display,
        query: cand.query,
        provider: 'photon',
        precisao: cand.nivel,
      },
      error: null,
      definitive: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { result: null, error: `Falha ao consultar Photon: ${message}`, definitive: false };
  }
}

export async function geocodificarEndereco(endereco: string, o: Opcoes): Promise<GeoSearch> {
  const info = interpretarEndereco(endereco);
  if (!temLocalEspecifico(info)) {
    // Só cidade/UF/CEP: o ponto seria o centro da cidade, que não serve pra validar por raio.
    return { result: null, error: null, definitive: true, motivo: 'endereco_incompleto' };
  }

  const candidatos = candidatosBusca(info);
  const tentativas: string[] = [];
  let ultimoErro: string | null = null;
  let transitorio = false;

  for (const cand of candidatos) {
    await o.aguardar();
    tentativas.push(`nominatim: ${cand.query}`);
    const r = await nominatimSearch(cand, info, o);
    if (r.result) return { ...r, tentativas };
    if (r.error) { ultimoErro = r.error; transitorio = true; break; } // bloqueio/limite: não insiste nos demais
  }

  if (info.rua && !ehCodigoRodovia(info.rua)) {
    for (const cand of candidatos.filter((c) => c.nivel !== 'bairro')) {
      await o.aguardar();
      tentativas.push(`photon: ${cand.query}`);
      const r = await photonSearch(cand, info, o);
      if (r.result) return { ...r, tentativas };
      if (r.error) { ultimoErro = r.error; transitorio = true; break; }
    }
  }

  return { result: null, error: ultimoErro, definitive: !transitorio, tentativas };
}
