// Preenche operacional_colaborador_base (endereço/coordenada usado pela
// Programação via colaborador_cruzamento) para colaboradores ativos que ainda
// não têm linha lá. Antes, essa tabela só tinha os 530 registros de um import
// único ("importar_relatorios_endereco_colaborador") — colaboradores criados
// depois nunca ganhavam endereço/coordenada. Reaproveita o mesmo padrão de
// geocodificação por CEP (Nominatim, 1 req/s) da função geocode-colaboradores,
// só que grava em operacional_colaborador_base (não em geocode_cache) e cobre
// TODOS os colaboradores ativos, não só os vinculados a O.S. ativa.
//
// A lista de pendentes (já deduplicada por nome_chave e já filtrada contra
// colisão com linhas existentes) vem da RPC geocode_colaborador_base_pendentes
// — deixar o Postgres calcular nome_chave evita reimplementar a normalização
// do trigger operacional_colaborador_base_set_updated_at() em JS (tentativa
// anterior divergiu em casos de borda e gerava duplicate key).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_USER_AGENT = 'PainelGrao1000/1.0 (tecnologia@grao1000.com.br)';
const NOMINATIM_DELAY_MS = 1100; // política de uso do Nominatim: máx. 1 req/s
const ERRO_RETRY_DIAS = 7;
const ORIGEM = 'geocode_auto_colaboradores';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function cleanStr(v: unknown): string {
  return String(v ?? '').trim();
}

function normalizeCep(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '');
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function readBody(req: Request) {
  try { return await req.json(); } catch { return {}; }
}

type GeoResult = { lat: number; lng: number; display: string } | null;

async function nominatimSearch(params: Record<string, string>): Promise<GeoResult> {
  try {
    const qs = new URLSearchParams({ ...params, country: 'Brazil', format: 'jsonv2', limit: '1' });
    const res = await fetch(`${NOMINATIM_BASE}?${qs.toString()}`, {
      headers: { 'User-Agent': NOMINATIM_USER_AGENT, 'Accept-Language': 'pt-BR' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const item = Array.isArray(data) ? data[0] : null;
    if (!item) return null;
    const lat = Number(item.lat);
    const lng = Number(item.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng, display: cleanStr(item.display_name) };
  } catch {
    return null;
  }
}

function formatCepBR(cep8: string): string {
  return `${cep8.slice(0, 5)}-${cep8.slice(5)}`;
}

type Pendente = { colaborador_id: string; cpf: string; nome: string; nome_chave: string; cep: string; cidade: string; estado: string; endereco: string; bairro: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await readBody(req);
    const limite = Math.max(1, Math.min(50, Number((body as any)?.limite) || 25));

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !serviceKey) {
      return json({ error: 'SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados na Edge Function.' }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1) Pendentes já deduplicados/filtrados pelo banco (ver RPC).
    const { data: pendentesRaw, error: pendErr } = await supabase.rpc('geocode_colaborador_base_pendentes');
    if (pendErr) throw pendErr;
    const faltantes: Pendente[] = ((pendentesRaw || []) as any[]).map((r) => ({
      colaborador_id: r.colaborador_id, cpf: r.cpf, nome: r.nome, nome_chave: r.nome_chave,
      cep: normalizeCep(r.cep), cidade: cleanStr(r.cidade), estado: cleanStr(r.estado),
      endereco: cleanStr(r.endereco), bairro: cleanStr(r.bairro),
    }));
    if (!faltantes.length) {
      return json({ faltantes: 0, geocodificados_novo: 0, gravados: 0 });
    }

    // 2) Cache existente (por CEP) — evita regeocodificar quem já foi resolvido
    // para outro colaborador com o mesmo CEP.
    const chavesNecessarias = [...new Set(faltantes.map((c) => (c.cep.length === 8 ? c.cep : `cidade:${c.cidade}|${c.estado}`)))];
    const cepKeys = chavesNecessarias.filter((k) => !k.startsWith('cidade:'));
    const { data: cacheRaw, error: cacheErr } = await supabase
      .from('geocode_cache')
      .select('chave,tipo,latitude,longitude,endereco_resolvido,status,atualizado_em')
      .in('chave', cepKeys.length ? cepKeys : ['__none__']);
    if (cacheErr) throw cacheErr;

    const limiteRetryErro = Date.now() - ERRO_RETRY_DIAS * 24 * 60 * 60 * 1000;
    const cacheOk = new Map<string, { lat: number; lng: number; display: string }>();
    const cacheErroRecente = new Set<string>();
    (cacheRaw || []).forEach((c: any) => {
      if (c.status === 'ok' && c.latitude != null && c.longitude != null) {
        cacheOk.set(c.chave, { lat: Number(c.latitude), lng: Number(c.longitude), display: c.endereco_resolvido || '' });
      } else if (c.status === 'erro') {
        const atualizadoEm = c.atualizado_em ? new Date(c.atualizado_em).getTime() : 0;
        if (atualizadoEm > limiteRetryErro) cacheErroRecente.add(c.chave);
      }
    });

    // 3) Geocodifica (até `limite` chaves novas, 1 req/s) as que faltam no cache.
    const pendentes = chavesNecessarias.filter((k) => {
      const chaveCep = k.startsWith('cidade:') ? null : k;
      return chaveCep ? (!cacheOk.has(chaveCep) && !cacheErroRecente.has(chaveCep)) : true; // cidade: sempre tenta (não tem cache dedicado)
    });

    let lastCallAt = 0;
    async function throttledSearch(params: Record<string, string>): Promise<GeoResult> {
      const wait = lastCallAt + NOMINATIM_DELAY_MS - Date.now();
      if (wait > 0) await sleep(wait);
      lastCallAt = Date.now();
      return nominatimSearch(params);
    }

    const lote = pendentes.slice(0, limite);
    let geocodificadosNovo = 0;
    for (const chave of lote) {
      if (chave.startsWith('cidade:')) {
        const [cidade, estado] = chave.slice(7).split('|');
        const resultado = await throttledSearch({ city: cidade, state: estado });
        if (resultado) {
          cacheOk.set(chave, resultado);
          geocodificadosNovo++;
        }
        continue;
      }
      const info = faltantes.find((c) => c.cep === chave);
      let resultado = await throttledSearch({ postalcode: formatCepBR(chave) });
      let tipo: 'cep' | 'cidade' = 'cep';
      if (!resultado && info?.cidade && info?.estado) {
        resultado = await throttledSearch({ city: info.cidade, state: info.estado });
        tipo = 'cidade';
      }
      const row = resultado
        ? { chave, tipo, latitude: resultado.lat, longitude: resultado.lng, endereco_resolvido: resultado.display, status: 'ok', atualizado_em: new Date().toISOString() }
        : { chave, tipo: 'cep', latitude: null, longitude: null, endereco_resolvido: null, status: 'erro', atualizado_em: new Date().toISOString() };
      const { error: upErr } = await supabase.from('geocode_cache').upsert(row, { onConflict: 'chave' });
      if (upErr) throw upErr;
      if (resultado) { cacheOk.set(chave, resultado); geocodificadosNovo++; }
    }

    // 4) Grava operacional_colaborador_base para os faltantes cuja chave já
    // está resolvida (cache antigo + o que acabou de ser geocodificado nesta
    // execução) — não só o lote geocodificado agora. nome_chave já veio
    // deduplicado da RPC, então não deve colidir; mesmo assim grava em lotes
    // pequenos para uma linha problemática não travar as demais.
    const linhas = faltantes
      .map((c) => {
        const chave = c.cep.length === 8 ? c.cep : `cidade:${c.cidade}|${c.estado}`;
        const geo = cacheOk.get(chave);
        if (!geo) return null;
        return {
          colaborador_id: c.colaborador_id,
          nome: c.nome,
          nome_chave: c.nome_chave,
          cpf: c.cpf,
          cidade_base: c.cidade || null,
          uf_base: (c.estado || '').slice(0, 2) || null,
          endereco_base: [c.endereco, c.bairro, c.cidade, c.estado].filter(Boolean).join(', ') || geo.display || null,
          latitude: geo.lat,
          longitude: geo.lng,
          ativo: true,
          origem: ORIGEM,
        };
      })
      .filter(Boolean) as any[];

    let gravados = 0;
    const falhas: { colaborador_id: string; nome: string; erro: string }[] = [];
    const TAM_LOTE_GRAVACAO = 20;
    for (let i = 0; i < linhas.length; i += TAM_LOTE_GRAVACAO) {
      const chunk = linhas.slice(i, i + TAM_LOTE_GRAVACAO);
      const { error: insErr } = await supabase.from('operacional_colaborador_base').upsert(chunk, { onConflict: 'colaborador_id' });
      if (insErr) {
        for (const row of chunk) falhas.push({ colaborador_id: row.colaborador_id, nome: row.nome, erro: insErr.message });
      } else {
        gravados += chunk.length;
      }
    }

    return json({
      faltantes: faltantes.length,
      chaves_pendentes_antes: pendentes.length,
      geocodificados_novo: geocodificadosNovo,
      gravados,
      falhas_gravacao: falhas.length,
      falhas_detalhe: falhas.slice(0, 10),
      restantes: Math.max(0, pendentes.length - lote.length),
    });
  } catch (err) {
    console.error('[geocode-colaborador-base]', err);
    return json({ error: (err as any)?.message || String(err) }, 500);
  }
});
