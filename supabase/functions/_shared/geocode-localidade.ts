// Geocodificação de localidades (cidade, local de embarque de O.S., CEP) usada pelas Edge
// Functions geocode-operacional-os, geocode-colaboradores e geocode-colaborador-base.
//
// Provedor principal: Nominatim (OSM). Em 06/10/2026 ele passou a responder HTTP 403 "Access
// denied" ao IP de saída das Edge Functions do Supabase (o Photon, também OSM, responde 200 do
// mesmo IP, ~5 s por consulta). Por isso:
//   - 403/429/5xx/timeout NÃO são "endereço não encontrado": viram falha transitória, que quem
//     chama NÃO grava em geocode_cache (antes o 403 virava status 'erro' e escondia a localidade
//     por 7 dias);
//   - quando o Nominatim recusa o servidor (403/429), o Photon assume a busca de cidade (e, com
//     validação rígida de nome/cidade/UF, do local de embarque). O bloqueio é lembrado por 10 min
//     (`estado`) pra não gastar uma requisição por localidade a mais;
//   - CEP não tem equivalente no Photon: sem o Nominatim só resta o ponto da cidade.
// Sem dependência de Deno/Supabase para poder ser testado em Node.

export const UF_NOME: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará',
  DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso',
  MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná',
  PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo',
  SE: 'Sergipe', TO: 'Tocantins',
};

export type GeoPonto = { lat: number; lng: number; display: string; provider: 'nominatim' | 'photon' };

/** Resposta de UMA consulta a um provedor. */
export type Busca =
  | { tipo: 'ok'; ponto: GeoPonto }
  | { tipo: 'nao_encontrado' } // o provedor respondeu e não há resultado aceitável
  | { tipo: 'indisponivel'; motivo: string; bloqueado: boolean }; // 403/429 (bloqueado) / 5xx / timeout

/** Desfecho de uma localidade (pode juntar várias consultas). */
export type Resultado = {
  ponto: GeoPonto | null;
  /** Sem ponto: true = resposta definitiva ("não existe", vale gravar 'erro' no cache);
   *  false = falha transitória (NÃO gravar no cache, tentar de novo na próxima execução). */
  conclusivo: boolean;
  motivo?: string;
  tentativas: string[];
};

/** Estado compartilhado entre chamadas de um mesmo processo (quem chama guarda o objeto). */
export type EstadoProvedores = { nominatimIndisponivelAte: number; bloqueado: boolean; motivo: string };
export const estadoCompartilhado: EstadoProvedores = { nominatimIndisponivelAte: 0, bloqueado: false, motivo: '' };

const BLOQUEIO_MS = 10 * 60 * 1000; // 403/429: o IP está barrado, não adianta insistir
const FALHA_MS = 60 * 1000; // 5xx/timeout: dá um respiro

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const PHOTON_BASE = 'https://photon.komoot.io/api/';

export type Opcoes = {
  userAgent: string;
  fetchFn?: typeof fetch;
  /** Intervalo mínimo entre requisições (política do Nominatim: 1 req/s). */
  delayMs?: number;
  /** Tempo máximo de cada requisição ao Nominatim. */
  timeoutMs?: number;
  /** Idem ao Photon (mais lento: 5-12 s a partir do Supabase). */
  photonTimeoutMs?: number;
  /** Epoch ms: nenhuma requisição ultrapassa isso (o pg_cron desiste da chamada em 60 s). */
  prazoAte?: number;
  estado?: EstadoProvedores;
  agora?: () => number;
  dormir?: (ms: number) => Promise<void>;
};

export function normKey(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function distanciaEdicao(a: string, b: string): number {
  const linha = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let anterior = linha[0];
    linha[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const guardado = linha[j];
      linha[j] = Math.min(linha[j] + 1, linha[j - 1] + 1, anterior + (a[i - 1] === b[j - 1] ? 0 : 1));
      anterior = guardado;
    }
  }
  return linha[b.length];
}

/**
 * Mesmo nome de cidade, tolerando só acento, caixa e pontuação. Sem tolerância de grafia: municípios
 * vizinhos diferem por uma letra (Formosa x Formoso, ambos em GO) e o ponto errado ficaria no cache.
 */
export function nomeCompativel(esperado: unknown, obtido: unknown): boolean {
  const a = normKey(esperado);
  return a !== '' && a === normKey(obtido);
}

function estadoCompativel(uf: string, estado: unknown): boolean {
  const nome = UF_NOME[String(uf || '').toUpperCase()];
  return Boolean(nome) && normKey(nome) === normKey(estado);
}

function coordsValidas(ft: any): boolean {
  const c = ft?.geometry?.coordinates;
  return Array.isArray(c) && Number.isFinite(Number(c[0])) && Number.isFinite(Number(c[1]));
}

/** O cadastro costuma repetir a cidade no fim do nome do local: "FAZENDA X - CIDADE". */
export function limparLocal(local: string, cidade: string): string {
  const partes = String(local || '').split(/\s+-\s+/).map((s) => s.trim()).filter(Boolean);
  while (partes.length > 1 && nomeCompativel(cidade, partes[partes.length - 1])) partes.pop();
  return partes.join(' - ');
}

const PALAVRAS_SOLTAS_LOCAL = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

function tokensDoLocal(valor: string): string[] {
  return normKey(valor).split(' ').filter((t) => t.length >= 3 && !PALAVRAS_SOLTAS_LOCAL.has(t));
}

/**
 * O resultado do Photon é o local pedido? Exige país/UF/cidade corretos (todos presentes e
 * batendo — "sem informação" aqui recusa) e TODAS as palavras do nome do local no nome do
 * resultado ("Fazenda Sete Campos" não aceita "Fazenda Rio Preto").
 */
export function photonEhOLocal(ft: any, local: string, cidade: string, uf: string): boolean {
  const p = ft?.properties || {};
  if (!coordsValidas(ft)) return false;
  if (String(p.countrycode || '').toUpperCase() !== 'BR') return false;
  if (!estadoCompativel(uf, p.state)) return false;
  if (![p.city, p.county, p.district, p.locality].some((v) => nomeCompativel(cidade, v))) return false;
  const esperados = tokensDoLocal(limparLocal(local, cidade));
  if (!esperados.length) return false;
  const obtidos = tokensDoLocal(String(p.name || ''));
  return esperados.every((t) => obtidos.some((o) => o === t || (t.length >= 5 && distanciaEdicao(t, o) <= 1)));
}

/** O resultado do Photon é a própria cidade (município)? */
export function photonEhACidade(ft: any, cidade: string, uf: string): boolean {
  const p = ft?.properties || {};
  if (!coordsValidas(ft)) return false;
  if (String(p.countrycode || '').toUpperCase() !== 'BR') return false;
  if (p.type !== 'city') return false;
  return nomeCompativel(cidade, p.name) && estadoCompativel(uf, p.state);
}

export type Embarque = { uf: string; cidade: string; local: string };

/**
 * Ordem aleatória (Fisher–Yates) pra fila de pendentes. Falha transitória não grava nada no
 * cache, então uma localidade que o provedor nunca resolve voltaria sempre à frente da fila e
 * gastaria o prazo da execução; embaralhando, ela não impede as demais de andar.
 */
export function embaralhar<T>(lista: T[], aleatorio: () => number = Math.random): T[] {
  const r = [...lista];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

export function criarGeocodificador(o: Opcoes) {
  const delayMs = o.delayMs ?? 1100;
  const timeoutMs = o.timeoutMs ?? 12000;
  const photonTimeoutMs = o.photonTimeoutMs ?? 20000;
  const estado = o.estado ?? estadoCompartilhado;
  const agora = o.agora ?? (() => Date.now());
  const dormir = o.dormir ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const headers = { 'User-Agent': o.userAgent, 'Accept-Language': 'pt-BR' };
  const memoCidade = new Map<string, Promise<Resultado>>();
  let ultimaChamada = 0;

  async function aguardar() {
    const espera = ultimaChamada + delayMs - agora();
    if (espera > 0) await dormir(espera);
    ultimaChamada = agora();
  }

  const SEM_PRAZO = 'prazo da execução esgotado';

  /** Timeout da próxima requisição respeitando o prazo da execução; null = não sobrou tempo. */
  function timeoutRestante(maximo: number): number | null {
    if (o.prazoAte === undefined) return maximo;
    const resto = o.prazoAte - agora();
    return resto < 2000 ? null : Math.min(maximo, resto);
  }

  function nominatimForaDoAr(): boolean {
    return agora() < estado.nominatimIndisponivelAte;
  }

  async function nominatim(params: Record<string, string>): Promise<Busca> {
    if (nominatimForaDoAr()) return { tipo: 'indisponivel', motivo: estado.motivo, bloqueado: estado.bloqueado };
    await aguardar();
    const limite = timeoutRestante(timeoutMs);
    if (limite === null) return { tipo: 'indisponivel', motivo: SEM_PRAZO, bloqueado: false };
    const f = o.fetchFn ?? fetch;
    try {
      const qs = new URLSearchParams({ ...params, format: 'jsonv2', limit: '1' });
      const res = await f(`${NOMINATIM_BASE}?${qs.toString()}`, { headers, signal: AbortSignal.timeout(limite) });
      if (res.status === 403 || res.status === 429) {
        estado.nominatimIndisponivelAte = agora() + BLOQUEIO_MS;
        estado.bloqueado = true;
        estado.motivo = `Nominatim HTTP ${res.status} (bloqueou este servidor)`;
        return { tipo: 'indisponivel', motivo: estado.motivo, bloqueado: true };
      }
      if (!res.ok) {
        estado.nominatimIndisponivelAte = agora() + FALHA_MS;
        estado.bloqueado = false;
        estado.motivo = `Nominatim HTTP ${res.status}`;
        return { tipo: 'indisponivel', motivo: estado.motivo, bloqueado: false };
      }
      const data = await res.json();
      const item = Array.isArray(data) ? data[0] : null;
      if (!item) return { tipo: 'nao_encontrado' };
      const lat = Number(item.lat);
      const lng = Number(item.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { tipo: 'nao_encontrado' };
      return { tipo: 'ok', ponto: { lat, lng, display: String(item.display_name ?? '').trim(), provider: 'nominatim' } };
    } catch (error) {
      estado.nominatimIndisponivelAte = agora() + FALHA_MS;
      estado.bloqueado = false;
      estado.motivo = `Falha ao consultar Nominatim: ${error instanceof Error ? error.message : String(error)}`;
      return { tipo: 'indisponivel', motivo: estado.motivo, bloqueado: false };
    }
  }

  async function photon(q: string, aceitar: (ft: any) => boolean, display: (p: any) => string): Promise<Busca> {
    await aguardar();
    const limite = timeoutRestante(photonTimeoutMs);
    if (limite === null) return { tipo: 'indisponivel', motivo: SEM_PRAZO, bloqueado: false };
    const f = o.fetchFn ?? fetch;
    try {
      const qs = new URLSearchParams({ q, limit: '8' });
      const res = await f(`${PHOTON_BASE}?${qs.toString()}`, { headers, signal: AbortSignal.timeout(limite) });
      if (!res.ok) return { tipo: 'indisponivel', motivo: `Photon HTTP ${res.status}`, bloqueado: false };
      const data = await res.json();
      const features: any[] = Array.isArray(data?.features) ? data.features : [];
      const ft = features.find(aceitar);
      if (!ft) return { tipo: 'nao_encontrado' };
      return {
        tipo: 'ok',
        ponto: {
          lat: Number(ft.geometry.coordinates[1]),
          lng: Number(ft.geometry.coordinates[0]),
          display: display(ft.properties || {}),
          provider: 'photon',
        },
      };
    } catch (error) {
      return { tipo: 'indisponivel', motivo: `Falha ao consultar Photon: ${error instanceof Error ? error.message : String(error)}`, bloqueado: false };
    }
  }

  const displayCidade = (p: any) => [p.name, p.state, p.country].filter(Boolean).join(', ');
  const displayLocal = (p: any) =>
    [p.name, p.street, p.city, p.state, p.country].filter(Boolean).filter((v, i, all) => all.indexOf(v) === i).join(', ');

  const achou = (ponto: GeoPonto, tentativas: string[]): Resultado => ({ ponto, conclusivo: true, tentativas });
  const definitivo = (tentativas: string[]): Resultado => ({ ponto: null, conclusivo: true, tentativas });
  const transitorio = (motivo: string | undefined, tentativas: string[]): Resultado => ({ ponto: null, conclusivo: false, motivo, tentativas });

  /** Ponto da cidade: Nominatim (centroide do município); se ele recusa o servidor, Photon. */
  function cidade(c: { cidade: string; uf: string }, paramsNominatim: Record<string, string> = { countrycodes: 'br' }): Promise<Resultado> {
    const chave = `${normKey(c.uf)}|${normKey(c.cidade)}|${JSON.stringify(paramsNominatim)}`;
    const memo = memoCidade.get(chave);
    if (memo) return memo;
    const promessa = (async (): Promise<Resultado> => {
      const tentativas: string[] = [`nominatim: cidade ${c.cidade}/${c.uf}`];
      const n = await nominatim({ ...paramsNominatim, city: c.cidade, state: c.uf });
      if (n.tipo === 'ok') return achou(n.ponto, tentativas);
      if (n.tipo === 'nao_encontrado') return definitivo(tentativas);
      // Nominatim fora do ar: só o bloqueio (403/429) justifica trocar de provedor.
      if (!n.bloqueado) return transitorio(n.motivo, tentativas);
      const nome = UF_NOME[c.uf.toUpperCase()] || c.uf;
      tentativas.push(`photon: cidade ${c.cidade}/${c.uf}`);
      const p = await photon(`${c.cidade}, ${nome}, Brasil`, (ft) => photonEhACidade(ft, c.cidade, c.uf), displayCidade);
      if (p.tipo === 'ok') return achou(p.ponto, tentativas);
      // Sem o Nominatim a resposta "não achei" vale pouco: não vira cache de "inexistente".
      return transitorio(p.tipo === 'indisponivel' ? p.motivo : `${n.motivo}; Photon não achou a cidade`, tentativas);
    })();
    memoCidade.set(chave, promessa);
    return promessa;
  }

  /** Local de embarque ("Fazenda X"): Nominatim; se ele recusa o servidor, Photon com validação rígida. */
  async function local(e: Embarque): Promise<Resultado> {
    const consulta = `${e.local}, ${e.cidade}, ${e.uf}, Brasil`;
    const tentativas: string[] = [`nominatim: ${consulta}`];
    const n = await nominatim({ countrycodes: 'br', q: consulta });
    if (n.tipo === 'ok') return achou(n.ponto, tentativas);
    if (n.tipo === 'nao_encontrado') return definitivo(tentativas);
    if (!n.bloqueado) return transitorio(n.motivo, tentativas);
    const nome = UF_NOME[e.uf.toUpperCase()] || e.uf;
    const q = `${limparLocal(e.local, e.cidade)}, ${e.cidade}, ${nome}, Brasil`;
    tentativas.push(`photon: ${q}`);
    const p = await photon(q, (ft) => photonEhOLocal(ft, e.local, e.cidade, e.uf), displayLocal);
    if (p.tipo === 'ok') return achou(p.ponto, tentativas);
    return transitorio(p.tipo === 'indisponivel' ? p.motivo : n.motivo, tentativas);
  }

  /**
   * Embarque "UF - Cidade (Local)": tenta o local e, se não achar, cai pro ponto da cidade
   * (melhor um ponto na cidade certa do que nada).
   */
  async function embarque(e: Embarque): Promise<Resultado & { nivel: 'local' | 'cidade' | null }> {
    const tentativas: string[] = [];
    if (e.local) {
      const l = await local(e);
      tentativas.push(...l.tentativas);
      if (l.ponto) return { ...l, tentativas, nivel: 'local' };
    }
    const c = await cidade(e);
    tentativas.push(...c.tentativas);
    return { ...c, tentativas, nivel: c.ponto ? 'cidade' : null };
  }

  /**
   * CEP (Nominatim) e, se o CEP não existir lá, o ponto da cidade. Sem o Nominatim (403/429)
   * o CEP não tem alternativa: cai direto pro ponto da cidade via Photon. Falha passageira
   * (5xx/timeout) não rebaixa pra cidade: o CEP tenta de novo na próxima execução.
   */
  async function cep(
    c: { cep: string; cidade?: string; uf?: string },
    paramsNominatim: Record<string, string> = { country: 'Brazil' },
  ): Promise<Resultado & { tipo: 'cep' | 'cidade' }> {
    const cep8 = String(c.cep || '').replace(/\D/g, '');
    const tentativas: string[] = [`nominatim: cep ${cep8}`];
    const n = await nominatim({ ...paramsNominatim, postalcode: `${cep8.slice(0, 5)}-${cep8.slice(5)}` });
    if (n.tipo === 'ok') return { ...achou(n.ponto, tentativas), tipo: 'cep' };
    if (n.tipo === 'indisponivel' && !n.bloqueado) return { ...transitorio(n.motivo, tentativas), tipo: 'cep' };
    if (!c.cidade || !c.uf) {
      return { ...(n.tipo === 'nao_encontrado' ? definitivo(tentativas) : transitorio(n.motivo, tentativas)), tipo: 'cep' };
    }
    const r = await cidade({ cidade: c.cidade, uf: c.uf }, paramsNominatim);
    return { ...r, tentativas: [...tentativas, ...r.tentativas], tipo: 'cidade' };
  }

  return { nominatim, photon, cidade, local, embarque, cep, nominatimForaDoAr };
}
